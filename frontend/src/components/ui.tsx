// src/components/ui.tsx
// All shared components — BugEater dark-gold design system
import { useState, useRef, useEffect, useMemo, type ReactNode } from 'react'
import type { LogEntry } from '../api/client'

/* ── COLOR MAP ─────────────────────────────────────────────────── */
const C = {
  gold:    'var(--pro-orange)', 
  glow:    'var(--pro-orange-glow)',
  card:    'var(--card-bg)', 
  raised:  'var(--raised-bg)', 
  border:  'var(--border-dim)',
  text:    'var(--text-main)', 
  muted:   'var(--text-muted)',
  deep:    'var(--deep-bg)',
  faint:   '#484F58',
  green:   '#22C55E',
  amber:   '#F59E0B',
  red:     '#EF4444',
  bhi:     '#30363D',
} as const

/* ── CARD ──────────────────────────────────────────────────────── */
export function Card({ title, accent = 'var(--pro-orange)', children, action, className = '' }:
  { title?: string; accent?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`be-card ${className}`}>
      <div style={{ height: 3, background: `linear-gradient(90deg,${accent},${accent}33,transparent)` }} />
      {title && (
        <div className="flex items-center px-5 py-3.5 border-b border-[#30363D]">
          <span className="font-display font-800 text-[14px] text-white flex-1 tracking-tight">{title}</span>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

/* ── KPI TILE ──────────────────────────────────────────────────── */
export function KpiTile({ label, value, accent, sub }: { label: string; value: string | number; accent: string; sub?: string }) {
  return (
    <div className="be-card flex-1 min-w-0">
      <div style={{ height: 3, background: `linear-gradient(90deg,${accent},${accent}55,transparent)` }} />
      <div className="p-4">
        <p className="font-display font-700 text-[9px] uppercase tracking-[0.08em] mb-1.5" style={{ color: '#8B949E' }}>{label}</p>
        <p className="font-mono font-600 text-[26px] leading-none text-white">{value}</p>
        {sub && <p className="font-body text-[10px] mt-1 text-[#484F58]">{sub}</p>}
      </div>
    </div>
  )
}

/* ── LOG TERMINAL ──────────────────────────────────────────────── */
const LOG_C: Record<string, string> = {
  ok:'#22C55E', err:'#EF4444', warn:'#F59E0B', info:'#3B82F6', hdr:'#F0F0F0', crash:'#EF4444',
}
const LOG_L: Record<string, string> = {
  ok:'PASS', err:'FAIL', warn:'WARN', info:'INFO', hdr:'STEP', crash:'CRSH',
}

function _LogBtn({ active, color, onClick, children }: {
  active?: boolean; color?: string; onClick: () => void; children: ReactNode
}) {
  const col = color ?? '#555'
  return (
    <button onClick={onClick} style={{
      padding: '2px 9px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap',
      border: `1px solid ${active ? col : '#2A2A2A'}`,
      background: active ? `${col}18` : 'transparent',
      color: active ? col : '#555',
      fontSize: 10, fontFamily: 'inherit', transition: 'all .15s',
    }}>{children}</button>
  )
}

export function ScanStatus({
  title = 'Live Status',
  status,
  progress,
  partial,
  result,
  accent = 'var(--pro-orange)',
}: {
  title?: string
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled'
  progress: number
  partial?: any
  result?: any
  accent?: string
}) {
  const summaryLines: Array<{ label: string; value: string | number }> = []
  const live = partial || result || {}

  if (status === 'running') {
    if (live.stage) summaryLines.push({ label: 'Current stage', value: live.stage })
    if (typeof live.checked === 'number' && typeof live.checks_total === 'number') {
      summaryLines.push({ label: 'Checks', value: `${live.checked}/${live.checks_total}` })
    }
    if (typeof live.pages_scanned === 'number') summaryLines.push({ label: 'Pages scanned', value: live.pages_scanned })
    if (typeof live.total_issues === 'number') summaryLines.push({ label: 'Issues found', value: live.total_issues })
    if (typeof live.health_score === 'number') summaryLines.push({ label: 'Health score', value: `${live.health_score}/100` })
  }

  if (status === 'done') {
    if (typeof result?.health_score === 'number') summaryLines.push({ label: 'Health score', value: `${result.health_score}/100` })
    if (typeof result?.pages_scanned === 'number') summaryLines.push({ label: 'Pages scanned', value: result.pages_scanned })
    if (typeof result?.total_issues === 'number') summaryLines.push({ label: 'Issues found', value: result.total_issues })
  }

  if (status === 'error') {
    if (result?.error) summaryLines.push({ label: 'Error', value: result.error })
  }

  return (
    <div className="be-card overflow-hidden" style={{ border: `1px solid ${accent}22` }}>
      <div style={{ height: 3, background: `linear-gradient(90deg,${accent},${accent}33,transparent)` }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="font-display font-700 text-[13px] text-white">{title}</p>
            <p className="font-body text-[11px] text-[#8B949E] mt-1">
              {status === 'idle' && 'Ready to run the scan and display incremental results.'}
              {status === 'running' && 'Progressively rendering scan output as it arrives.'}
              {status === 'done' && 'Scan complete — displaying the final result overview.'}
              {status === 'error' && 'An error occurred while running the scan.'}
              {status === 'cancelled' && 'Scan was cancelled.'}
            </p>
          </div>
          <span className="font-mono font-700 text-[11px] py-1 px-2 rounded-full"
                style={{ background: `${accent}15`, color: accent, border: `1px solid ${accent}33` }}>
            {status === 'idle' ? 'Idle' : status === 'running' ? 'Running' : status === 'done' ? 'Done' : status === 'error' ? 'Error' : 'Cancelled'}
          </span>
        </div>

        {status === 'running' && (
          <div className="mb-4">
            <div className="h-2 rounded-full overflow-hidden" style={{ background: '#161B22' }}>
              <div style={{ width: `${Math.max(2, progress)}%`, height: 8, background: accent, transition: 'width 0.3s ease' }} />
            </div>
            <div className="mt-2 text-[11px] text-[#8B949E]">{Math.round(progress)}% complete</div>
          </div>
        )}

        {(status === 'running' || status === 'done' || status === 'error') && summaryLines.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {summaryLines.map(line => (
              <div key={line.label} className="rounded-xl border border-[#21262D] bg-[#0D1117] p-3">
                <p className="text-[11px] text-[#8B949E] mb-1">{line.label}</p>
                <p className="font-mono font-700 text-[13px] text-white">{line.value}</p>
              </div>
            ))}
          </div>
        )}

        {status === 'running' && summaryLines.length === 0 && (
          <div className="rounded-xl border border-[#21262D] bg-[#0D1117] p-4 text-[12px] text-[#8B949E]">
            Collecting live scan data…
          </div>
        )}
      </div>
    </div>
  )
}

export function LogTerminal({ logs, accent = 'var(--pro-orange)', title = 'Output' }:
  { logs: LogEntry[]; height?: string; accent?: string; title?: string }) {

  const scrollRef     = useRef<HTMLDivElement>(null)
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userScrolling = useRef(false)
  const [search,     setSearch]     = useState('')
  const [filter,     setFilter]     = useState('all')
  const [expanded,   setExpanded]   = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [sliderVal,  setSliderVal]  = useState(100)
  const [copied,     setCopied]     = useState(false)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return logs
      .filter(l => filter === 'all' || l.level === filter)
      .filter(l => !q || l.msg.toLowerCase().includes(q) || l.ts.toLowerCase().includes(q))
  }, [logs, filter, search])

  const counts = useMemo(() => ({
    all:  logs.length,
    ok:   logs.filter(l => l.level === 'ok').length,
    err:  logs.filter(l => l.level === 'err' || l.level === 'crash').length,
    warn: logs.filter(l => l.level === 'warn').length,
    info: logs.filter(l => l.level === 'info').length,
    hdr:  logs.filter(l => l.level === 'hdr').length,
  }), [logs])

  const markers = useMemo(() => {
    const n = filtered.length
    if (!n) return []
    return filtered
      .map((l, i) => ({ pct: (i / (n - 1 || 1)) * 100, level: l.level }))
      .filter(m => m.level === 'err' || m.level === 'crash' || m.level === 'warn' || m.level === 'hdr')
  }, [filtered])

  useEffect(() => {
    if (autoScroll && scrollRef.current && !userScrolling.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      setSliderVal(100)
    }
  }, [filtered, autoScroll])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    userScrolling.current = true
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { userScrolling.current = false }, 320)
    const pct = el.scrollHeight <= el.clientHeight
      ? 100
      : Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100)
    setSliderVal(pct)
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 4)
  }

  function seekTo(val: number) {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = ((el.scrollHeight - el.clientHeight) * val) / 100
    setSliderVal(val)
    setAutoScroll(val >= 98)
  }

  function copyLogs() {
    const text = filtered.map(l => `[${l.ts}] ${(LOG_L[l.level] ?? l.level).padEnd(4)}  ${l.msg}`).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    })
  }

  function highlight(msg: string): ReactNode {
    if (!search) return msg
    const idx = msg.toLowerCase().indexOf(search.toLowerCase())
    if (idx < 0) return msg
    return (
      <>
        {msg.slice(0, idx)}
        <mark style={{ background: `${accent}44`, color: '#fff', borderRadius: 2, padding: '0 1px' }}>
          {msg.slice(idx, idx + search.length)}
        </mark>
        {msg.slice(idx + search.length)}
      </>
    )
  }

  const PILLS = [
    { key: 'all',  label: 'All',   col: accent    },
    { key: 'ok',   label: 'Pass',  col: '#22C55E' },
    { key: 'err',  label: 'Fail',  col: '#EF4444' },
    { key: 'warn', label: 'Warn',  col: '#F59E0B' },
    { key: 'info', label: 'Info',  col: '#3B82F6' },
    { key: 'hdr',  label: 'Steps', col: '#C0C0C0' },
  ]

  return (
    <div className="be-card overflow-hidden mt-3" style={{ transition: 'all .3s' }}>

      {/* ── Header ── */}
      <div className="flex items-center gap-2.5 px-4 py-2 border-b border-[#30363D]" style={{ background: '#161B22' }}>
        <div className="w-0.5 h-5 rounded-full flex-shrink-0"
             style={{ background: accent, boxShadow: `0 0 8px ${accent}88` }} />
        <span className="font-display font-700 text-[12px] text-white">{title}</span>
        <div className="flex items-center gap-1.5 ml-1">
          <div className="w-1.5 h-1.5 rounded-full pulse" style={{ background: '#22C55E' }} />
          <span className="font-mono text-[9px] text-[#22C55E]">LIVE</span>
        </div>
        <span className="ml-2 font-mono text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: '#21262D', color: '#8B949E' }}>{filtered.length} lines</span>
      </div>

      {/* ── Toolbar row 1: search + buttons ── */}
      <div className="flex items-center gap-2 px-3.5 py-1.5 border-b border-[#1E1E1E] flex-wrap"
           style={{ background: '#0F1318' }}>
        <div className="relative flex items-center flex-1" style={{ minWidth: 90 }}>
          <span className="absolute left-2 text-[#484F58] text-[11px] pointer-events-none select-none">⌕</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search logs…"
            style={{
              width: '100%', paddingLeft: 22, paddingRight: search ? 24 : 8,
              paddingTop: 3, paddingBottom: 3,
              background: '#161B22', border: '1px solid #21262D', borderRadius: 5,
              color: '#C0C0C0', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', outline: 'none',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{
              position: 'absolute', right: 6, background: 'none', border: 'none',
              color: '#484F58', cursor: 'pointer', fontSize: 11, lineHeight: 1,
            }}>✕</button>
          )}
        </div>
        <_LogBtn active={autoScroll} color={accent} onClick={() => setAutoScroll(a => !a)}>↓ Auto</_LogBtn>
        <_LogBtn active={copied} color="#22C55E" onClick={copyLogs}>{copied ? '✓ Copied' : '⎘ Copy'}</_LogBtn>
        <_LogBtn active={expanded} color={accent} onClick={() => setExpanded(e => !e)}>
          {expanded ? '⊟ Compact' : '⊞ Full Logs'}
        </_LogBtn>
      </div>

      {/* ── Toolbar row 2: level pills ── */}
      <div className="flex items-center gap-1 px-3.5 py-1 border-b border-[#1A1A1A]"
           style={{ background: '#0D1117' }}>
        {PILLS.map(p => (
          <button key={p.key} onClick={() => setFilter(p.key)} style={{
            padding: '1px 7px', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap',
            border: `1px solid ${filter === p.key ? p.col : '#1E1E1E'}`,
            background: filter === p.key ? `${p.col}15` : 'transparent',
            color: filter === p.key ? p.col : '#484F58',
            fontSize: 10, fontFamily: 'inherit', transition: 'all .12s',
          }}>
            {p.label} ({counts[p.key as keyof typeof counts] ?? 0})
          </button>
        ))}
        {search && filtered.length > 0 && (
          <span className="ml-auto font-mono text-[10px]" style={{ color: accent }}>
            {filtered.length} matches
          </span>
        )}
      </div>

      {/* ── Column headers ── */}
      <div className="flex px-3.5 py-[3px] border-b border-[#1A1A1A]" style={{ background: '#0D1117' }}>
        {([['#', 38, 'hidden sm:block'], ['TIME', 64, 'hidden xs:block'], ['LVL', 44, ''], ['MESSAGE', 'auto', '']] as [string, number|string, string][]).map(([h, w, cls]) => (
          <span key={h} className={`font-mono font-700 text-[9px] ${cls}`} style={{
            color: '#484F58',
            width:      typeof w === 'number' ? w : undefined,
            flex:       w === 'auto' ? 1 : 'none',
            flexShrink: 0,
          }}>{h}</span>
        ))}
      </div>

      {/* ── Log rows ── */}
      <div ref={scrollRef} onScroll={onScroll} style={{
        height: expanded ? 520 : 256,
        overflowY: 'auto',
        background: '#0D1117',
        transition: 'height .3s ease',
        scrollbarWidth: 'thin',
        scrollbarColor: '#21262D #0D1117',
      }}>
        {filtered.length === 0 && (
          <div className="px-4 py-3 font-mono text-[11px] text-[#484F58]">
            {logs.length === 0 ? 'Ready — start a scan to see live output' : 'No logs match current filter'}
          </div>
        )}
        {filtered.map((l, i) => {
          const isErr = l.level === 'err' || l.level === 'crash'
          const isHdr = l.level === 'hdr'
          return (
            <div key={i} className="flex px-3.5" style={{
              paddingTop: 2, paddingBottom: 2,
              background: isHdr ? 'rgba(245,166,35,0.04)' : isErr ? 'rgba(239,68,68,0.03)' : undefined,
              borderLeft: isErr ? '2px solid rgba(239,68,68,0.5)'
                        : isHdr ? '2px solid rgba(245,166,35,0.5)'
                        : '2px solid transparent',
              borderBottom: isHdr ? '1px solid #1A1A1A' : undefined,
            }}>
              <span className="hidden sm:block font-mono text-[9px] flex-shrink-0 text-right pr-2"
                    style={{ width: 38, color: '#2A2A2A', paddingTop: 1 }}>{i + 1}</span>
              <span className="hidden xs:block font-mono text-[10px] flex-shrink-0 text-[#484F58]"
                    style={{ width: 64 }}>{l.ts}</span>
              <span className="font-mono font-700 text-[9px] flex-shrink-0 pt-px"
                    style={{ width: 44, color: LOG_C[l.level] ?? '#8B949E' }}>
                {LOG_L[l.level] ?? l.level.toUpperCase()}
              </span>
              <span className="font-mono text-[11px] flex-1" style={{ color: LOG_C[l.level] ?? '#8B949E' }}>
                {highlight(l.msg)}
              </span>
            </div>
          )
        })}
      </div>

      {/* ── Timeline slider ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-t border-[#1A1A1A]"
           style={{ background: '#0A0D11' }}>
        <button onClick={() => seekTo(0)} style={{
          background: 'none', border: 'none', color: '#484F58',
          cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: '0 2px',
        }}>⇤</button>

        {/* Track */}
        <div className="relative flex-1" style={{ height: 18 }}>
          <div className="absolute top-1/2 left-0 right-0 rounded-full"
               style={{ height: 4, marginTop: -2, background: '#21262D' }} />
          <div className="absolute top-1/2 left-0 rounded-full"
               style={{
                 height: 4, marginTop: -2, width: `${sliderVal}%`,
                 background: `linear-gradient(90deg,${accent}88,${accent})`,
                 transition: 'width .08s',
               }} />
          {markers.map((m, i) => (
            <div key={i} className="absolute top-1/2" style={{
              left: `${m.pct}%`,
              width: 2,
              height: m.level === 'hdr' ? 6 : 8,
              marginTop: -(m.level === 'hdr' ? 3 : 4),
              background: (m.level === 'err' || m.level === 'crash') ? '#EF4444'
                        : m.level === 'warn' ? '#F59E0B' : `${accent}99`,
              borderRadius: 1, pointerEvents: 'none',
            }} />
          ))}
          <div className="absolute top-1/2" style={{
            left: `${sliderVal}%`, width: 10, height: 10,
            marginTop: -5, marginLeft: -5, borderRadius: '50%',
            background: accent, boxShadow: `0 0 6px ${accent}`,
            pointerEvents: 'none', transition: 'left .08s',
          }} />
          <input type="range" min={0} max={100} value={sliderVal}
                 onChange={e => seekTo(Number(e.target.value))}
                 style={{
                   position: 'absolute', inset: 0, width: '100%', height: '100%',
                   opacity: 0, cursor: 'pointer', margin: 0, padding: 0, zIndex: 3,
                 }} />
        </div>

        <button onClick={() => seekTo(100)} style={{
          background: 'none', border: 'none', color: '#484F58',
          cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: '0 2px',
        }}>⇥</button>
        <span className="font-mono text-[10px] w-8 text-right flex-shrink-0"
              style={{ color: '#484F58' }}>{sliderVal}%</span>
      </div>
    </div>
  )
}

