/**
 * Tinfoil AI SDK provider.
 *
 * Builds an `@ai-sdk/openai-compatible` provider that routes requests through
 * a verified Tinfoil `SecureClient` (HPKE/TLS-pinned fetch) and authenticates
 * with an ephemeral session token. The provider is memoized until the session
 * token or underlying secure client resets; on `AuthenticationError` the
 * caller is expected to call `resetTinfoilAISdk()` and retry.
 *
 * The fetch passed to the provider is wrapped by the Tinfoil SSE pre-parser so
 * non-OpenAI events (web search, URL fetches, url_citation annotations, inline
 * `<think>` tags) are peeled off into a side-channel before the AI SDK parses
 * the stream.
 */
import { logError } from '@/utils/error-handling'
import type {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleProvider,
} from '@ai-sdk/openai-compatible'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { SecureClient } from 'tinfoil'
import { fetchSessionToken, resetTinfoilClient } from './tinfoil-client'
import {
  createTinfoilSidechannel,
  wrapFetchWithTinfoilPreparser,
  type TinfoilSidechannel,
} from './tinfoil-sse-preparser'

let secureClientPromise: Promise<SecureClient> | null = null

async function getSecureClient(): Promise<SecureClient> {
  if (!secureClientPromise) {
    const client = new SecureClient()
    secureClientPromise = client
      .ready()
      .then(() => client)
      .catch((err) => {
        // Allow subsequent attempts after a failed attestation.
        secureClientPromise = null
        throw err
      })
  }
  return secureClientPromise
}

export interface TinfoilProviderHandle {
  provider: OpenAICompatibleProvider<string, string, string, string>
  sidechannel: TinfoilSidechannel
  /**
   * Create a chat model for the given model name.
   */
  chat: (modelName: string) => OpenAICompatibleChatLanguageModel
}

/**
 * Get (or build) a Tinfoil-backed Vercel AI SDK provider.
 *
 * A new provider is constructed per call so each request has a dedicated
 * side-channel for Tinfoil-specific events and a fresh apiKey closure. The
 * underlying `SecureClient` is memoized — attestation only runs once per page
 * load unless `resetTinfoilAISdk()` is invoked.
 */
export async function getTinfoilAISdk(): Promise<TinfoilProviderHandle> {
  const secureClient = await getSecureClient()
  const apiKey = await fetchSessionToken()
  const sidechannel = createTinfoilSidechannel()

  const wrappedFetch = wrapFetchWithTinfoilPreparser(
    secureClient.fetch,
    sidechannel,
  )

  const provider = createOpenAICompatible({
    name: 'tinfoil',
    baseURL: secureClient.getBaseURL()!,
    apiKey,
    fetch: wrappedFetch,
  })

  return {
    provider,
    sidechannel,
    chat: (modelName: string) =>
      provider.chatModel(modelName) as OpenAICompatibleChatLanguageModel,
  }
}

/**
 * Force re-attestation on the next `getTinfoilAISdk()` call.
 *
 * Called after auth errors, signout, or when the session token is rotated so
 * the next provider build fetches a fresh token and rebuilds the secure
 * transport if needed.
 */
export function resetTinfoilAISdk(): void {
  secureClientPromise = null
  try {
    // Keep the legacy client in sync so embeddings/audio/etc. also refresh.
    resetTinfoilClient()
  } catch (err) {
    logError('Failed to reset legacy tinfoil client during ai-sdk reset', err, {
      component: 'tinfoil-ai-sdk',
      action: 'resetTinfoilAISdk',
    })
  }
}
