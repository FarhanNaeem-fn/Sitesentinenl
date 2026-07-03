interface ImportMetaEnv {
  readonly VITE_PROXY_URL: string
  readonly VITE_API_KEY: string
  readonly VITE_API_BASE_URL: string
  readonly VITE_PROXY_RATE_LIMIT_RPM: string
  readonly VITE_PROXY_TIMEOUT_MS: string
  readonly VITE_PROXY_MAX_RETRIES: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}