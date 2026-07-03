// src/pages/QAScan.tsx
import { useEffect, useRef, useState } from 'react'
import { api, validateUrlFormat } from '../api/client'
import { useJob } from '../hooks/useJob'
import { usePersistedState, useScrollRestore } from '../hooks/usePersistedState'
import {
  Card, LogTerminal, RunButton, StopButton, GhostBtn,
  Input, Select, CheckPill, ScoreRing, CategoryRing, ScanStatus,
} from '../components/ui'

const CHECKS = [
  { key: 'health_score',   label: 'Site Health' },
  { key: 'seo',            label: 'SEO' },
  { key: 'accessibility',  label: 'Accessibility' },
  { key: 'performance',    label: 'Performance' },
  { key: 'security',       label: 'Security' },
  { key: 'broken_links',   label: 'Links' },
  { key: 'console',        label: 'Console' },
  { key: 'responsive',     label: 'Responsive' },
  { key: 'keyboard_access',label: 'Keyboard' },
  { key: 'mixed_content',  label: 'Mixed Content' },
  { key: 'content',        label: 'Content' },
  { key: 'forms',          label: 'Forms' },
  { key: 'typography',     label: 'Typography' },
  { key: 'html_quality',   label: 'HTML' },
  { key: 'images',         label: 'Images' },
  { key: 'navigation',     label: 'Nav' },
]

