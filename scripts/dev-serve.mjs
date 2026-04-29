#!/usr/bin/env node
/**
 * Serves the static production build (out/) with API proxying.
 *
 * Proxies:
 *   /api/local-router/* → http://localhost:8090/*
 *   /api/dev/simulator  → http://localhost:3001/api/dev/simulator
 *
 * Everything else is served from the out/ directory as static files.
 *
 * Usage:
 *   node scripts/dev-serve.mjs
 */

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 3000
const ROUTER_UPSTREAM = 'http://localhost:8090'
const SIMULATOR_UPSTREAM = 'http://localhost:3001'
const MAX_LOG_BODY_BYTES = 10 * 1024 * 1024 // 10 MB
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(PROJECT_ROOT, 'out')
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs')

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.map': 'application/json',
}

function proxyRequest(req, res, upstream) {
  const url = new URL(upstream)
  const options = {
    hostname: url.hostname,
    port: url.port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: url.host },
  }

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers)
    proxyRes.pipe(res, { end: true })
  })

  proxyReq.on('error', (err) => {
    console.error(`Proxy error → ${upstream}: ${err.message}`)
    res.writeHead(502, { 'Content-Type': 'text/plain' })
    res.end('Bad Gateway')
  })

  req.pipe(proxyReq, { end: true })
}

function serveStatic(req, res) {
  let urlPath = new URL(req.url, 'http://localhost').pathname

  // Default to index.html for directory paths
  if (urlPath.endsWith('/')) urlPath += 'index.html'

  // Try the exact path, then with .html extension
  let filePath = path.resolve(OUT_DIR, '.' + urlPath)

  // Prevent path traversal outside OUT_DIR
  if (!filePath.startsWith(path.resolve(OUT_DIR))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' })
    res.end('Forbidden')
    return
  }

  if (!fs.existsSync(filePath)) {
    // Try adding .html (Next.js static export convention)
    const withHtml = filePath + '.html'
    if (fs.existsSync(withHtml)) {
      filePath = withHtml
    } else {
      // SPA fallback: serve the chat page for unmatched routes
      const fallback = path.join(OUT_DIR, 'chat.html')
      if (fs.existsSync(fallback)) {
        filePath = fallback
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not Found')
        return
      }
    }
  }

  const ext = path.extname(filePath)
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'

  const stream = fs.createReadStream(filePath)
  res.writeHead(200, { 'Content-Type': contentType })
  stream.pipe(res)
  stream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(500)
    }
    res.end()
  })
}

const server = http.createServer((req, res) => {
  // Proxy /api/local-router/* → model router (strip the prefix)
  if (req.url.startsWith('/api/local-router/')) {
    req.url = req.url.replace('/api/local-router', '')
    proxyRequest(req, res, ROUTER_UPSTREAM)
    return
  }

  // Proxy /api/dev/simulator → dev simulator
  if (req.url.startsWith('/api/dev/simulator')) {
    proxyRequest(req, res, SIMULATOR_UPSTREAM)
    return
  }

  // Dev stream logger: receive raw chunk-level entries from the webapp
  // and write a stitched-together markdown transcript per stream to
  // logs/. The webapp logger ships per-chunk events; we string together
  // the assistant content / reasoning / tool-call arguments here so the
  // resulting file reads as one continuous conversation instead of a
  // chunk stream.
  if (req.url === '/api/dev/stream-log' && req.method === 'POST') {
    let body = ''
    let bodySize = 0
    req.on('data', (chunk) => {
      bodySize += chunk.length
      if (bodySize > MAX_LOG_BODY_BYTES) {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Payload too large' }))
        req.destroy()
        return
      }
      body += chunk
    })
    req.on('end', () => {
      if (bodySize > MAX_LOG_BODY_BYTES) return
      try {
        const { chatId, events } = JSON.parse(body)
        if (!events || !Array.isArray(events)) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing events array' }))
          return
        }

        let content = ''
        let reasoning = ''
        let toolArgs = ''
        let chunkCount = 0
        const tinfoilEvents = []
        for (const entry of events) {
          if (entry?.type === 'tinfoil_event') {
            tinfoilEvents.push(entry.data)
            continue
          }
          if (entry?.type !== 'parsed') continue
          chunkCount++
          const delta = entry.data?.choices?.[0]?.delta
          if (!delta) continue
          if (typeof delta.content === 'string') content += delta.content
          if (typeof delta.reasoning_content === 'string') {
            reasoning += delta.reasoning_content
          } else if (typeof delta.reasoning === 'string') {
            reasoning += delta.reasoning
          }
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const args = tc?.function?.arguments
              if (typeof args === 'string') toolArgs += args
            }
          }
        }

        fs.mkdirSync(LOGS_DIR, { recursive: true })
        const id = chatId ? String(chatId).slice(0, 8) : 'unknown'
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = `stream-${id}-${timestamp}.md`
        const filepath = path.join(LOGS_DIR, filename)

        let out = `# Stream ${chatId || 'unknown'}\n\n`
        out += `chunks: ${chunkCount}, content: ${content.length} chars, reasoning: ${reasoning.length} chars, tool_args: ${toolArgs.length} chars, tinfoil_events: ${tinfoilEvents.length}\n\n`
        if (reasoning) out += `## Reasoning\n\n${reasoning}\n\n`
        if (toolArgs) {
          out += `## Tool call arguments (concatenated)\n\n\`\`\`\n${toolArgs}\n\`\`\`\n\n`
        }
        if (tinfoilEvents.length > 0) {
          out += `## Tinfoil events\n\n`
          for (const event of tinfoilEvents) {
            out += '```json\n' + JSON.stringify(event, null, 2) + '\n```\n\n'
          }
        }
        out += `## Assistant content\n\n${content || '_(empty)_'}\n`

        fs.writeFileSync(filepath, out, 'utf-8')
        console.log(
          `  Stream log: ${filename} (${content.length} chars assistant content)`,
        )
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ file: filename, chars: content.length }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // Everything else: static files
  serveStatic(req, res)
})

server.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}`)
  console.log(`  Static files: ${OUT_DIR}`)
  console.log(`  Proxy: /api/local-router/* → ${ROUTER_UPSTREAM}`)
  console.log(`  Proxy: /api/dev/simulator  → ${SIMULATOR_UPSTREAM}`)
})