/* ── TEST CASE TABLE ───────────────────────────────────────────── */
export function TestCaseTable({ cases }: { cases: any[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#30363D] bg-[#0D1117]">
      <table className="w-full text-left border-collapse">
        <thead className="bg-[#161B22] border-b border-[#30363D]">
          <tr>
            <th className="px-4 py-3 font-display font-700 text-[10px] uppercase tracking-widest text-[#484F58]">ID</th>
            <th className="px-4 py-3 font-display font-700 text-[10px] uppercase tracking-widest text-[#484F58]">Category</th>
            <th className="px-4 py-3 font-display font-700 text-[10px] uppercase tracking-widest text-[#484F58]">Test Name</th>
            <th className="px-4 py-3 font-display font-700 text-[10px] uppercase tracking-widest text-[#484F58]">Result</th>
            <th className="px-4 py-3 font-display font-700 text-[10px] uppercase tracking-widest text-[#484F58]">Detail</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1F242B]">
          {cases.map((c, i) => (
            <tr key={i} className="hover:bg-[#161B22] transition-colors group">
              <td className="px-4 py-3 font-mono text-[11px] text-[#484F58] group-hover:text-white">{c.ID}</td>
              <td className="px-4 py-3 font-mono text-[11px] text-[#8B949E]">{c.Category}</td>
              <td className="px-4 py-3 font-display font-600 text-[13px] text-[#E0E0E0]">{c['Test Name']}</td>
              <td className="px-4 py-3">
                <Badge label={c.Result} type={c.Result === 'PASS' ? 'success' : c.Severity === 'CRITICAL' ? 'error' : 'warn'} />
              </td>
              <td className="px-4 py-3 font-body text-[12px] text-[#8B949E] italic">{c.Detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── SCREENSHOT GALLERY ─────────────────────────────────────────── */
export function ScreenshotGallery({ images }: { images: string[] }) {
  const [active, setActive] = useState(0)
  if (!images.length) return <div className="p-10 text-center text-[#484F58] italic font-body text-[13px]">No screenshots captured.</div>
  
  return (
    <div className="flex flex-col gap-4">
      <div className="relative rounded-2xl overflow-hidden border border-[#30363D] bg-black group shadow-2xl">
        <img src={images[active]} alt="QA Capture" className="w-full h-auto object-contain max-h-[600px] transition-opacity duration-300" />
        <div className="absolute bottom-4 right-4 bg-[rgba(13,17,23,0.8)] backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-[10px] font-mono text-[#8B949E]">
          {active + 1} / {images.length}
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {images.map((img, i) => (
          <button key={i} onClick={() => setActive(i)} 
                  className={`relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden border-2 transition-all ${active === i ? 'border-[#F59E0B] scale-105 shadow-glow' : 'border-[#30363D] opacity-60 hover:opacity-100 hover:border-[#484F58]'}`}>
            <img src={img} className="w-full h-full object-cover" alt={`Thumb ${i}`} />
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── PROGRESS BAR ──────────────────────────────────────────────── */
export function ProgressBar({ value, color = C.gold }: { value: number; color?: string }) {
  return (
    <div className="h-0.5 rounded-full overflow-hidden" style={{ background: C.border }}>
      <div className="h-full rounded-full transition-all duration-500"
           style={{ width: `${value}%`, background: color, boxShadow: `0 0 6px ${color}66` }} />
    </div>
  )
}

/* ── BUTTONS ───────────────────────────────────────────────────── */
export function RunButton({ onClick, disabled, loading, label, color = C.gold, icon }:
  { onClick: () => void; disabled?: boolean; loading?: boolean; label: string; color?: string; icon?: string }) {
  return (
    <button className="btn-gold" onClick={onClick} disabled={disabled}
            style={{ background: disabled ? '#2A2A2A' : color, color: disabled ? '#555' : '#0A0A0A' }}>
      {loading
        ? <svg className="spinner" width="14" height="14" fill="none" viewBox="0 0 24 24">
            <circle opacity=".25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path opacity=".75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        : icon ? <span>{icon}</span> : null}
      {label}
    </button>
  )
}

export function StopButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <button className="btn-danger" onClick={onClick} disabled={disabled}>■ Stop</button>
}

export function GhostBtn({ onClick, label, icon }: { onClick: () => void; label: string; icon?: string }) {
  return (
    <button className="btn-ghost" onClick={onClick}>
      {icon && <span>{icon}</span>}{label}
    </button>
  )
}

/* ── INPUT ─────────────────────────────────────────────────────── */
export function Input({ label, value, onChange, placeholder, type = 'text', className = '', error }:
  { label?: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; className?: string; error?: string }) {
  const handleBlur = () => {
    if (type === 'url' && value) {
      const trimmed = value.trim();
      if (trimmed && !/^https?:\/\//i.test(trimmed)) {
        onChange(`https://${trimmed}`);
      }
    }
  }

  return (
    <div className={className}>
      {label && (
        <p className="font-display font-700 text-[10px] uppercase tracking-[0.07em] mb-1.5"
           style={{ color: error ? '#EF4444' : C.faint }}>{label}</p>
      )}
      <input
        className="be-input"
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onBlur={handleBlur}
        style={error ? { borderColor: '#EF4444', boxShadow: '0 0 0 2px rgba(239,68,68,0.15)' } : undefined}
      />
      {error && (
        <p className="font-body text-[11px] mt-1.5 flex items-center gap-1.5"
           style={{ color: '#EF4444' }}>
          <span style={{ fontSize: 12 }}>✗</span> {error}
        </p>
      )}
    </div>
  )
}

/* ── SELECT ────────────────────────────────────────────────────── */
export function Select({ label, value, onChange, options, className = '' }:
  { label?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <div className={className}>
      {label && <p className="font-display font-700 text-[10px] uppercase tracking-[0.07em] mb-1.5" style={{ color: C.faint }}>{label}</p>}
      <select className="be-input" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

/* ── GAUGE ─────────────────────────────────────────────────────── */
export function Gauge({ score, color, label }: { score: number | null; color: string; label: string }) {
  const r = 28, circ = 2 * Math.PI * r
  const offset = score !== null ? circ - (score / 100) * circ : circ
  const col = score === null ? C.faint : score >= 90 ? C.green : score >= 50 ? C.amber : C.red
  return (
    <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
      <div className="relative" style={{ width: 64, height: 64 }}>
        <svg viewBox="0 0 72 72" width="64" height="64" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="36" cy="36" r={r} fill="none" stroke={C.border} strokeWidth="7" />
          <circle cx="36" cy="36" r={r} fill="none" stroke={col} strokeWidth="7"
                  strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset .8s ease', filter: `drop-shadow(0 0 4px ${col}88)` }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-mono font-600 text-[14px]" style={{ color: col }}>
          {score ?? '?'}
        </div>
      </div>
      <p className="font-display font-600 text-[10px] text-center leading-tight" style={{ color: C.muted }}>{label}</p>
    </div>
  )
}

/* ── SCORE RING ────────────────────────────────────────────────── */
export function ScoreRing({ score, size = 120, label }: 
  { score: number | null; size?: number; label?: string }) {
  const r   = size / 2 - 12
  const c   = 2 * Math.PI * r
  const off = score !== null ? c - (score / 100) * c : c
  const col = score === null ? C.faint : score >= 85 ? C.green : score >= 60 ? C.amber : C.red
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#21262D" strokeWidth="10" />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth="10"
                  strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)', filter: `drop-shadow(0 0 8px ${col}66)` }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono font-800 text-[28px] leading-tight" style={{ color: col }}>{score ?? '—'}</span>
          <span className="font-display font-700 text-[8px] uppercase tracking-widest text-[#484F58] mt-px">Score</span>
        </div>
      </div>
      {label && <p className="font-display font-700 text-[11px] text-[#8B949E] tracking-tight">{label}</p>}
    </div>
  )
}

/* ── CATEGORY RING ─────────────────────────────────────────────── */
export function CategoryRing({ label, count, total, color = '#F59E0B' }: 
  { label: string; count: number; total: number; color?: string }) {
  const size = 64, r = 26, c = 2 * Math.PI * r
  const score = total > 0 ? (count / total) * 100 : 0
  const off = c - (score / 100) * c
  const col = total === 0 ? '#30363D' : (score === 100 ? '#22C55E' : color)
  
  return (
    <div className="flex flex-col items-center gap-2 group cursor-default">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#21262D" strokeWidth="5" />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth="5"
                  strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset .8s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-mono font-700 text-[11px]" 
             style={{ color: col }}>
          {count}/{total}
        </div>
      </div>
      <p className="font-display font-700 text-[9px] uppercase tracking-wider text-center text-[#8B949E] transition-colors group-hover:text-white">
        {label}
      </p>
    </div>
  )
}

/* ── BADGE ─────────────────────────────────────────────────────── */
export function Badge({ label, type = 'info' }: { label: string; type?: 'success'|'error'|'warn'|'info' }) {
  const map = {
    success: ['#22C55E', 'rgba(34, 197, 94, 0.12)'],
    error:   ['#EF4444', 'rgba(239, 68, 68, 0.12)'],
    warn:    ['#F59E0B', 'rgba(245, 158, 11, 0.12)'],
    info:    ['#3B82F6', 'rgba(59, 130, 246, 0.12)'],
  }
  const [fg, bg] = map[type] || map.info
  return (
    <span className="be-badge" style={{ color: fg, background: bg, borderColor: `${fg}33` }}>
      {label}
    </span>
  )
}

/* ── TOGGLE ────────────────────────────────────────────────────── */
export function Toggle({ checked, onChange, label, description, badge }:
  { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 group">
      <div className="flex-1 pr-4 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-body font-600 text-[13px] text-[#E0E0E0] group-hover:text-white transition-colors">{label}</span>
          {badge && <Badge label={badge} type="warn" />}
        </div>
        {description && <p className="font-body text-[11px] mt-0.5 text-[#8B949E]">{description}</p>}
      </div>
      <div className="relative w-8 h-4 rounded-full transition-colors cursor-pointer"
           onClick={() => onChange(!checked)}
           style={{ background: checked ? 'var(--pro-orange)' : '#30363D' }}>
        <div className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform"
             style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }} />
      </div>
    </div>
  )
}

/* ── CHECK PILL ────────────────────────────────────────────────── */
export function CheckPill({ checked, onChange, label }:
  { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!checked)} className={`be-pill ${checked ? 'active' : ''}`}>
      {label}
    </button>
  )
}

/* ── USER GUIDE BUTTON + MODAL ─────────────────────────────────── */
export interface UGConfig {
  title: string; icon: string; color: string; tagline: string
  sections: Array<{ title: string; items: string[] }>
}

export function UserGuideButton({ config, color }: { config: UGConfig; color?: string }) {
  const [open, setOpen] = useState(false)
  const col = color ?? config.color ?? C.gold
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ml-auto flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md font-display font-700 text-[11px] transition-all"
        style={{ background: `${col}18`, color: col, border: `1px solid ${col}44` }}
        onMouseEnter={e => (e.currentTarget.style.background = `${col}28`)}
        onMouseLeave={e => (e.currentTarget.style.background = `${col}18`)}>
        📖 Guide
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end"
             onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }} />
          <div className="relative flex flex-col h-full w-[460px] max-w-[95vw] animate-slide-in"
               style={{ background: C.card, borderLeft: `1px solid ${C.bhi}`, boxShadow: '-20px 0 60px rgba(0,0,0,0.9)' }}>
            <div style={{ height: 3, background: `linear-gradient(90deg,${col},${col}44,transparent)` }} />
            {/* Header */}
            <div className="flex items-start gap-3 px-6 py-5 border-b border-bdr flex-shrink-0"
                 style={{ background: C.raised }}>
              <span style={{ fontSize: 28, lineHeight: 1 }}>{config.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-display font-800 text-[15px] tracking-tight" style={{ color: C.text }}>{config.title}</p>
                <p className="font-body text-[11px] mt-1 leading-relaxed" style={{ color: C.muted }}>{config.tagline}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-[16px] flex-shrink-0"
                      style={{ color: C.faint, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
              {config.sections.map((sec, si) => (
                <div key={si}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="w-0.5 h-5 rounded-full flex-shrink-0" style={{ background: col, boxShadow: `0 0 6px ${col}88` }} />
                    <h3 className="font-display font-700 text-[12px] tracking-tight" style={{ color: C.text }}>{sec.title}</h3>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {sec.items.map((item, ii) => (
                      <li key={ii} className="flex gap-2.5 font-body text-[11px] leading-relaxed" style={{ color: C.muted }}>
                        <span className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center font-display font-700 text-[8px] mt-0.5"
                              style={{ background: col, color: '#0A0A0A' }}>{ii + 1}</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {/* Footer */}
            <div className="px-5 py-3 border-t border-bdr flex justify-end flex-shrink-0" style={{ background: C.raised }}>
              <button className="btn-gold" onClick={() => setOpen(false)} style={{ background: col, color: '#0A0A0A', borderRadius: 6, padding: '8px 18px', fontSize: 12 }}>
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}


/* ── ANALYST CONFIG MODAL ─────────────────────────────────────── */
export function AnalystConfigModal({ open, onClose, config, setConfig }: 
  { open: boolean; onClose: () => void; config: any; setConfig: (c: any) => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-fade-in">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg be-card overflow-hidden" style={{ borderColor: 'var(--pro-orange)' }}>
        <div style={{ height: 4, background: 'var(--pro-orange)' }} />
        <div className="px-6 py-5 border-b border-[#30363D] flex justify-between items-center bg-[#161B22]">
          <h3 className="font-display font-800 text-white tracking-tight">Analyst Configuration</h3>
          <button onClick={onClose} className="text-[#484F58] hover:text-white transition-colors">✕</button>
        </div>
        <div className="p-6 flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Environment" value={config.env} onChange={v => setConfig({...config, env: v})} options={[
              { value: 'prod', label: 'Production' }, { value: 'staging', label: 'Staging' }, { value: 'dev', label: 'Development' }
            ]} />
            <Select label="Matrix Scope" value={config.scope} onChange={v => setConfig({...config, scope: v})} options={[
              { value: 'full', label: 'Full Audit' }, { value: 'quick', label: 'Quick Scan' }, { value: 'custom', label: 'Custom Scope' }
            ]} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Issues Budget" value={config.budget} onChange={v => setConfig({...config, budget: v})} type="number" />
            <Input label="Timeout (ms)" value={config.timeout} onChange={v => setConfig({...config, timeout: v})} type="number" />
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <p className="font-display font-700 text-[10px] uppercase tracking-widest text-[#484F58]">Advanced Matrix Flags</p>
            <Toggle label="Force Cache Refresh" checked={config.forceCache} onChange={v => setConfig({...config, forceCache: v})} />
            <Toggle label="Annotate Screenshots" checked={config.annotate} onChange={v => setConfig({...config, annotate: v})} />
            <Toggle label="Deep Link Discovery" checked={config.deepLink} onChange={v => setConfig({...config, deepLink: v})} />
          </div>
        </div>
        <div className="px-6 py-4 bg-[#161B22] border-t border-[#30363D] flex justify-end">
          <button className="btn-gold" onClick={onClose}>Apply Matrix Config</button>
        </div>
      </div>
    </div>
  )
}