export default function QAScan() {
  const { state, startJob, cancel, reset } = useJob('qa_scan')
  const [url,     setUrl]    = usePersistedState('qa_url', '')
  const [viewport,setVp]     = usePersistedState('qa_viewport', 'desktop')
  const [maxPg,   setMaxPg]  = usePersistedState('qa_maxpg', '5')
  const [checks,  setChecks] = usePersistedState('qa_checks', CHECKS.map(c => c.key))
  const [showPreview,  setShowPreview]  = usePersistedState('qa_showPreview', false)
  const [previewFor,   setPreviewFor]   = usePersistedState<string | null>('qa_preview_for', null)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [aiInsights,   setAiInsights]   = usePersistedState<string | null>('qa_ai_insights', null)
  const [aiLoading,    setAiLoading]    = useState(false)
  const [urlErr,       setUrlErr]       = useState('')
  const previewRef = useRef<HTMLIFrameElement | null>(null)

  const running = state.status === 'running'
  const result  = state.result
  const partial = state.partial
  // While running, fall back to the in-progress partial breakdown so category
  // rings and counts fill in as each check completes instead of staying at
  // 0/0 until the whole scan finishes.
  const liveDetails = result?.details ?? partial?.details

  useScrollRestore('qa_scan')

  useEffect(() => {
    if (showPreview && previewFor) {
      setIframeLoaded(false)
    }
  }, [showPreview, previewFor])

  const reportUrl = (href: string) => api.getReportUrl(href.replace(/^\/reports\//, ''))

  async function run() {
    let targetUrl = url.trim()
    if (!targetUrl) return
    if (!/^https?:\/\//i.test(targetUrl)) { targetUrl = 'https://' + targetUrl; setUrl(targetUrl) }
    const fmtErr = validateUrlFormat(targetUrl)
    if (fmtErr) { setUrlErr(fmtErr); return }
    setUrlErr('')

    setPreviewFor(targetUrl)
    setShowPreview(true)
    setIframeLoaded(false)
    setAiInsights(null)

    reset()
    const { job_id } = await api.qaScan({
      url: targetUrl, viewport, max_pages: +maxPg, checks,
    })
    startJob(job_id)
  }

  async function getAiInsights() {
    if (!result) return
    setAiLoading(true)
    try {
      const resp = await fetch('/api/scan/ai-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: result.url || url,
          health_score: result.health_score,
          total_issues: result.total_issues,
          pages_scanned: result.pages_scanned,
          details: result.details,
          image_issues: result.image_issues?.slice(0, 10),
          link_issues: result.link_issues?.slice(0, 10),
          test_cases: result.test_cases?.filter((t: any) => t.Result === 'FAIL' || t.Result === 'Fail').slice(0, 20),
        }),
      })
      const data = await resp.json()
      setAiInsights(data.analysis || data.recommendations || 'No insights available.')
    } catch (e) {
      setAiInsights('AI analysis failed: ' + String(e))
    }
    setAiLoading(false)
  }

  function closePreview() {
    setShowPreview(false)
    setPreviewFor(null)
    setIframeLoaded(false)
  }

  const toggle = (k: string) => setChecks(cs => cs.includes(k) ? cs.filter(x => x !== k) : [...cs, k])

  return (
    <div className="p-6 max-w-[1600px] mx-auto flex flex-col gap-6 animate-slide-in">

      {/* ── LIVE PREVIEW ─────────────────────────────────────────────── */}
      {showPreview && previewFor && (
        <Card title={`Live Preview — ${previewFor}`} accent="#3B82F6">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[11px] font-mono text-[#8B949E] flex-1">
              {iframeLoaded
                ? 'Live view of the target site (proxied through SiteSentinel — X-Frame-Options stripped).'
                : 'Loading live page…'}
            </span>
            <GhostBtn onClick={closePreview} label="Close Preview" icon="✕" />
          </div>
          {!iframeLoaded && (
            <div className="flex items-center justify-center rounded-xl border border-[#30363D] bg-[#0D1117]"
                 style={{ height: 360 }}>
              <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 rounded-full border-2 border-[#3B82F6] border-t-transparent animate-spin" />
                <span className="text-[#8B949E] text-sm">Loading {previewFor}…</span>
              </div>
            </div>
          )}
          <iframe
            key={previewFor}
            src={`/api/scan/page-proxy?url=${encodeURIComponent(previewFor)}`}
            title="Site Preview"
            className="w-full rounded-xl border border-[#30363D]"
            style={{ height: 480, display: iframeLoaded ? 'block' : 'none' }}
            onLoad={() => setIframeLoaded(true)}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          />
        </Card>
      )}

      {/* ── HEADER DASHBOARD ─────────────────────────────────────────── */}
      <div className="flex gap-6 items-stretch">
        <div className="be-card p-8 flex items-center justify-center bg-gradient-to-br from-[#161B22] to-[#0D1117]">
          <ScoreRing score={result?.health_score ?? null} size={160} label="Site Health" />
        </div>

        <div className="flex-1 be-card p-6 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-display font-800 text-[18px] text-white">Category Performance</h3>
            <div className="flex gap-3">
              <Badge label={`${result?.pages_scanned ?? 0} Pages`} type="info" />
              <Badge label={`${result?.total_issues ?? partial?.checks_failed ?? 0} Issues`} type={(result?.total_issues ?? partial?.checks_failed ?? 0) > 0 ? 'error' : 'success'} />
            </div>
          </div>
          <div className="flex flex-wrap gap-8 justify-between">
            {CHECKS.map(c => (
              <CategoryRing
                key={c.key}
                label={c.label}
                count={liveDetails?.[c.key]?.passed ?? 0}
                total={(liveDetails?.[c.key]?.passed ?? 0) + (liveDetails?.[c.key]?.failed ?? 0)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── CONFIG + LOGS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-6 items-start">
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-6">
          <Card title="Scan Configuration" accent="var(--pro-orange)">
            <Input label="Target URL" value={url} onChange={setUrl} placeholder="https://example.com" type="url" className="mb-4" error={urlErr}/>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <Select label="Device Viewport" value={viewport} onChange={setVp} options={[
                { value: 'desktop', label: 'Desktop 1920' },
                { value: 'mac',     label: 'Mac 1440' },
                { value: 'laptop',  label: 'Laptop 1366' },
                { value: 'mobile',  label: 'Mobile 430' },
              ]} />
              <Input label="Scan Depth" value={maxPg} onChange={setMaxPg} type="number" />
            </div>

            <p className="font-display font-700 text-[10px] uppercase tracking-widest text-[#484F58] mb-3">Analysis Scope</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {CHECKS.map(c => (
                <CheckPill key={c.key} checked={checks.includes(c.key)} onChange={() => toggle(c.key)} label={c.label} />
              ))}
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-[#30363D]">
              <RunButton onClick={run} disabled={!url || running} loading={running} label={running ? 'Analyzing...' : 'Execute Matrix Scan'} />
              <StopButton onClick={cancel} disabled={!running} />
              <GhostBtn onClick={reset} label="Reset" />
            </div>
          </Card>

          <LogTerminal logs={state.logs} height="h-[500px]" title="Real-time Matrix Output" />
        </div>

        {/* ── RESULTS COLUMN ───────────────────────────────────────────── */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-6">
          {result ? (
            <>
              <Card title="Scan Complete" accent="#22C55E">
                <div className="flex flex-col gap-4 p-2">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
                         style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
                      ✅
                    </div>
                    <div>
                      <p className="text-white font-display font-700 text-[15px]">Analysis finished</p>
                      <p className="text-[#8B949E] text-sm mt-0.5">
                        Health score: <span className="text-[#22C55E] font-700">{result.health_score ?? 0}/100</span>
                        {' · '}
                        {result.total_issues ?? 0} issue{result.total_issues === 1 ? '' : 's'} found
                        {' · '}
                        {result.pages_scanned ?? 0} page{result.pages_scanned === 1 ? '' : 's'} scanned
                      </p>
                    </div>
                  </div>

                  {/* Report download buttons */}
                  <div className="flex flex-wrap gap-2 pt-3 border-t border-[#30363D]">
                    {result.report_html && (
                      <GhostBtn
                        onClick={() => window.open(reportUrl(result.report_html), '_blank')}
                        label="View HTML Report" icon="👁️"
                      />
                    )}
                    {result.report_xlsx && (
                      <GhostBtn
                        onClick={() => {
                          const href = reportUrl(result.report_xlsx)
                          const filename = href.split('/').pop() || 'report.xlsx'
                          const a = document.createElement('a'); a.href = href; a.download = filename; a.click()
                        }}
                        label="Download Excel" icon="📊"
                      />
                    )}
                    {result.report_json && (
                      <GhostBtn
                        onClick={() => {
                          const href = reportUrl(result.report_json)
                          const filename = href.split('/').pop() || 'report.json'
                          const a = document.createElement('a'); a.href = href; a.download = filename; a.click()
                        }}
                        label="Download JSON" icon="⬇️"
                      />
                    )}
                    <GhostBtn
                      onClick={getAiInsights}
                      label={aiLoading ? 'Analyzing…' : 'AI Insights'}
                      icon="◎"
                    />
                  </div>
                </div>
              </Card>

              {/* ── AI INSIGHTS ────────────────────────────────────────── */}
              {(aiInsights || aiLoading) && (
                <Card title="AI-Powered Recommendations" accent="#A855F7">
                  {aiLoading ? (
                    <div className="flex items-center gap-3 py-4">
                      <div className="w-5 h-5 rounded-full border-2 border-[#A855F7] border-t-transparent animate-spin flex-shrink-0" />
                      <span className="text-[#8B949E] text-sm">Analysing scan results with AI…</span>
                    </div>
                  ) : (
                    <div className="text-[13px] leading-relaxed text-[#C9D1D9] whitespace-pre-wrap font-body">
                      {aiInsights}
                    </div>
                  )}
                </Card>
              )}
            </>
          ) : state.status !== 'idle' ? (
            <>
              <ScanStatus
                title="QA Scan"
                status={state.status}
                progress={state.progress}
                partial={partial}
                result={result}
                accent="#3B82F6"
              />
              {state.status === 'error' && (
                <div className="flex justify-end">
                  <RunButton onClick={run} label="Retry Scan" color="#3B82F6" icon="↻" />
                </div>
              )}
            </>
          ) : (
            <div className="be-card p-20 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-[#161B22] flex items-center justify-center mb-4 border border-[#30363D]">
                <span className="text-2xl">🔍</span>
              </div>
              <h4 className="text-white font-display font-700 text-lg mb-2">Ready to Scan</h4>
              <p className="text-[#8B949E] text-sm max-w-xs">
                Enter a URL and click <em>Execute Matrix Scan</em>. Results, AI insights, and reports will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Badge({ label, type }: { label: string, type: 'info'|'success'|'error'|'warn' }) {
  const map = {
    info:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
    success: 'bg-green-500/10 text-green-400 border-green-500/20',
    error:   'bg-red-500/10 text-red-400 border-red-500/20',
    warn:    'bg-amber-500/10 text-amber-400 border-amber-500/20',
  }
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-700 border ${map[type]}`}>{label}</span>
}
