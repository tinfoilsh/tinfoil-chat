# Local Testing & Dev Mode

This guide covers how to run the Tinfoil webapp against a local model router for development and debugging.

## Dev Mode Overview

Dev mode bypasses the [TinfoilAI](https://github.com/tinfoilsh/tinfoil-node) client (attestation, EHBP encryption) and connects directly to a local model router via a plain OpenAI-compatible client.

### What changes in dev mode

| Concern        | Production                        | Dev mode                                           |
| -------------- | --------------------------------- | -------------------------------------------------- |
| Client         | `TinfoilAI` (attestation + EHBP)  | `OpenAI` (plain HTTPS)                             |
| API base       | `https://api.tinfoil.sh`          | `localhost:8090` via proxy                         |
| Auth           | Clerk session token               | Static API key from `.env`                         |
| Models         | Fetched from `/api/config/models` | Hardcoded in `src/config/models.ts` (`DEV_MODELS`) |
| Stream logging | Disabled                          | JSONL files written to `logs/`                     |

## Setup

### 1. Environment variables

```bash
cp .env.example .env.local
```

Set the dev flags in `.env.local`:

```env
NEXT_PUBLIC_DEV=true
NEXT_PUBLIC_DEV_API_KEY=tf-api-key
```

### 2. Start the local model router

Your model router should be running on `localhost:8090` and expose an OpenAI-compatible `/v1/chat/completions` endpoint.

_The [model router](https://github.com/tinfoilsh/confidential-model-router) does this by default in dev mode_

### 3. Run the app

**Option A: Next.js dev server** (hot reload, slower startup)

```bash
npm run dev
```

The Next.js config proxies `/api/local-router/*` to `localhost:8090` automatically.

**Option B: Static dev server** (fast, serves production build)

```bash
npm run build      # generates out/
npm run dev:serve  # serves out/ on port 3000 with API proxying
```

`dev:serve` (`scripts/dev-serve.mjs`) is a lightweight Node server that:

- Serves the static export from `out/`
- Proxies `/api/local-router/*` to `localhost:8090`
- Proxies `/api/dev/simulator` to `localhost:3001`
- Accepts stream log uploads at `POST /api/dev/stream-log`

## Adding Dev Models

Dev models are defined in `src/config/models.ts` in the `DEV_MODELS` array. To add a new model:

```ts
const DEV_MODELS: BaseModel[] = [
  {
    modelName: 'your-model-name', // must match what the router expects
    image: 'provider.webp',
    name: 'Display Name',
    nameShort: 'Short Name',
    description: 'Description',
    type: 'chat',
    chat: true,
    multimodal: true,
  },
]
```

Models can also specify a `requestParams` field.

## Stream Logging

In dev mode, every streaming response is logged as a JSONL file in `logs/`. Each file captures the full SSE event stream with timestamps:

```
logs/
  stream-a1b2c3d4-2026-04-23T14-30-00-000Z.jsonl
```

Each line is a JSON object with:

- `t` — timestamp (ms since epoch)
- `type` — `raw` | `parsed` | `tinfoil_event` | `web_search_dispatch`
- `data` — the event payload

Logs are written by the dev server (`dev:serve`) or the Next.js dev proxy. The `logs/` directory is gitignored.

## Test Prompts

**Interleaved search + thinking:**

```
Hi! Please consecutively search for the following items. After getting results
for each one, think about what you learned & also put some text.

items: cats, turtles, local news.
```

This exercises the timeline rendering with interleaved thinking blocks, web search blocks, and content blocks.
