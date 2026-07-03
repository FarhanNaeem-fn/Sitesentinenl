// src/services/proxy/axiosProxy.ts
// Axios instance wired with:
//   • Request interceptor  — attaches proxy preferences to backend API calls
//   • Response interceptor — retries on transient failures, rotates session on proxy error
//   • Logging of proxy headers and response times
//
// IMPORTANT: This file requires the `axios` package.
//   Install: npm install axios
//   (The rest of the app uses native fetch and is unaffected.)
//
// Architecture note:
//   The Axios instance talks to OUR FastAPI backend only.
//   Proxy credentials are NEVER sent from the browser.
//   We send { use_proxy: true, proxy_session_type: "rotating" } in the
//   request body; the backend resolves the actual proxy URL from its .env.

import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
  type AxiosError,
} from 'axios'
import { proxyManager } from './ProxyManager'
import type { ProxyRegion, _ProxyMeta } from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' &&
   (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? '/api'
     : 'https://sitesentinel-hkvtad10a-farhaan.vercel.app' )

const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_PROXY_TIMEOUT_MS) || 30_000
const MAX_RETRIES        = Number(import.meta.env.VITE_PROXY_MAX_RETRIES) || 3

// HTTP status codes worth retrying
const RETRYABLE_STATUS = new Set([408, 429, 502, 503, 504])
// Network error codes that indicate a proxy/connectivity issue
const PROXY_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET',
  'ERR_NETWORK',  'ERR_BAD_RESPONSE',
])

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a proxied Axios instance.
 *
 *   const client = createProxiedAxios()
 *
 *   // Automatically attaches proxy prefs from the active ProxyManager:
 *   const { data } = await client.post('/scan/multi-location', { url, locations })
 *
 *   // Or target a specific region for this request:
 *   const { data } = await client.post('/scan/qa', body, {
 *     proxyRegion:  'sa-riyadh',
 *     proxyRetries: 5,
 *   } as AxiosRequestConfig & ProxiedRequestConfig)
 */
export function createProxiedAxios(options?: {
  baseURL?:    string
  timeoutMs?:  number
  maxRetries?: number
}): AxiosInstance {
  const instance = axios.create({
    baseURL: options?.baseURL  ?? BASE_URL,
    timeout: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json' },
  })

  // ── REQUEST INTERCEPTOR ───────────────────────────────────────────────────
  instance.interceptors.request.use(
    (config: InternalAxiosRequestConfig & _ProxyMeta) => {
      const prefs = proxyManager.getPrefs()

      // Stash proxy metadata on the config object for the response interceptor
      config._proxyRegion  = (config as any).proxyRegion ?? prefs.region
      config._proxyRetries = (config as any).proxyRetries ?? (options?.maxRetries ?? MAX_RETRIES)
      config._retryCount   = config._retryCount ?? 0

      // Merge proxy fields into JSON body when applicable
      if (
        prefs.enabled &&
        config.data &&
        typeof config.data === 'string'
      ) {
        try {
          const body = JSON.parse(config.data)
          // Only inject if the body looks like a scan request (has 'url' or 'locations')
          if ('url' in body || 'locations' in body) {
            Object.assign(body, proxyManager.scanPayload())
            config.data = JSON.stringify(body)
          }
        } catch {
          // Non-JSON body — leave untouched
        }
      }

      // Log (dev only)
      if (import.meta.env.DEV) {
        const method = config.method?.toUpperCase() ?? 'GET'
        console.debug(
          `[ProxiedAxios] ${method} ${config.url}`,
          prefs.enabled
            ? `via ${prefs.region} (${prefs.sessionType})`
            : '(direct)',
        )
      }

      return config
    },
    (error: unknown) => Promise.reject(error),
  )

  // ── RESPONSE INTERCEPTOR ──────────────────────────────────────────────────
  instance.interceptors.response.use(
    (response: AxiosResponse) => {
      // Log exit IP if backend echoes it (from /proxy/test)
      const exitIp = response.data?.exit_ip
      if (exitIp && import.meta.env.DEV) {
        console.debug(`[ProxiedAxios] Exit IP: ${exitIp}`)
      }
      return response
    },
    async (error: AxiosError & _ProxyMeta) => {
      const config = error.config as (InternalAxiosRequestConfig & _ProxyMeta) | undefined
      if (!config) return Promise.reject(error)

      const retryCount  = config._retryCount ?? 0
      const maxRetries  = config._proxyRetries ?? MAX_RETRIES
      const region      = config._proxyRegion as ProxyRegion | undefined

      // ── Decide whether to retry ────────────────────────────────────────
      const isRetryable =
        (error.response && RETRYABLE_STATUS.has(error.response.status)) ||
        PROXY_ERROR_CODES.has((error as any).code ?? '') ||
        !error.response   // no response = network/timeout error

      if (isRetryable && retryCount < maxRetries) {
        config._retryCount = retryCount + 1

        // Rotate sticky session on proxy errors so we get a fresh exit IP
        if (region && !error.response) {
          proxyManager.rotateSessionId(region)
          if (import.meta.env.DEV) {
            console.warn(
              `[ProxiedAxios] Proxy error for ${region} — rotated session, retry ${retryCount + 1}/${maxRetries}`,
            )
          }
        }

        // Exponential back-off: 500ms, 1s, 2s …
        const delayMs = 500 * 2 ** retryCount
        await new Promise<void>(r => setTimeout(r, delayMs))

        return instance.request(config)
      }

      // ── Friendly error message ─────────────────────────────────────────
      const status  = error.response?.status
      const message = (error.response?.data as any)?.detail
                   ?? (error.response?.data as any)?.error
                   ?? error.message

      if (import.meta.env.DEV) {
        console.error(
          `[ProxiedAxios] Request failed${status ? ` (${status})` : ''}: ${message}`,
        )
      }

      // Rethrow with augmented message
      const augmented = new Error(
        status ? `${status} — ${message}` : message,
      ) as Error & { status?: number; originalError: AxiosError }
      augmented.status        = status
      augmented.originalError = error
      return Promise.reject(augmented)
    },
  )

  return instance
}

// ── Default singleton instance ────────────────────────────────────────────────
// Ready to use — import `proxiedAxios` wherever you need it.
export const proxiedAxios: AxiosInstance = createProxiedAxios()

// ── Convenience wrappers ──────────────────────────────────────────────────────

export async function proxiedPost<T = unknown>(
  path: string,
  body: unknown,
  region?: ProxyRegion,
): Promise<T> {
  await proxyManager.throttle()
  const { data } = await proxiedAxios.post<T>(path, body, {
    proxyRegion: region,
  } as AxiosRequestConfig)
  return data
}

export async function proxiedGet<T = unknown>(
  path: string,
  region?: ProxyRegion,
): Promise<T> {
  await proxyManager.throttle()
  const { data } = await proxiedAxios.get<T>(path, {
    proxyRegion: region,
  } as AxiosRequestConfig)
  return data
}
