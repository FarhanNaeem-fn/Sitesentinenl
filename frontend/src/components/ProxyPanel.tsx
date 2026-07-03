// src/components/ProxyPanel.tsx
// Self-contained UI panel for proxy configuration.
// Drop it anywhere in the app — it wires to the ProxyManager singleton via useProxy().
//
//   import { ProxyPanel } from './components/ProxyPanel'
//   <ProxyPanel />        — collapsible compact panel
//   <ProxyPanel expanded />  — start open
//   <ProxyPanel minimal />   — just the toggle + region selector, no health table

import { useState } from 'react'
import { useProxy }  from '../hooks/useProxy'
import {
  REGION_META,
  CONTINENTS,
  PROVIDER_INFO,
}                    from '../services/proxy/proxyConfig'
import type { ProxyRegion, SessionType, ProxyProtocol } from '../services/proxy/types'

// ── Colours (matches the BugEater dark-gold theme from index.css) ─────────────
const G   = '#F5A623'
const GRN = '#22C55E'
const RED = '#EF4444'
const BLU = '#3B82F6'
const DIM = '#484F58'

// ── Sub-components ────────────────────────────────────────────────────────────

function Dot({ ok }: { ok: boolean | undefined }) {
  const color = ok === undefined ? G : ok ? GRN : RED
  return (
    <span
      style={{
        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
        background: color, boxShadow: `0 0 6px ${color}66`,
        flexShrink: 0,
      }}
    />
  )
}

function Pill({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700,
        cursor: 'pointer', border: '1px solid',
        background: active ? `${G}18` : 'transparent',
        color:      active ? G      : DIM,
        borderColor: active ? `${G}44` : '#30363D',
        transition: 'all .15s',
      }}>
      {label}
    </button>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface ProxyPanelProps {
  /** Start the panel expanded. Default: false */
  expanded?: boolean
  /** Minimal mode — only shows enable toggle + region selector. Default: false */
  minimal?: boolean
}

