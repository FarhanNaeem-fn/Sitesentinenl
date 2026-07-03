// src/pages/TestRunner.tsx
import { useState, useRef, useCallback } from 'react'
import { api } from '../api/client'
import { useJob } from '../hooks/useJob'
import { Card, LogTerminal, RunButton, StopButton, GhostBtn, Input, Select } from '../components/ui'

/* ── Types ────────────────────────────────────────────────── */
interface TC {
  id: string; name: string; type: string; page: string
  steps: string; expected: string; severity: string
}
interface TCResult extends TC {
  target_url?: string; actual?: string
  status?: 'pass' | 'fail' | 'error' | 'pending' | 'running'
  reason?: string; why_pass?: string[]; why_fail?: string[]
  evidence?: string; error?: string; duration_ms?: number
}
type Stage = 'upload' | 'review' | 'running' | 'done'

/* ── Design tokens ────────────────────────────────────────── */
const TYPE_COL: Record<string, string> = {
  navigation: '#3B82F6', seo: '#A855F7', accessibility: '#14B8A6',
  form: '#F59E0B', security: '#EF4444', links: '#6366F1',
  performance: '#22C55E', content: '#F97316', visual: '#8B5CF6',
}
const SEV_COL: Record<string, string> = { high: '#EF4444', medium: '#F59E0B', low: '#22C55E' }
const STATUS_CFG: Record<string, [string, string]> = {
  pass:  ['#22C55E', '✓ PASS'],
  fail:  ['#EF4444', '✗ FAIL'],
  error: ['#F59E0B', '⚠ ERROR'],
}
const tCol  = (t: string) => TYPE_COL[t?.toLowerCase()] ?? '#8B949E'
const sCol  = (s: string) => SEV_COL[s?.toLowerCase()]  ?? '#8B949E'

