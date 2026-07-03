// src/services/proxy/types.ts
// Complete type surface for the SiteSentinel proxy system.

// ── Enumerations ─────────────────────────────────────────────────────────────

export type ProxyProtocol  = 'http' | 'https' | 'socks5'
export type SessionType    = 'rotating' | 'sticky'
export type ProxyProvider  = 'cloudflare' | 'brightdata' | 'oxylabs' | 'dataimpulse' | 'iproyal' | 'decodo' | 'none'

/**
 * Every location ID the backend understands.
 * Keep in sync with proxy_manager.py  LOCATION_MAP keys.
 */
export type ProxyRegion =
  | 'ae-dubai'
  | 'sa-riyadh'
  | 'sa-jeddah'
  | 'kw-kuwait'
  | 'om-muscat'
  | 'iq-baghdad'
  | 'pk-karachi'
  | 'in-mumbai'
  | 'in-bangalore'
  | 'uk-london'
  | 'de-frankfurt'
  | 'fr-paris'
  | 'nl-amsterdam'
  | 'us-new-york'
  | 'us-california'
  | 'ca-toronto'
  | 'sg-singapore'
  | 'jp-tokyo'
  | 'au-sydney'

// ── UI metadata for each region ───────────────────────────────────────────────

export interface RegionMeta {
  id:          ProxyRegion
  label:       string
  flag:        string
  countryCode: string
  city:        string
  continent:   string
}

// ── Proxy preferences (what the frontend stores and sends to backend) ─────────

export interface ProxyPreferences {
  enabled:     boolean
  provider:    ProxyProvider
  region:      ProxyRegion
  sessionType: SessionType
  protocol:    ProxyProtocol
  maxRetries:  number
  timeoutMs:   number
}

// ── Health / stats ────────────────────────────────────────────────────────────

export interface ProxyHealth {
  locationId:           string
  successCount:         number
  failureCount:         number
  successRate:          number    // 0–100
  consecutiveFailures:  number
  isHealthy:            boolean
  lastIp:               string | null
  avgResponseMs:        number
}

/** Extra metadata returned by CF Worker results (multi-location + proxy test) */
export interface CfMeta {
  cfColo:    string    // IATA code, e.g. "DXB"
  cfCity:    string    // e.g. "Dubai"
  cfCountry: string    // ISO-2, e.g. "AE"
  cfRegion:  string    // e.g. "Middle East"
}

// ── Backend responses ─────────────────────────────────────────────────────────

export interface ProxyStatusResponse {
  enabled:  boolean
  provider: ProxyProvider | null
  health:   ProxyHealth[]
}

export interface ProxyTestResponse {
  success:     boolean
  exitIp?:     string
  responseMs?: number
  provider?:   string
  locationId?: string
  error?:      string
  // CF Worker specific
  cfColo?:     string
  cfCity?:     string
  cfCountry?:  string
  cfRegion?:   string
  note?:       string
}

export interface ProxyRotateResponse {
  locationId:    string
  newSessionId:  string
}

// ── Axios-layer types (axiosProxy.ts) ────────────────────────────────────────

export interface ProxiedRequestConfig {
  /** Attach proxy prefs to this backend API request */
  withProxy?: boolean
  /** Override the active region just for this request */
  proxyRegion?: ProxyRegion
  /** How many times to retry on proxy failure */
  proxyRetries?: number
}

// Internal metadata stored on Axios config for interceptors
export interface _ProxyMeta {
  _proxyRegion?:   ProxyRegion
  _proxyRetries?:  number
  _retryCount?:    number
}

// ── Rate limiter config ───────────────────────────────────────────────────────

export interface RateLimitConfig {
  maxRequestsPerMinute: number
  minDelayBetweenMs:    number
}

// ── Hook return type ──────────────────────────────────────────────────────────

export interface UseProxyReturn {
  /** Whether the backend has a proxy provider configured */
  isEnabled:    boolean
  /** Current active preferences */
  prefs:        ProxyPreferences
  /** Health data per location from the backend */
  health:       ProxyHealth[]
  /** Whether a proxy test is in flight */
  isTesting:    boolean
  /** Result from the last proxy test */
  testResult:   ProxyTestResponse | null
  /** Change a preference field */
  setPref:      <K extends keyof ProxyPreferences>(key: K, value: ProxyPreferences[K]) => void
  /** Run a connectivity test for the current region */
  testProxy:    () => Promise<void>
  /** Force a new sticky session for a location */
  rotateSession:(locationId: string) => Promise<void>
  /** Reload health data from the backend */
  refreshHealth:() => Promise<void>
  /** Backend health-check loading state */
  loading:      boolean
  error:        string | null
}