export function ProxyPanel({ expanded: initExpanded = false, minimal = false }: ProxyPanelProps) {
  const {
    isEnabled, prefs, health, isTesting, testResult,
    setPref, testProxy, rotateSession, refreshHealth, loading, error,
  } = useProxy()

  const [open,         setOpen]        = useState(initExpanded)
  const [continent,    setContinent]   = useState<string | null>(null)

  const provider  = PROVIDER_INFO.find(p => p.id === prefs.provider)
  const regions   = continent
    ? REGION_META.filter(r => r.continent === continent)
    : REGION_META

  return (
    <div
      className="be-card"
      style={{ border: `1px solid ${prefs.enabled ? `${G}44` : '#30363D'}`, overflow: 'hidden' }}>

      {/* ── Header row ──────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
        style={{ borderBottom: open ? '1px solid #30363D' : 'none' }}>

        {/* Enable toggle */}
        <button
          onClick={e => { e.stopPropagation(); setPref('enabled', !prefs.enabled) }}
          style={{
            width: 36, height: 20, borderRadius: 10, flexShrink: 0,
            background: prefs.enabled ? G : '#30363D',
            border: 'none', cursor: 'pointer', position: 'relative',
            transition: 'background .2s',
          }}>
          <span style={{
            position: 'absolute', top: 3,
            left: prefs.enabled ? 18 : 3,
            width: 14, height: 14, borderRadius: '50%', background: '#fff',
            transition: 'left .2s',
          }} />
        </button>

        <span style={{ fontSize: 14 }}>📡</span>

        <div className="flex-1 min-w-0">
          <p className="font-display font-700 text-[13px]" style={{ color: prefs.enabled ? G : '#888' }}>
            Residential Proxy
          </p>
          {prefs.enabled && (
            <p className="font-body text-[10px] truncate" style={{ color: DIM }}>
              {provider?.name ?? prefs.provider}
              {' · '}
              {REGION_META.find(r => r.id === prefs.region)?.flag}
              {' '}
              {REGION_META.find(r => r.id === prefs.region)?.label}
              {' · '}
              {prefs.sessionType}
            </p>
          )}
        </div>

        {/* Backend status dot */}
        {!loading && <Dot ok={isEnabled} />}
        {loading  && <span className="font-mono text-[10px]" style={{ color: DIM }}>…</span>}

        <span style={{ color: DIM, fontSize: 11, marginLeft: 4 }}>
          {open ? '▲' : '▼'}
        </span>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      {open && (
        <div className="flex flex-col gap-4 p-4">

          {/* Backend provider status */}
          {!isEnabled && (
            <div className="flex items-center gap-2 p-3 rounded-lg"
                 style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <span style={{ fontSize: 16 }}>⚠</span>
              <div>
                <p className="font-display font-700 text-[11px]" style={{ color: RED }}>
                  No provider configured on backend
                </p>
                <p className="font-body text-[10px] mt-0.5" style={{ color: DIM }}>
                  Set ACTIVE_PROXY_PROVIDER in backend/.env and restart the server.
                </p>
              </div>
            </div>
          )}

          {error && (
            <p className="font-body text-[11px]" style={{ color: RED }}>{error}</p>
          )}

          {!minimal && (
            <>
              {/* ── Session type ───────────────────────────────────────── */}
              <div>
                <p className="font-display font-700 text-[10px] uppercase tracking-widest mb-2" style={{ color: DIM }}>
                  Session Type
                </p>
                <div className="flex gap-2">
                  {(['rotating', 'sticky'] as SessionType[]).map(t => (
                    <Pill key={t} label={t} active={prefs.sessionType === t}
                          onClick={() => setPref('sessionType', t)} />
                  ))}
                </div>
                <p className="font-body text-[10px] mt-1" style={{ color: DIM }}>
                  {prefs.sessionType === 'sticky'
                    ? 'Same exit IP throughout the scan (recommended for session-aware sites).'
                    : 'Fresh IP per request — higher anonymity.'}
                </p>
              </div>

              {/* ── Protocol ───────────────────────────────────────────── */}
              <div>
                <p className="font-display font-700 text-[10px] uppercase tracking-widest mb-2" style={{ color: DIM }}>
                  Protocol
                </p>
                <div className="flex gap-2">
                  {(['http', 'socks5'] as ProxyProtocol[]).map(p => (
                    <Pill key={p} label={p.toUpperCase()} active={prefs.protocol === p}
                          onClick={() => setPref('protocol', p)} />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Region selector ──────────────────────────────────────────── */}
          <div>
            <p className="font-display font-700 text-[10px] uppercase tracking-widest mb-2" style={{ color: DIM }}>
              Target Region
            </p>

            {/* Continent filter */}
            <div className="flex flex-wrap gap-1 mb-2">
              <Pill label="All" active={!continent} onClick={() => setContinent(null)} />
              {CONTINENTS.map(c => (
                <Pill key={c} label={c} active={continent === c}
                      onClick={() => setContinent(continent === c ? null : c)} />
              ))}
            </div>

            {/* Location grid */}
            <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))' }}>
              {regions.map(r => {
                const sel = prefs.region === r.id
                const h   = health.find(x => x.locationId === r.id)
                return (
                  <button
                    key={r.id}
                    onClick={() => setPref('region', r.id as ProxyRegion)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 8px', borderRadius: 8, cursor: 'pointer',
                      background: sel ? `${G}12` : '#161B22',
                      border: `1px solid ${sel ? `${G}44` : '#21262D'}`,
                      boxShadow: sel ? `0 0 10px ${G}22` : 'none',
                      transition: 'all .12s',
                    }}>
                    <span style={{ fontSize: 16, lineHeight: 1 }}>{r.flag}</span>
                    <div style={{ textAlign: 'left', minWidth: 0 }}>
                      <p className="font-display font-700 text-[10px] truncate"
                         style={{ color: sel ? '#F0F0F0' : '#888' }}>
                        {r.label}
                      </p>
                      <p className="font-body text-[9px]" style={{ color: DIM }}>
                        {r.countryCode}
                      </p>
                    </div>
                    {h && <Dot ok={h.isHealthy} />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Test + rotate row ─────────────────────────────────────────── */}
          {!minimal && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={testProxy}
                disabled={isTesting || !isEnabled}
                style={{
                  padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  cursor: isTesting || !isEnabled ? 'not-allowed' : 'pointer',
                  background: isTesting ? 'rgba(59,130,246,0.08)' : `${BLU}14`,
                  color: BLU, border: `1px solid ${BLU}44`,
                  opacity: !isEnabled ? 0.5 : 1,
                }}>
                {isTesting ? '⏳ Testing…' : '⚡ Test Proxy'}
              </button>

              <button
                onClick={refreshHealth}
                style={{
                  padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', background: `${G}10`, color: G, border: `1px solid ${G}30`,
                }}>
                🔄 Refresh
              </button>
            </div>
          )}

          {/* ── Test result ──────────────────────────────────────────────── */}
          {testResult && (
            <div
              style={{
                padding: 10, borderRadius: 8,
                background: testResult.success ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                border: `1px solid ${testResult.success ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
              }}>
              {testResult.success ? (
                <div className="flex flex-col gap-1">
                  <p className="font-display font-700 text-[11px]" style={{ color: GRN }}>
                    ✓ Proxy connected
                  </p>
                  <p className="font-mono text-[10px]" style={{ color: '#C9D1D9' }}>
                    Exit IP: <strong>{testResult.exitIp}</strong>
                    {' · '}
                    {testResult.responseMs}ms
                    {' · '}
                    {testResult.provider}
                  </p>
                  {/* CF Worker extra metadata */}
                  {testResult.cfColo && (
                    <p className="font-mono text-[10px]" style={{ color: '#8B949E' }}>
                      CF PoP: <strong style={{ color: '#F0F0F0' }}>
                        {testResult.cfColo}
                      </strong>
                      {testResult.cfCity && ` · ${testResult.cfCity}`}
                      {testResult.cfCountry && ` (${testResult.cfCountry})`}
                    </p>
                  )}
                  {testResult.note && (
                    <p className="font-body text-[10px]" style={{ color: '#F59E0B' }}>
                      ⚠ {testResult.note}
                    </p>
                  )}
                </div>
              ) : (
                <p className="font-display font-700 text-[11px]" style={{ color: RED }}>
                  ✗ {testResult.error ?? 'Connection failed'}
                </p>
              )}
            </div>
          )}

          {/* ── Health table ─────────────────────────────────────────────── */}
          {!minimal && health.length > 0 && (
            <div>
              <p className="font-display font-700 text-[10px] uppercase tracking-widest mb-2" style={{ color: DIM }}>
                Proxy Health
              </p>
              <div className="overflow-x-auto">
                <table className="be-table" style={{ fontSize: 10 }}>
                  <thead>
                    <tr>
                      <th>Location</th>
                      <th>Success %</th>
                      <th>Avg ms</th>
                      <th>Last IP</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {health.map(h => (
                      <tr key={h.locationId}>
                        <td style={{ color: '#C9D1D9', fontWeight: 600 }}>
                          {REGION_META.find(r => r.id === h.locationId)?.flag}
                          {' '}
                          {REGION_META.find(r => r.id === h.locationId)?.label ?? h.locationId}
                        </td>
                        <td style={{ color: h.successRate >= 70 ? GRN : h.successRate >= 40 ? G : RED, fontWeight: 700 }}>
                          {h.successRate}%
                        </td>
                        <td style={{ fontFamily: '"JetBrains Mono",monospace' }}>
                          {h.avgResponseMs > 0 ? `${h.avgResponseMs}ms` : '—'}
                        </td>
                        <td style={{ fontFamily: '"JetBrains Mono",monospace', color: '#8B949E' }}>
                          {h.lastIp ?? '—'}
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '1px 6px', borderRadius: 999, fontSize: 9, fontWeight: 700,
                            background: h.isHealthy ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            color:      h.isHealthy ? GRN : RED,
                            border: `1px solid ${h.isHealthy ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                          }}>
                            {h.isHealthy ? '✓ OK' : '✗ Unhealthy'}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => rotateSession(h.locationId)}
                            title="Rotate sticky session"
                            style={{
                              background: 'none', border: 'none',
                              color: DIM, cursor: 'pointer', fontSize: 11,
                            }}>
                            ↺
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Provider recommendation box ───────────────────────────────── */}
          {!minimal && !isEnabled && (
            <details style={{ marginTop: 4 }}>
              <summary
                className="font-display font-700 text-[11px] cursor-pointer"
                style={{ color: G }}>
                Recommended providers for UAE &amp; KSA
              </summary>
              <div className="flex flex-col gap-2 mt-3">
                {PROVIDER_INFO.filter(p => p.uaeStrong || p.ksaStrong).map(p => (
                  <div key={p.id}
                       style={{
                         padding: '8px 10px', borderRadius: 8,
                         background: '#161B22', border: '1px solid #21262D',
                       }}>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-display font-700 text-[12px]" style={{ color: '#F0F0F0' }}>
                        {p.name}
                      </p>
                      {p.uaeStrong && (
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 999,
                                       background: `${GRN}10`, color: GRN, border: `1px solid ${GRN}30` }}>
                          🇦🇪 UAE ✓
                        </span>
                      )}
                      {p.ksaStrong && (
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 999,
                                       background: `${GRN}10`, color: GRN, border: `1px solid ${GRN}30` }}>
                          🇸🇦 KSA ✓
                        </span>
                      )}
                    </div>
                    <p className="font-body text-[10px]" style={{ color: DIM }}>
                      {p.features.join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}

        </div>
      )}
    </div>
  )
}

export default ProxyPanel
