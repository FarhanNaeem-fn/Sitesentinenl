// src/services/proxy/ProxyManager.ts
// Core frontend proxy manager.
//
// Responsibilities:
//   • Track proxy preferences (region, session type, protocol)
//   • Manage sticky session IDs per location
//   • Health tracking — mirrors what the backend reports
//   • Rate limiting — throttle outgoing API requests
//   • Compose the `use_proxy` payload injected into backend API calls
//
// NOT responsible for:
//   • Storing credentials (backend only)
//   • Making proxied HTTP requests (backend only — browsers can't)
//   • Talking to proxy providers directly

import type {
  ProxyPreferences,
  ProxyRegion,
  SessionType,
  ProxyProtocol,
  ProxyHealth,
  ProxyStatusResponse,
  ProxyTestResponse,
  RateLimitConfig,
} from './types'
import { DEFAULT_PREFS } from './proxyConfig'

// ── Rate limiter (token-bucket) ───────────────────────────────────────────────

class TokenBucket {
  private tokens: number
  private lastRefill: number
  private readonly maxTokens: number
  private readonly refillRatePerMs: number

  constructor({ maxRequestsPerMinute }: RateLimitConfig) {
    this.maxTokens         = maxRequestsPerMinute
    this.tokens            = maxRequestsPerMinute
    this.lastRefill        = Date.now()
    this.refillRatePerMs   = maxRequestsPerMinute / 60_000
  }

  async acquire(): Promise<void> {
    this._refill()
    if (this.tokens >= 1) {
      this.tokens -= 1
      return
    }
    // Wait until a token is available then retry
    const waitMs = Math.ceil(1 / this.refillRatePerMs)
    await new Promise<void>(r => setTimeout(r, waitMs))
    return this.acquire()
  }

  private _refill(): void {
    const now     = Date.now()
    const elapsed = now - this.lastRefill
    this.tokens   = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRatePerMs)
    this.lastRefill = now
  }
}

// ── ProxyManager ──────────────────────────────────────────────────────────────

export class ProxyManager {
  private prefs: ProxyPreferences
  private sessions: Map<string, string>   // locationId → sticky sessionId
  private healthCache: ProxyHealth[]
  private rateLimiter: TokenBucket
  private listeners: Set<() => void>

  constructor(initialPrefs?: Partial<ProxyPreferences>) {
    this.prefs       = { ...DEFAULT_PREFS, ...initialPrefs }
    this.sessions    = new Map()
    this.healthCache = []
    this.listeners   = new Set()
    this.rateLimiter = new TokenBucket({
      maxRequestsPerMinute: Number(import.meta.env.VITE_PROXY_RATE_LIMIT_RPM) || 60,
      minDelayBetweenMs:    0,
    })
  }

  // ── Preferences ────────────────────────────────────────────────────────────

  getPrefs(): Readonly<ProxyPreferences> {
    return this.prefs
  }

  setPref<K extends keyof ProxyPreferences>(
    key: K,
    value: ProxyPreferences[K],
  ): void {
    this.prefs = { ...this.prefs, [key]: value }
    this._emit()
  }

  setRegion(region: ProxyRegion):      void { this.setPref('region', region) }
  setSessionType(t: SessionType):      void { this.setPref('sessionType', t) }
  setProtocol(p: ProxyProtocol):       void { this.setPref('protocol', p) }
  setEnabled(v: boolean):              void { this.setPref('enabled', v) }

  // ── Session management ─────────────────────────────────────────────────────

  /**
   * Get the sticky session ID for a location, creating one if absent.
   * Only meaningful when sessionType === 'sticky'.
   */
  getSessionId(locationId: string): string {
    if (!this.sessions.has(locationId)) {
      this.sessions.set(locationId, this._newSessionId())
    }
    return this.sessions.get(locationId)!
  }

  /** Force a new session ID for a location (call after repeated failures). */
  rotateSessionId(locationId: string): string {
    const id = this._newSessionId()
    this.sessions.set(locationId, id)
    this._emit()
    return id
  }

  private _newSessionId(): string {
    return Math.random().toString(36).slice(2, 14)
  }

  // ── Backend payload ────────────────────────────────────────────────────────

  /**
   * Build the proxy-related fields to merge into a backend scan request.
   *
   *   const payload = { url, locations, ...pm.scanPayload() }
   *   await api.multiLocation(payload)
   */
  scanPayload(overrideRegion?: ProxyRegion): {
    use_proxy:           boolean
    proxy_session_type:  SessionType
    proxy_protocol:      ProxyProtocol
  } {
    return {
      use_proxy:          this.prefs.enabled,
      proxy_session_type: this.prefs.sessionType,
      proxy_protocol:     this.prefs.protocol,
    }
  }

  // ── Rate limiting ──────────────────────────────────────────────────────────

  /** Await this before making a proxied request to respect rate limits. */
  async throttle(): Promise<void> {
    return this.rateLimiter.acquire()
  }

  // ── Health cache ───────────────────────────────────────────────────────────

  updateHealth(health: ProxyHealth[]): void {
    this.healthCache = health
    this._emit()
  }

  getHealth(): ProxyHealth[] {
    return this.healthCache
  }

  getLocationHealth(locationId: string): ProxyHealth | undefined {
    return this.healthCache.find(h => h.locationId === locationId)
  }

  isLocationHealthy(locationId: string): boolean {
    return this.getLocationHealth(locationId)?.isHealthy ?? true
  }

  // ── Change subscription ────────────────────────────────────────────────────

  /** Subscribe to any preference or health change. Returns an unsubscribe fn. */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private _emit(): void {
    this.listeners.forEach(cb => cb())
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
// Import this directly in components that don't need the React context,
// or use ProxyContext for component trees that need reactivity.
export const proxyManager = new ProxyManager()
