import { TINFOIL_COLORS } from '@/theme/colors'
import { logError } from '@/utils/error-handling'
import { useEffect, useState } from 'react'
import remarkGfm from 'remark-gfm'

interface PluginState {
  remarkPlugins: any[]
  rehypePlugins: any[]
  loaded: boolean
}

// Module-level cache for stable plugin references
// This ensures all components share the same plugin arrays
let cachedPlugins: PluginState | null = null
let loadingPromise: Promise<PluginState> | null = null

// Pre-computed stable arrays for initial state
const INITIAL_REMARK_PLUGINS: any[] = [remarkGfm]
const INITIAL_REHYPE_PLUGINS: any[] = []

async function loadPlugins(): Promise<PluginState> {
  if (cachedPlugins) {
    return cachedPlugins
  }

  if (loadingPromise) {
    return loadingPromise
  }

  loadingPromise = Promise.all([
    import('remark-math'),
    import('rehype-katex'),
    import('remark-breaks'),
  ])
    .then(([remarkMathMod, rehypeKatexMod, remarkBreaksMod]) => {
      cachedPlugins = {
        remarkPlugins: [
          [
            remarkMathMod.default,
            {
              singleDollarTextMath: false,
            },
          ],
          remarkGfm,
          remarkBreaksMod.default,
        ],
        rehypePlugins: [
          [
            rehypeKatexMod.default,
            {
              throwOnError: false,
              strict: false,
              output: 'htmlAndMathml',
              errorColor: TINFOIL_COLORS.utility.destructive,
              trust: false,
            },
          ],
        ],
        loaded: true,
      }
      return cachedPlugins
    })
    .catch((error) => {
      logError('Failed to load markdown plugins', error, {
        component: 'useMathPlugins',
        action: 'loadPlugins',
        metadata: {
          plugins: ['remark-math', 'rehype-katex', 'remark-breaks'],
        },
      })
      // Return initial plugins on error
      return {
        remarkPlugins: INITIAL_REMARK_PLUGINS,
        rehypePlugins: INITIAL_REHYPE_PLUGINS,
        loaded: false,
      }
    })

  return loadingPromise
}

// Start loading immediately when this module is imported
if (typeof window !== 'undefined') {
  loadPlugins()
}

export function useMathPlugins() {
  const [plugins, setPlugins] = useState<PluginState>(() => {
    // If already loaded, use cached plugins immediately
    if (cachedPlugins) {
      return cachedPlugins
    }
    return {
      remarkPlugins: INITIAL_REMARK_PLUGINS,
      rehypePlugins: INITIAL_REHYPE_PLUGINS,
      loaded: false,
    }
  })

  useEffect(() => {
    // If already loaded (from cache), no need to do anything
    if (plugins.loaded) {
      return
    }

    let mounted = true

    loadPlugins().then((loadedPlugins) => {
      if (mounted && !plugins.loaded) {
        setPlugins(loadedPlugins)
      }
    })

    return () => {
      mounted = false
    }
  }, [plugins.loaded])

  return plugins
}
