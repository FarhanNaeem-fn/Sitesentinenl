// src/hooks/useProxy.ts
// Custom hook that surfaces the ProxyManager singleton to React components.
//
// Usage:
//   const { prefs, isEnabled, setRegion, testProxy, health } = useProxy()

import { useState, useEffect, useCallback, useRef } from 'react'
import { proxyManager }                             from '../services/proxy/ProxyManager'
import { api }                                      from '../api/client'
import type {
  ProxyPreferences,
  ProxyRegion,
  SessionType,
  ProxyProtocol,
  ProxyHealth,
  ProxyTestResponse,
  UseProxyReturn,
} from '../services/proxy/types'

export function useProxy(): UseProxyReturn {
  // Sync local state to the ProxyManager singleton
  const [prefs,      setPrefsState]  = useState<ProxyPreferences>(() => proxyManager.getPrefs())
  const [health,     setHealth]      = useState<ProxyHealth[]>(() => proxyManager.getHealth())
  const [isEnabled,  setIsEnabled]   = useState(false)
  const [isTesting,  setIsTesting]   = useState(false)
  const [testResult, setTestResult]  = useState<ProxyTestResponse | null>(null)
  const [loading,    setLoading]     = useState(false)
  const [error,      setError]       = useState<string | null>(null)

  // ── Subscribe to ProxyManager changes ─────────────────────────────────────
  useEffect(() => {
    const unsub = proxyManager.subscribe(() => {
      setPrefsState({ ...proxyManager.getPrefs() })
      setHealth([...proxyManager.getHealth()])
    })
    return unsub
  }, [])

  // ── Fetch proxy status from backend on mount ───────────────────────────────
  const refreshHealth = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const status = await api.proxyStatus()
      setIsEnabled(status.enabled)
      // Sync provider from backend into local prefs (UI display only)
      if (status.provider) {
        proxyManager.setPref('provider', status.provider)
      }
      proxyManager.updateHealth(status.health)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load proxy status'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refreshHealth() }, [refreshHealth])

  // ── Preference setters ─────────────────────────────────────────────────────
  const setPref = useCallback(
    <K extends keyof ProxyPreferences>(key: K, value: ProxyPreferences[K]) => {
      proxyManager.setPref(key, value)
    },
    [],
  )

  // ── Test proxy ─────────────────────────────────────────────────────────────
  const testProxy = useCallback(async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const result = await api.proxyTest({
        location_id:  prefs.region,
        session_type: prefs.sessionType,
      })
      setTestResult(result)
      // Refresh health data to reflect the test result
      await refreshHealth()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Proxy test failed'
      setTestResult({ success: false, error: msg })
    } finally {
      setIsTesting(false)
    }
  }, [prefs.region, prefs.sessionType, refreshHealth])

  // ── Rotate session ────────────────────────────────────────────────────────
  const rotateSession = useCallback(async (locationId: string) => {
    try {
      await api.proxyRotate(locationId)
      proxyManager.rotateSessionId(locationId)
      await refreshHealth()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Rotate failed'
      setError(msg)
    }
  }, [refreshHealth])

  return {
    isEnabled,
    prefs,
    health,
    isTesting,
    testResult,
    setPref,
    testProxy,
    rotateSession,
    refreshHealth,
    loading,
    error,
  }
}

// ── Convenience shorthand hooks ───────────────────────────────────────────────

/** Returns only whether the proxy is enabled + current region. Lightweight. */
export function useProxyRegion(): { enabled: boolean; region: ProxyRegion } {
  const [region,  setRegion]  = useState<ProxyRegion>(proxyManager.getPrefs().region)
  const [enabled, setEnabled] = useState(proxyManager.getPrefs().enabled)

  useEffect(() => {
    return proxyManager.subscribe(() => {
      const p = proxyManager.getPrefs()
      setRegion(p.region)
      setEnabled(p.enabled)
    })
  }, [])

  return { enabled, region }
}

/** Returns the health for a single location — useful in scan result cards. */
export function useLocationHealth(locationId: string): ProxyHealth | undefined {
  const [h, setH] = useState<ProxyHealth | undefined>(
    () => proxyManager.getLocationHealth(locationId),
  )
  useEffect(() => {
    return proxyManager.subscribe(() => {
      setH(proxyManager.getLocationHealth(locationId))
    })
  }, [locationId])
  return h
}