/* ── Sub-components ───────────────────────────────────────── */
function StatusBadge({ status }: { status?: string }) {
  if (!status || status === 'pending')
    return <span style={{ color: '#3A3A3A', fontSize: 12 }}>○ Pending</span>
  if (status === 'running')
    return (
      <span style={{ color: '#3B82F6', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span className="inline-block w-3 h-3 rounded-full border-2 border-[#3B82F6] border-t-transparent animate-spin" />
        Running…
      </span>
    )
  const [col, lbl] = STATUS_CFG[status] ?? ['#8B949E', status.toUpperCase()]
  return (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-700"
          style={{ color: col, background: `${col}15`, border: `1px solid ${col}35` }}>
      {lbl}
    </span>
  )
}

function TypeBadge({ type }: { type?: string }) {
  if (!type) return <span style={{ color: '#3A3A3A', fontSize: 11 }}>—</span>
  const c = tCol(type)
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-700 capitalize"
          style={{ color: c, background: `${c}15`, border: `1px solid ${c}30` }}>
      {type}
    </span>
  )
}

/* Expandable row: shows why_pass / why_fail detail */
function ResultRow({ tc, res, isRunning }: { tc: TC; res?: TCResult; isRunning: boolean }) {
  const [open, setOpen] = useState(false)
  const status    = isRunning ? 'running' : res?.status
  const st        = res?.status ?? 'pending'
  const borderMap: Record<string, string> = { pass: '#22C55E', fail: '#EF4444', error: '#F59E0B' }
  const bgMap:     Record<string, string> = { pass: '#22C55E08', fail: '#EF444408', error: '#F59E0B08' }
  const reasonMap: Record<string, string> = { pass: '#22C55E', fail: '#EF4444', error: '#F59E0B' }
  const rowBorder = borderMap[st] ?? '#30363D'
  const rowBg     = bgMap[st]     ?? 'transparent'
  const hasDetail = (res?.why_pass?.length ?? 0) + (res?.why_fail?.length ?? 0) > 0
  const reasonCol = reasonMap[st] ?? '#8B949E'

  return (
    <>
      <tr
        style={{ borderLeft: `3px solid ${rowBorder}`, background: rowBg, cursor: hasDetail ? 'pointer' : 'default' }}
        onClick={() => hasDetail && setOpen(o => !o)}
      >
        {/* ID */}
        <td className="px-2 py-3 align-top">
          <code style={{ fontSize: 10, color: '#8B949E' }}>{tc.id}</code>
        </td>
        {/* Name */}
        <td className="px-2 py-3 align-top" style={{ maxWidth: 220 }}>
          <p className="m-0 font-600 truncate" style={{ color: '#F0F0F0', fontSize: 13 }} title={tc.name}>
            {tc.name}
          </p>
          {tc.expected && (
            <p className="m-0 truncate" style={{ color: '#555', fontSize: 11 }} title={tc.expected}>
              {tc.expected.slice(0, 60)}{tc.expected.length > 60 ? '…' : ''}
            </p>
          )}
        </td>
        {/* Type */}
        <td className="px-2 py-3 align-top whitespace-nowrap">
          <TypeBadge type={res?.type || tc.type} />
        </td>
        {/* Status */}
        <td className="px-2 py-3 align-top">
          <StatusBadge status={status} />
          {res?.reason && !isRunning && (
            <p className="m-0 mt-1 leading-tight" style={{ color: reasonCol, fontSize: 10, maxWidth: 140 }}>
              {res.reason.slice(0, 80)}
            </p>
          )}
        </td>
        {/* Actual summary */}
        <td className="px-2 py-3 align-top" style={{ maxWidth: 260 }}>
          {res?.actual ? (
            <span style={{ color: '#8B949E', fontSize: 12 }}>
              {res.actual.slice(0, 100)}{res.actual.length > 100 ? '…' : ''}
            </span>
          ) : res?.error ? (
            <span style={{ color: '#F59E0B', fontSize: 11 }}>{res.error.slice(0, 70)}</span>
          ) : (
            <span style={{ color: '#3A3A3A', fontSize: 11 }}>—</span>
          )}
          {hasDetail && (
            <span style={{ color: '#3B82F6', fontSize: 10, display: 'block', marginTop: 3 }}>
              {open ? '▲ collapse detail' : '▼ expand detail'}
            </span>
          )}
        </td>
        {/* Severity */}
        <td className="px-2 py-3 align-top whitespace-nowrap">
          <span style={{ color: sCol(tc.severity), fontSize: 11, fontWeight: 700 }}>
            {tc.severity || 'Medium'}
          </span>
        </td>
        {/* Duration */}
        <td className="px-2 py-3 align-top whitespace-nowrap" style={{ fontFamily: 'monospace', fontSize: 11, color: '#555' }}>
          {res?.duration_ms ? `${(res.duration_ms / 1000).toFixed(1)}s` : '—'}
        </td>
        {/* Screenshot */}
        <td className="px-2 py-3 align-top">
          {res?.evidence ? (
            <a
              href={`/api${res.evidence}`}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ display: 'block' }}
            >
              <img
                src={`/api${res.evidence}`}
                alt="Screenshot"
                style={{ width: 120, borderRadius: 6, border: '1px solid #30363D', display: 'block' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
              <span style={{ color: '#3B82F6', fontSize: 10, display: 'block', marginTop: 3 }}>View →</span>
            </a>
          ) : (
            <span style={{ color: '#3A3A3A', fontSize: 11 }}>—</span>
          )}
        </td>
      </tr>

      {/* Expanded detail row */}
      {open && hasDetail && (
        <tr style={{ background: '#161B22', borderLeft: `3px solid ${rowBorder}` }}>
          <td />
          <td colSpan={7} style={{ padding: '12px 16px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Why Pass */}
              {(res?.why_pass?.length ?? 0) > 0 && (
                <div>
                  <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#22C55E', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    Why it Passed
                  </p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {res!.why_pass!.map((item, i) => (
                      <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6 }}>
                        <span style={{ color: '#22C55E', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>✓</span>
                        <span style={{ color: '#C9D1D9', fontSize: 12, lineHeight: 1.5 }}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Why Fail */}
              {(res?.why_fail?.length ?? 0) > 0 && (
                <div>
                  <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    Why it {res?.status === 'error' ? 'Errored' : 'Failed'}
                  </p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {res!.why_fail!.map((item, i) => (
                      <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6 }}>
                        <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>✗</span>
                        <span style={{ color: '#C9D1D9', fontSize: 12, lineHeight: 1.5 }}>{item}</span>
                      </li>
                    ))}
                  </ul>
                  {res?.error && (
                    <p style={{ margin: '8px 0 0', padding: '6px 10px', background: '#F59E0B0D', border: '1px solid #F59E0B22', borderRadius: 6, fontFamily: 'monospace', fontSize: 11, color: '#F59E0B' }}>
                      {res.error}
                    </p>
                  )}
                </div>
              )}
            </div>
            {/* Full-size screenshot */}
            {res?.evidence && (
              <div style={{ marginTop: 14 }}>
                <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Screenshot Evidence
                </p>
                <a href={`/api${res.evidence}`} target="_blank" rel="noreferrer">
                  <img
                    src={`/api${res.evidence}`}
                    alt="Full screenshot"
                    style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #30363D' }}
                  />
                </a>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════ */
export default function TestRunner() {
  const { state, startJob, cancel, reset } = useJob()
  const [stage,        setStage]        = useState<Stage>('upload')
  const [url,          setUrl]          = useState('')
  const [viewport,     setViewport]     = useState('desktop')
  const [testCases,    setTestCases]    = useState<TC[]>([])
  const [results,      setResults]      = useState<TCResult[]>([])
  const [dragOver,     setDragOver]     = useState(false)
  const [parseLoading, setParseLoading] = useState(false)
  const [parseError,   setParseError]   = useState('')
  const [fileName,     setFileName]     = useState('')
  const [format,       setFormat]       = useState('')
  const [finalScore,   setFinalScore]   = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /* Pre-scan login credentials */
  const [loginEnabled,  setLoginEnabled]  = useState(false)
  const [preUsername,   setPreUsername]   = useState('')
  const [prePassword,   setPrePassword]   = useState('')
  const [showPrePass,   setShowPrePass]   = useState(false)

  /* Mid-run login form (when backend detects login page mid-execution) */
  const [currentJobId,        setCurrentJobId]        = useState('')
  const [midLoginUser,        setMidLoginUser]        = useState('')
  const [midLoginPass,        setMidLoginPass]        = useState('')
  const [showMidPass,         setShowMidPass]         = useState(false)
  const [midLoginSubmitting,  setMidLoginSubmitting]  = useState(false)
  const [midLoginError,       setMidLoginError]       = useState('')
  const [loginCompleted,      setLoginCompleted]      = useState(false)

  const running = state.status === 'running'

  /* live partial updates from SSE */
  const partial = state.partial as any
  const needsLogin    = partial?.needs_login === true
  const loginFailed   = partial?.login_failed === true && partial?.needs_login === true
  const loginSuccess  = partial?.login_success === true
  const formType      = (partial?.form_type as string) || 'email or username'
  const liveResults: TCResult[] = partial?.results ?? []
  const displayResults: TCResult[] = stage === 'done' ? results : liveResults

  /* Track when login completes so we don't re-show the form */
  if (loginSuccess && !loginCompleted) setLoginCompleted(true)

  /* ── File parsing ──────────────────────────────────────── */
  const parseFile = useCallback(async (file: File) => {
    setParseError('')
    setParseLoading(true)
    setFileName(file.name)
    try {
      const data = await api.parseTestCases(file)
      setTestCases(data.test_cases)
      setFormat(data.format)
      setStage('review')
    } catch (err: any) {
      setParseError(err?.message ?? 'Failed to parse file. Check format and try again.')
    } finally {
      setParseLoading(false)
    }
  }, [])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) parseFile(f); e.target.value = ''
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]; if (f) parseFile(f)
  }

  /* ── Execution ─────────────────────────────────────────── */
  async function execute() {
    let targetUrl = url.trim()
    if (!targetUrl) return
    if (!/^https?:\/\//i.test(targetUrl)) { targetUrl = 'https://' + targetUrl; setUrl(targetUrl) }
    reset()
    setResults([]); setFinalScore(null); setLoginCompleted(false)
    setMidLoginUser(''); setMidLoginPass(''); setMidLoginError('')
    setStage('running')
    try {
      const payload: any = { url: targetUrl, test_cases: testCases, viewport }
      if (loginEnabled && preUsername && prePassword) {
        payload.login_username = preUsername
        payload.login_password = prePassword
      }
      const { job_id } = await api.runTestCases(payload)
      setCurrentJobId(job_id)
      startJob(job_id)
    } catch (err: any) {
      setParseError(err?.message ?? 'Failed to start execution'); setStage('review')
    }
  }

  /* Submit mid-run credentials to backend */
  async function submitMidLogin() {
    if (!midLoginUser || !midLoginPass || !currentJobId) return
    setMidLoginSubmitting(true)
    setMidLoginError('')
    try {
      await api.provideLogin(currentJobId, midLoginUser, midLoginPass)
    } catch (err: any) {
      setMidLoginError(err?.message ?? 'Failed to send credentials')
    } finally {
      setMidLoginSubmitting(false)
    }
  }

  /* Skip login — provide empty credentials to unblock the backend */
  async function skipLogin() {
    if (!currentJobId) return
    try { await api.provideLogin(currentJobId, '__skip__', '__skip__') } catch { /* ignore */ }
  }

  /* Watch completion */
  if (stage === 'running' && state.status === 'done' && state.result) {
    const r = state.result
    setResults(r.results ?? [])
    setFinalScore(r.score ?? null)
    setStage('done')
  }

  function resetAll() {
    reset(); setStage('upload'); setTestCases([]); setResults([])
    setFileName(''); setFormat(''); setFinalScore(null); setParseError('')
    setLoginEnabled(false); setPreUsername(''); setPrePassword('')
    setCurrentJobId(''); setLoginCompleted(false)
  }

  function openHtmlReport() {
    const r = state.result
    if (!r?.report_html) return
    window.open(api.getReportUrl(r.report_html.split('/').pop() ?? ''), '_blank')
  }

  async function downloadJson() {
    const r = state.result
    if (!r?.report_json) return
    const fname = r.report_json.split('/').pop() ?? 'results.json'
    const res   = await fetch(api.getReportUrl(fname))
    const blob  = await res.blob()
    const obj   = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = obj; a.download = fname
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(obj), 2000)
  }

  /* Totals */
  const totals = displayResults.reduce(
    (acc, r) => { if (r.status === 'pass') acc.pass++; else if (r.status === 'fail') acc.fail++; else if (r.status === 'error') acc.err++; return acc },
    { pass: 0, fail: 0, err: 0 },
  )
  const score = stage === 'done' && finalScore !== null ? finalScore
    : testCases.length ? Math.round(totals.pass / testCases.length * 100) : 0
  const scoreCol = score >= 70 ? '#22C55E' : score >= 40 ? '#F59E0B' : '#EF4444'

  /* ══════════════════════════════════════════════════════════ */
  return (
    <div className="p-6 max-w-[1600px] mx-auto flex flex-col gap-6 animate-slide-in">

      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-800 text-[22px] text-white">Test Case Runner</h2>
          <p className="text-[#8B949E] text-[13px] mt-0.5">
            Upload PDF or Excel test cases → execute against any URL → get a detailed pass/fail report
          </p>
        </div>
        {stage !== 'upload' && <GhostBtn onClick={resetAll} label="New Session" icon="↺" />}
      </div>

      <div className="grid grid-cols-12 gap-6 items-start">

        {/* ══ LEFT: Config ══ */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-5">
          <Card title="File & Configuration" accent="#F5A623">

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed cursor-pointer transition-all mb-4"
              style={{ height: 120, borderColor: dragOver ? '#F5A623' : '#30363D', background: dragOver ? 'rgba(245,166,35,0.06)' : '#0D1117' }}
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.pdf" onChange={onFileChange} className="hidden" />
              {parseLoading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 rounded-full border-2 border-[#F5A623] border-t-transparent animate-spin" />
                  <span className="text-[#8B949E] text-[12px]">Parsing file…</span>
                </div>
              ) : fileName ? (
                <div className="flex flex-col items-center gap-1.5 px-4 text-center">
                  <span className="text-2xl">{format === 'pdf' ? '📄' : '📊'}</span>
                  <span className="text-white text-[12px] font-600 truncate max-w-[180px]">{fileName}</span>
                  <span className="text-[#3B82F6] text-[11px]">{testCases.length} test cases — click to replace</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5 px-4 text-center">
                  <span className="text-2xl">📂</span>
                  <span className="text-[#8B949E] text-[12px]">Drop or click to upload</span>
                  <span className="text-[#3A3A3A] text-[10px] font-mono">.xlsx · .xls · .pdf</span>
                </div>
              )}
            </div>

            {parseError && (
              <p className="text-[#EF4444] text-[12px] mb-3 px-2 py-2 rounded-lg"
                 style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                {parseError}
              </p>
            )}

            <Input label="Target Base URL" value={url} onChange={setUrl} placeholder="https://example.com" type="url" className="mb-4" />
            <Select label="Device Viewport" value={viewport} onChange={setViewport} options={[
              { value: 'desktop', label: 'Desktop 1920×1080' },
              { value: 'mac',     label: 'Mac 1440×900' },
              { value: 'laptop',  label: 'Laptop 1366×768' },
              { value: 'mobile',  label: 'Mobile 430×932' },
            ]} />

            {/* Login credentials section */}
            <div className="mt-4 pt-3 border-t border-[#30363D]">
              <button
                type="button"
                onClick={() => setLoginEnabled(e => !e)}
                className="flex items-center gap-2 w-full text-left"
              >
                <div
                  className="w-8 h-4 rounded-full relative transition-colors flex-shrink-0"
                  style={{ background: loginEnabled ? '#F5A623' : '#30363D' }}
                >
                  <div
                    className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                    style={{ left: loginEnabled ? '17px' : '2px' }}
                  />
                </div>
                <span className="text-[12px]" style={{ color: loginEnabled ? '#F5A623' : '#555' }}>
                  Site requires login
                </span>
              </button>

              {loginEnabled && (
                <div className="mt-3 flex flex-col gap-2.5 pl-1">
                  <p className="text-[10px] font-mono" style={{ color: '#3A3A3A' }}>
                    🔐 Credentials are used to authenticate before running test cases.
                  </p>
                  <Input
                    label={`Username / Email`}
                    value={preUsername}
                    onChange={setPreUsername}
                    placeholder="user@example.com"
                  />
                  <div className="relative">
                    <Input
                      label="Password"
                      value={prePassword}
                      onChange={setPrePassword}
                      placeholder="••••••••"
                      type={showPrePass ? 'text' : 'password'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPrePass(v => !v)}
                      className="absolute right-2 bottom-2 text-[10px]"
                      style={{ color: '#555' }}
                    >
                      {showPrePass ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[#30363D]">
              <RunButton
                onClick={execute}
                disabled={!url || !testCases.length || running}
                loading={running}
                label={running
                  ? `Running ${liveResults.length}/${testCases.length}…`
                  : `Run ${testCases.length || 0} Test Case${testCases.length === 1 ? '' : 's'}`}
              />
              <StopButton onClick={cancel} disabled={!running} />
            </div>
          </Card>

          {/* Stat counters */}
          {(stage === 'running' || stage === 'done') && (
            <div className="grid grid-cols-3 gap-2">
              {[['Pass', totals.pass, '#22C55E'], ['Fail', totals.fail, '#EF4444'], ['Error', totals.err, '#F59E0B']].map(
                ([lbl, val, col]) => (
                  <div key={String(lbl)} className="be-card overflow-hidden">
                    <div style={{ height: 2, background: `linear-gradient(90deg,${col},transparent)` }} />
                    <div className="p-3 text-center">
                      <p className="font-display font-800 text-[24px]" style={{ color: col as string }}>{val}</p>
                      <p className="font-body text-[10px]" style={{ color: '#3A3A3A' }}>{lbl}</p>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {/* Log terminal */}
          {(stage === 'running' || stage === 'done') && (
            <LogTerminal logs={state.logs} height="h-[360px]" title="Execution Log" />
          )}

          {/* Report buttons (when done) */}
          {stage === 'done' && (
            <Card title="Reports" accent="#22C55E">
              <div className="flex flex-col gap-2">
                {state.result?.report_html && (
                  <button
                    onClick={openHtmlReport}
                    className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-left transition-all"
                    style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22C55E' }}
                  >
                    <span>🌐</span>
                    <div>
                      <p className="text-[13px] font-700 m-0">View Full HTML Report</p>
                      <p className="text-[10px] m-0 opacity-60">Detailed pass/fail with screenshots</p>
                    </div>
                  </button>
                )}
                {state.result?.report_json && (
                  <button
                    onClick={downloadJson}
                    className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-left transition-all"
                    style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: '#3B82F6' }}
                  >
                    <span>⬇️</span>
                    <div>
                      <p className="text-[13px] font-700 m-0">Download JSON</p>
                      <p className="text-[10px] m-0 opacity-60">Raw results for CI integration</p>
                    </div>
                  </button>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* ══ RIGHT: Table ══ */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-5">

          {/* Empty state */}
          {stage === 'upload' && (
            <div className="be-card p-16 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 text-3xl"
                   style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.2)' }}>
                📋
              </div>
              <h4 className="text-white font-display font-700 text-lg mb-2">Upload a Test Case File</h4>
              <p className="text-[#8B949E] text-sm max-w-sm leading-relaxed mb-6">
                Upload a PDF or Excel (.xlsx) file of test cases. Each test case is automatically classified
                by type and executed with Playwright. Detailed screenshots and pass/fail reasons are captured for every test.
              </p>
              <div className="grid grid-cols-2 gap-3 text-left max-w-sm w-full">
                {[
                  ['Excel columns', 'ID · Name · Type · Page · Steps · Expected · Severity'],
                  ['Auto-detected types', 'Navigation · SEO · Accessibility · Form · Security · Performance · Content · Links'],
                  ['Per-test evidence', 'Screenshot captured (1280×900) for every test case'],
                  ['Detailed report', 'HTML + JSON with why-pass / why-fail for each test'],
                ].map(([t, d]) => (
                  <div key={String(t)} className="p-3 rounded-xl" style={{ background: '#161B22', border: '1px solid #21262D' }}>
                    <p className="text-[11px] font-700 text-white mb-1">{t}</p>
                    <p className="text-[10px]" style={{ color: '#3A3A3A' }}>{d}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review table */}
          {stage === 'review' && testCases.length > 0 && (
            <Card title={`${testCases.length} Test Cases — ${fileName}`} accent="#F5A623"
                  action={<span className="text-[11px] font-mono px-2 py-0.5 rounded"
                                style={{ color: '#F5A623', background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.2)' }}>
                              {format.toUpperCase()}
                          </span>}>
              <div className="overflow-x-auto" style={{ maxHeight: 520, overflowY: 'auto' }}>
                <table className="be-table w-full">
                  <thead>
                    <tr><th>ID</th><th>Test Name</th><th>Type</th><th>Page/URL</th><th>Expected Result</th><th>Severity</th></tr>
                  </thead>
                  <tbody>
                    {testCases.map((tc, i) => (
                      <tr key={tc.id || i}>
                        <td><code style={{ fontSize: 10, color: '#8B949E' }}>{tc.id}</code></td>
                        <td style={{ color: '#F0F0F0', fontWeight: 500, maxWidth: 200 }}>
                          <span className="truncate block" title={tc.name}>{tc.name}</span>
                          {tc.steps && <span className="text-[10px] block truncate" style={{ color: '#3A3A3A' }}>{tc.steps.slice(0, 55)}…</span>}
                        </td>
                        <td><TypeBadge type={tc.type} /></td>
                        <td><code style={{ fontSize: 10, color: '#3B82F6' }}>{tc.page || '/'}</code></td>
                        <td style={{ color: '#8B949E', fontSize: 12 }}>{tc.expected?.slice(0, 60) ?? '—'}</td>
                        <td><span style={{ color: sCol(tc.severity), fontSize: 11, fontWeight: 700 }}>{tc.severity || 'Medium'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[11px]" style={{ color: '#3A3A3A' }}>
                Review above, then enter a Target URL and click Run.
              </p>
            </Card>
          )}

          {/* ── Mid-run login form ── */}
          {stage === 'running' && needsLogin && !loginCompleted && (
            <div className="be-card overflow-hidden">
              {/* Top accent */}
              <div style={{ height: 3, background: loginFailed ? '#EF4444' : '#F5A623' }} />
              <div className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: loginFailed ? 'rgba(239,68,68,0.1)' : 'rgba(245,166,35,0.1)', border: `1px solid ${loginFailed ? 'rgba(239,68,68,0.2)' : 'rgba(245,166,35,0.2)'}` }}
                  >
                    🔐
                  </div>
                  <div>
                    <h4 className="text-white font-700 text-[16px] m-0">
                      {loginFailed ? 'Login Failed' : 'Login Required'}
                    </h4>
                    <p className="m-0 text-[12px]" style={{ color: '#8B949E' }}>
                      {loginFailed
                        ? 'The credentials you entered were rejected. Please try again.'
                        : `This site requires authentication. Enter your ${formType} and password to continue.`}
                    </p>
                  </div>
                </div>

                {/* Error from backend */}
                {loginFailed && partial?.login_error && (
                  <div className="mb-4 px-4 py-3 rounded-xl text-[12px]"
                       style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>
                    <strong>Server said:</strong> {partial.login_error}
                  </div>
                )}

                {/* Client-side error */}
                {midLoginError && (
                  <div className="mb-4 px-4 py-3 rounded-xl text-[12px]"
                       style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>
                    {midLoginError}
                  </div>
                )}

                <div className="flex flex-col gap-3 max-w-sm">
                  {/* Username / Email */}
                  <div>
                    <label className="block text-[11px] font-600 mb-1.5" style={{ color: '#8B949E' }}>
                      {formType === 'email' ? 'Email Address' : formType === 'username' ? 'Username' : 'Username or Email'}
                    </label>
                    <input
                      type={formType === 'email' ? 'email' : 'text'}
                      value={midLoginUser}
                      onChange={e => setMidLoginUser(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && submitMidLogin()}
                      placeholder={formType === 'email' ? 'user@example.com' : formType === 'username' ? 'your_username' : 'user@example.com or username'}
                      className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white placeholder-[#3A3A3A] outline-none"
                      style={{ background: '#0D1117', border: '1px solid #30363D' }}
                      autoFocus
                    />
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-[11px] font-600 mb-1.5" style={{ color: '#8B949E' }}>Password</label>
                    <div className="relative">
                      <input
                        type={showMidPass ? 'text' : 'password'}
                        value={midLoginPass}
                        onChange={e => setMidLoginPass(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && submitMidLogin()}
                        placeholder="••••••••"
                        className="w-full px-3 py-2.5 pr-14 rounded-xl text-[13px] text-white placeholder-[#3A3A3A] outline-none"
                        style={{ background: '#0D1117', border: '1px solid #30363D' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowMidPass(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px]"
                        style={{ color: '#555' }}
                      >
                        {showMidPass ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      type="button"
                      onClick={submitMidLogin}
                      disabled={!midLoginUser || !midLoginPass || midLoginSubmitting}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl font-700 text-[13px] transition-all"
                      style={{
                        background: (!midLoginUser || !midLoginPass || midLoginSubmitting) ? '#21262D' : '#F5A623',
                        color: (!midLoginUser || !midLoginPass || midLoginSubmitting) ? '#555' : '#0D1117',
                        cursor: (!midLoginUser || !midLoginPass || midLoginSubmitting) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {midLoginSubmitting && (
                        <span className="w-4 h-4 rounded-full border-2 border-[#0D1117] border-t-transparent animate-spin" />
                      )}
                      {midLoginSubmitting ? 'Logging in…' : loginFailed ? 'Retry Login' : 'Login & Continue'}
                    </button>

                    <button
                      type="button"
                      onClick={skipLogin}
                      className="px-4 py-2 rounded-xl text-[12px] transition-all"
                      style={{ color: '#555', background: '#161B22', border: '1px solid #30363D' }}
                    >
                      Skip Login
                    </button>
                  </div>

                  <p className="text-[10px]" style={{ color: '#3A3A3A' }}>
                    Credentials are used only for this session and are never stored.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Login success banner */}
          {stage === 'running' && loginCompleted && (
            <div className="px-4 py-3 rounded-xl flex items-center gap-3 text-[13px]"
                 style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <span>✓</span>
              <span style={{ color: '#22C55E' }}>
                Logged in as <strong>{partial?.login_user ?? preUsername}</strong> — running test cases in authenticated session
              </span>
            </div>
          )}

          {/* Results table */}
          {(stage === 'running' || stage === 'done') && !(stage === 'running' && needsLogin && !loginCompleted) && (
            <Card
              title={
                stage === 'done' && finalScore !== null
                  ? `Results — ${finalScore}% pass rate`
                  : `Running — ${liveResults.length} / ${testCases.length} complete`
              }
              accent={stage === 'done' ? scoreCol : '#3B82F6'}
              action={
                stage === 'running' ? undefined :
                <span className="text-[12px] font-mono" style={{ color: '#8B949E' }}>
                  {totals.pass} passed · {totals.fail} failed · {totals.err} errors
                </span>
              }
            >
              {/* Score bar */}
              {(stage === 'running' || stage === 'done') && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px]" style={{ color: '#555' }}>Pass rate</span>
                    <span className="font-mono font-700 text-[13px]" style={{ color: scoreCol }}>{score}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#21262D] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${score}%`, background: scoreCol }} />
                  </div>
                </div>
              )}

              <p className="text-[11px] mb-3" style={{ color: '#3A3A3A' }}>
                Click any row to expand the full <strong style={{ color: '#C9D1D9' }}>Why Pass / Why Fail</strong> details and screenshot.
              </p>

              <div className="overflow-x-auto" style={{ maxHeight: 600, overflowY: 'auto' }}>
                <table className="be-table w-full">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Test Name / Expected</th>
                      <th>Type</th>
                      <th>Status · Reason</th>
                      <th>Summary</th>
                      <th>Severity</th>
                      <th>Time</th>
                      <th>Screenshot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testCases.map((tc, i) => {
                      const res = displayResults.find(r => r.id === tc.id) ?? displayResults[i]
                      const isRunning = stage === 'running' && i === liveResults.length
                      return (
                        <ResultRow key={tc.id || i} tc={tc} res={res} isRunning={isRunning} />
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
