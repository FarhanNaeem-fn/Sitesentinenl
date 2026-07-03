// src/pages/AIRanking.tsx — AI Visibility & Ranking Auditor
import { useState } from 'react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { api, validateUrlFormat } from '../api/client'
import { useJob } from '../hooks/useJob'
import { usePersistedState } from '../hooks/usePersistedState'
import {
  Card, KpiTile, LogTerminal, RunButton, StopButton, Input, Toggle, Badge, ScoreRing,
} from '../components/ui'

/* ── colors ──────────────────────────────────────────────────────────────── */
const PUR = '#A855F7'
const GRN = '#22C55E'
const RED = '#EF4444'
const AMB = '#F59E0B'
const BLU = '#3B82F6'
const G   = '#F5A623'

const TT = {
  contentStyle: { background:'#161616', border:'1px solid #333', borderRadius:8, color:'#F0F0F0', fontSize:11 },
  itemStyle:    { color:'#888' },
  labelStyle:   { color: PUR },
}
const AX = { tick:{fontSize:10,fill:'#3A3A3A'}, axisLine:{stroke:'#242424'}, tickLine:false as any }

/* ── helpers ─────────────────────────────────────────────────────────────── */
function scoreColor(s: number | null) {
  if (s === null) return '#484F58'
  return s >= 80 ? GRN : s >= 60 ? AMB : RED
}

function ScoreBadge({ score }: { score: number }) {
  const col = scoreColor(score)
  const label = score >= 80 ? 'EXCELLENT' : score >= 60 ? 'GOOD' : score >= 40 ? 'NEEDS WORK' : 'POOR'
  return (
    <span className="px-2 py-0.5 rounded-full font-display font-700 text-[10px]"
          style={{ background: `${col}18`, color: col, border: `1px solid ${col}44` }}>
      {label}
    </span>
  )
}

function StatusDot({ status }: { status: string }) {
  const col = status === 'allowed' ? GRN : status === 'partial' ? AMB : status === 'blocked' ? RED : '#484F58'
  const label = status.toUpperCase()
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col, boxShadow: `0 0 6px ${col}88` }} />
      <span className="font-mono font-700 text-[10px]" style={{ color: col }}>{label}</span>
    </div>
  )
}

function ScoreBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#21262D' }}>
        <div className="h-full rounded-full transition-all duration-700"
             style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}66` }} />
      </div>
      <span className="font-mono text-[11px] w-8 text-right flex-shrink-0" style={{ color }}>{value}</span>
    </div>
  )
}

function CheckRow({ item }: { item: { label: string; pass: boolean; pts: number; max: number } }) {
  const col = item.pass ? GRN : item.pts > 0 ? AMB : RED
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-[#1A1A1A] last:border-0">
      <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-700"
           style={{ background: item.pass ? `${GRN}18` : `${RED}18`, color: col }}>
        {item.pass ? '✓' : '✕'}
      </div>
      <span className="flex-1 font-body text-[12px]" style={{ color: item.pass ? '#C0C0C0' : '#666' }}>
        {item.label}
      </span>
      <span className="font-mono text-[11px] flex-shrink-0" style={{ color: col }}>
        {item.pts}/{item.max}
      </span>
    </div>
  )
}

/* ── Audit History row ───────────────────────────────────────────────────── */
function HistoryRow({ a, onLoad }: { a: any; onLoad: (id: string) => void }) {
  const col = scoreColor(a.overall_score)
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg border border-[#1E1E1E] hover:border-[#333] cursor-pointer transition-all"
         onClick={() => onLoad(a.audit_id)}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center font-mono font-700 text-[13px] flex-shrink-0"
           style={{ background: `${col}15`, color: col }}>{a.overall_score}</div>
      <div className="flex-1 min-w-0">
        <p className="font-body text-[12px] text-[#C0C0C0] truncate">{a.url}</p>
        <p className="font-mono text-[9px] text-[#484F58]">{a.timestamp?.slice(0,19)?.replace('T',' ')}</p>
      </div>
      <div className="flex gap-2 flex-shrink-0 text-[10px] font-mono">
        <span style={{ color: BLU }}>T:{a.technical_score}</span>
        <span style={{ color: PUR }}>C:{a.content_score}</span>
        <span style={{ color: G }}>TR:{a.trust_score}</span>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════ */
export function AIRanking() {
  const { state, startJob, cancel, reset } = useJob('ai_ranking')
  const [url, setUrl]             = usePersistedState('air_url', '')
  const [compUrls, setCompUrls]   = usePersistedState('air_comps', '')
  const [useLlm, setUseLlm]       = usePersistedState('air_llm', false)
  const [apiKey, setApiKey]       = usePersistedState('air_apikey', '')
  const [history, setHistory]     = useState<any[]>([])
  const [histLoaded, setHistLoaded] = useState(false)
  const [activeTab, setActiveTab] = useState<'audit'|'history'>('audit')
  const [urlErr, setUrlErr]       = useState('')

  const running = state.status === 'running'
  const result  = state.result as any

  async function run() {
    let u = url.trim()
    if (!u) return
    if (!/^https?:\/\//i.test(u)) { u = 'https://' + u; setUrl(u) }
    const fmtErr = validateUrlFormat(u)
    if (fmtErr) { setUrlErr(fmtErr); return }
    setUrlErr('')
    const competitors = compUrls.split('\n').map(s => s.trim()).filter(Boolean)
    reset()
    const { job_id } = await api.aiRanking({ url: u, competitor_urls: competitors, use_llm: useLlm, llm_api_key: apiKey })
    startJob(job_id)
  }

  async function loadHistory() {
    try {
      const data = await api.aiRankingHistory()
      setHistory(data.audits || [])
      setHistLoaded(true)
    } catch { setHistLoaded(true) }
  }

  async function loadAudit(_id: string) {
    setActiveTab('audit')
  }

  const radarData = result ? [
    { axis: 'Technical',    score: result.technical_score       ?? 0 },
    { axis: 'Content',      score: result.content_score         ?? 0 },
    { axis: 'Trust',        score: result.trust_score           ?? 0 },
    { axis: 'Schema',       score: result.structured_data_score ?? 0 },
    { axis: 'Robots',       score: result.robots_analysis?.allowed_count
        ? Math.round((result.robots_analysis.allowed_count / 13) * 100) : 0 },
  ] : []

  const barData = result ? [
    { name: 'Technical',  score: result.technical_score,       fill: BLU },
    { name: 'Content',    score: result.content_score,         fill: PUR },
    { name: 'Trust',      score: result.trust_score,           fill: G   },
    { name: 'Schema',     score: result.structured_data_score, fill: AMB },
  ] : []

  const robotCrawlers: any[] = result?.robots_analysis?.crawlers ?? []
  const tech    = result?.technical_details ?? {}
  const content = result?.content_details   ?? {}
  const trust   = result?.trust_details     ?? {}
  const sd      = result?.structured_data_details ?? {}
  const llm     = result?.llm_analysis
  const comps   = result?.competitors ?? []

  return (
    <div className="p-5 flex flex-col gap-4 min-h-full" style={{ background: '#0A0A0A' }}>

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#111' }}>
          {(['audit','history'] as const).map(t => (
            <button key={t} onClick={() => { setActiveTab(t); if (t==='history' && !histLoaded) loadHistory() }}
                    className="px-4 py-1.5 rounded-md font-display font-700 text-[11px] capitalize transition-all"
                    style={{ background: activeTab===t ? `${PUR}18` : 'transparent', color: activeTab===t ? PUR : '#555', border: activeTab===t ? `1px solid ${PUR}44` : '1px solid transparent' }}>
              {t === 'audit' ? '◎ Audit' : '≡ History'}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {result && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-[#484F58]">Overall AI Score</span>
            <span className="font-mono font-800 text-[18px]" style={{ color: scoreColor(result.overall_score) }}>
              {result.overall_score}/100
            </span>
            <ScoreBadge score={result.overall_score} />
          </div>
        )}
      </div>

      {/* ══ HISTORY TAB ══════════════════════════════════════════════════ */}
      {activeTab === 'history' && (
        <Card title="Audit History" accent={PUR}>
          {!histLoaded && <p className="text-[#484F58] font-body text-[12px] italic">Loading...</p>}
          {histLoaded && history.length === 0 && (
            <p className="text-[#484F58] font-body text-[12px] italic">No previous audits found.</p>
          )}
          <div className="flex flex-col gap-2">
            {history.map((a, i) => <HistoryRow key={i} a={a} onLoad={loadAudit} />)}
          </div>
        </Card>
      )}

      {/* ══ AUDIT TAB ════════════════════════════════════════════════════ */}
      {activeTab === 'audit' && (
        <>
          {/* KPI tiles */}
          {result && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiTile label="Overall AI Score"  value={`${result.overall_score}/100`}        accent={PUR} sub={result.overall_score >= 70 ? 'Good visibility' : 'Needs improvement'} />
              <KpiTile label="Technical"         value={`${result.technical_score}/100`}      accent={BLU} sub="Crawlability & rendering" />
              <KpiTile label="Content Quality"   value={`${result.content_score}/100`}        accent={G}   sub="AI-readable structure" />
              <KpiTile label="Trust & Authority" value={`${result.trust_score}/100`}          accent={AMB} sub="E-E-A-T signals" />
            </div>
          )}

          {/* ─ Config + Input ─ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Card title="AI Visibility Audit" accent={PUR}>
                <div className="flex flex-col gap-4">
                  <Input label="Target URL" value={url} onChange={setUrl} placeholder="https://yourwebsite.com" type="url" error={urlErr}/>
                  <div>
                    <p className="font-display font-700 text-[10px] uppercase tracking-[0.07em] mb-1.5" style={{ color: '#484F58' }}>
                      Competitor URLs (one per line, up to 3)
                    </p>
                    <textarea
                      value={compUrls} onChange={e => setCompUrls(e.target.value)}
                      placeholder="https://competitor1.com&#10;https://competitor2.com"
                      rows={3}
                      className="be-input w-full resize-y font-mono text-[11px]"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    />
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    {!running
                      ? <RunButton label="Run AI Audit" onClick={run} disabled={!url.trim()} loading={false} color={PUR} />
                      : <StopButton onClick={cancel} />}
                    {result && !running && (
                      <button className="btn-ghost" onClick={reset}>Clear</button>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            {/* LLM settings panel */}
            <Card title="Claude AI Analysis" accent={AMB}>
              <div className="flex flex-col gap-3">
                <Toggle
                  label="Enable AI Analysis"
                  description="Uses Claude Haiku to generate recommendations"
                  checked={useLlm}
                  onChange={setUseLlm}
                />
                {useLlm && (
                  <div>
                    <p className="font-display font-700 text-[10px] uppercase tracking-[0.07em] mb-1.5" style={{ color: '#484F58' }}>
                      Anthropic API Key
                    </p>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder="sk-ant-..."
                      className="be-input w-full font-mono text-[11px]"
                    />
                    <p className="font-body text-[10px] mt-1.5" style={{ color: '#484F58' }}>
                      Key is sent only to your local backend. Never stored remotely.
                    </p>
                  </div>
                )}
                <div className="pt-1 border-t border-[#1A1A1A]">
                  <p className="font-display font-700 text-[10px] uppercase tracking-[0.07em] mb-2" style={{ color: '#484F58' }}>
                    Scoring Formula
                  </p>
                  {[
                    ['Technical Readiness', '35%', BLU],
                    ['Content Quality',     '40%', PUR],
                    ['Trust & Authority',   '15%', G  ],
                    ['Structured Data',     '10%', AMB],
                  ].map(([lbl, pct, col]) => (
                    <div key={lbl as string} className="flex items-center justify-between py-1">
                      <span className="font-body text-[11px]" style={{ color: '#888' }}>{lbl}</span>
                      <span className="font-mono font-700 text-[11px]" style={{ color: col as string }}>{pct}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Log terminal */}
          <LogTerminal logs={state.logs} accent={PUR} title="AI Audit Output" />

          {/* ─── RESULTS ────────────────────────────────────────────────── */}
          {result && (
            <>
              {/* Score overview */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Radar chart */}
                <Card title="AI Visibility Radar" accent={PUR}>
                  <div className="flex justify-center">
                    <ResponsiveContainer width="100%" height={260}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="#21262D" />
                        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: '#8B949E' }} />
                        <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#484F58' }} />
                        <Radar name="Score" dataKey="score" stroke={PUR} fill={PUR} fillOpacity={0.18}
                               strokeWidth={2} dot={{ r: 3, fill: PUR }} />
                        <Tooltip {...TT} formatter={(v: any) => [`${v}/100`, 'Score']} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                {/* Bar chart + overall ring */}
                <Card title="Score Breakdown" accent={BLU}>
                  <div className="flex items-center gap-6">
                    <ScoreRing score={result.overall_score} size={110} label="Overall" />
                    <div className="flex-1">
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={barData} layout="vertical" barSize={10}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" horizontal={false} />
                          <XAxis type="number" domain={[0,100]} {...AX} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize:11, fill:'#8B949E' }} width={70} />
                          <Tooltip {...TT} formatter={(v: any) => [`${v}/100`, 'Score']} />
                          <Bar dataKey="score" radius={[0,4,4,0]}>
                            {barData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </Card>
              </div>

              {/* AI Crawler Check */}
              <Card title={`AI Crawler Access — ${result.robots_analysis?.accessible ? 'robots.txt found' : 'robots.txt NOT found'}`} accent={robotCrawlers.some(c => c.status==='blocked') ? RED : GRN}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
                  {[
                    ['Allowed',  result.robots_analysis?.allowed_count  ?? 0, GRN],
                    ['Partial',  result.robots_analysis?.partial_count  ?? 0, AMB],
                    ['Blocked',  result.robots_analysis?.blocked_count  ?? 0, RED],
                  ].map(([lbl, val, col]) => (
                    <div key={lbl as string} className="flex flex-col items-center py-3 rounded-lg"
                         style={{ background: `${col}08`, border: `1px solid ${col}22` }}>
                      <span className="font-mono font-800 text-[22px]" style={{ color: col as string }}>{val}</span>
                      <span className="font-display font-700 text-[10px] uppercase tracking-widest mt-0.5" style={{ color: col as string }}>{lbl}</span>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#1E1E1E]">
                        {['AI Crawler','Owner','Description','Status','Rule'].map(h => (
                          <th key={h} className="py-2 px-3 font-display font-700 text-[9px] uppercase tracking-widest" style={{ color: '#484F58' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {robotCrawlers.map((c, i) => (
                        <tr key={i} className="border-b border-[#111] hover:bg-[#111] transition-colors">
                          <td className="py-2 px-3 font-mono font-600 text-[12px] text-white">{c.name}</td>
                          <td className="py-2 px-3 font-body text-[11px] text-[#8B949E]">{c.owner}</td>
                          <td className="py-2 px-3 font-body text-[11px] text-[#484F58] max-w-[180px] truncate">{c.desc}</td>
                          <td className="py-2 px-3"><StatusDot status={c.status} /></td>
                          <td className="py-2 px-3 font-mono text-[10px] text-[#484F58] italic">{c.rule}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Detailed score breakdowns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Technical */}
                <Card title={`Technical Readiness — ${tech.score ?? 0}/100`} accent={BLU}>
                  <div className="flex flex-col gap-1 mb-3">
                    {[
                      ['Page Title',       tech.title,        60],
                      ['HTTPS',            tech.is_https ? '✓ Secure' : '✗ Not secure', 40],
                      ['Load Time',        tech.load_ms ? `${tech.load_ms}ms` : '—', 40],
                      ['TTFB',             tech.ttfb ? `${tech.ttfb}ms` : '—', 40],
                      ['Canonical URL',    tech.canonical || '(none)', 60],
                      ['OG Title',         tech.og_title || '(none)', 60],
                      ['Sitemap',          tech.sitemap_found ? '✓ Found' : '✗ Missing', 30],
                      ['Internal Links',   tech.internal_links ?? 0, 10],
                    ].map(([lbl, val, max]) => (
                      <div key={lbl as string} className="flex gap-2 py-1 border-b border-[#111] last:border-0">
                        <span className="font-display font-700 text-[10px] w-28 flex-shrink-0" style={{ color: '#484F58' }}>{lbl}</span>
                        <span className="font-body text-[11px] text-[#8B949E] truncate">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-[#1A1A1A]">
                    <p className="font-display font-700 text-[10px] uppercase tracking-widest mb-2" style={{ color: '#484F58' }}>Checks</p>
                    {Object.values(tech.breakdown ?? {}).map((item: any, i: number) => (
                      <CheckRow key={i} item={item} />
                    ))}
                  </div>
                </Card>

                {/* Content */}
                <Card title={`Content Quality — ${content.score ?? 0}/100`} accent={PUR}>
                  <div className="flex flex-col gap-1 mb-3">
                    {[
                      ['Word Count',    content.word_count],
                      ['H1 Tags',       (content.h1s ?? []).length + ' — ' + (content.h1s ?? []).join(', ').slice(0,50)],
                      ['H2 Headings',   (content.h2s ?? []).length],
                      ['FAQ Pattern',   content.has_faq   ? '✓ Detected' : '✗ Not found'],
                      ['Author Signal', content.has_author ? '✓ Detected' : '✗ Not found'],
                      ['Date Signal',   content.has_date   ? '✓ Detected' : '✗ Not found'],
                      ['Ext. Links',    content.external_links ?? 0],
                    ].map(([lbl, val]) => (
                      <div key={lbl as string} className="flex gap-2 py-1 border-b border-[#111] last:border-0">
                        <span className="font-display font-700 text-[10px] w-28 flex-shrink-0" style={{ color: '#484F58' }}>{lbl}</span>
                        <span className="font-body text-[11px] text-[#8B949E]">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-[#1A1A1A]">
                    <p className="font-display font-700 text-[10px] uppercase tracking-widest mb-2" style={{ color: '#484F58' }}>Checks</p>
                    {Object.values(content.breakdown ?? {}).map((item: any, i: number) => (
                      <CheckRow key={i} item={item} />
                    ))}
                  </div>
                </Card>

                {/* Trust */}
                <Card title={`Trust & Authority — ${trust.score ?? 0}/100`} accent={G}>
                  <div className="pt-1">
                    {Object.values(trust.breakdown ?? {}).map((item: any, i: number) => (
                      <CheckRow key={i} item={item} />
                    ))}
                  </div>
                </Card>

                {/* Structured Data */}
                <Card title={`Structured Data — ${sd.score ?? 0}/100`} accent={AMB}>
                  <div className="flex gap-3 mb-3">
                    <div className="flex flex-col items-center p-3 rounded-lg flex-1" style={{ background: '#111' }}>
                      <span className="font-mono font-800 text-[22px]" style={{ color: AMB }}>{sd.json_ld_count ?? 0}</span>
                      <span className="font-display font-700 text-[9px] uppercase tracking-widest mt-0.5" style={{ color: '#484F58' }}>JSON-LD blocks</span>
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      {(sd.schema_types ?? []).slice(0,6).map((s: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 rounded font-mono text-[10px] w-fit"
                              style={{ background: `${AMB}15`, color: AMB }}>{s}</span>
                      ))}
                      {!(sd.schema_types?.length) && (
                        <span className="font-body text-[11px] italic" style={{ color: '#484F58' }}>No schemas found</span>
                      )}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-[#1A1A1A]">
                    {Object.values(sd.breakdown ?? {}).map((item: any, i: number) => (
                      <CheckRow key={i} item={item} />
                    ))}
                  </div>
                </Card>
              </div>

              {/* Competitor Comparison */}
              {comps.length > 0 && (
                <Card title="Competitor Comparison" accent={BLU}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#1E1E1E]">
                          {['URL','Overall','Technical','Content','Trust','Schema'].map(h => (
                            <th key={h} className="py-2 px-3 font-display font-700 text-[9px] uppercase tracking-widest" style={{ color: '#484F58' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Target row */}
                        <tr className="border-b border-[#1E1E1E]" style={{ background: `${PUR}06` }}>
                          <td className="py-2 px-3 font-body text-[11px] text-[#C0C0C0] max-w-[200px] truncate">
                            <span className="text-[9px] font-700 mr-1 px-1 rounded" style={{ background: `${PUR}22`, color: PUR }}>YOU</span>
                            {result.url}
                          </td>
                          {[result.overall_score, result.technical_score, result.content_score, result.trust_score, result.structured_data_score].map((s, i) => (
                            <td key={i} className="py-2 px-3">
                              <ScoreBar value={s ?? 0} color={scoreColor(s ?? 0)} />
                            </td>
                          ))}
                        </tr>
                        {comps.map((c: any, i: number) => (
                          <tr key={i} className="border-b border-[#111] hover:bg-[#0F0F0F]">
                            <td className="py-2 px-3 font-body text-[11px] text-[#666] max-w-[200px] truncate">{c.url}</td>
                            {[c.overall_score, c.technical_score, c.content_score, c.trust_score, c.sd_score].map((s: number, j: number) => (
                              <td key={j} className="py-2 px-3">
                                <ScoreBar value={s ?? 0} color={scoreColor(s ?? 0)} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* LLM Analysis panel */}
              {llm && (
                <Card title="Claude AI Analysis" accent={AMB}>
                  <div className="flex flex-col gap-5">

                    {/* Verdict + summary */}
                    <div className="flex items-start gap-4">
                      {llm.visibility_verdict && (
                        <div className="flex-shrink-0 px-3 py-1.5 rounded-lg font-display font-800 text-[13px]"
                             style={{
                               background: llm.visibility_verdict==='EXCELLENT' ? `${GRN}18`
                                         : llm.visibility_verdict==='GOOD'      ? `${AMB}18`
                                         : `${RED}18`,
                               color:      llm.visibility_verdict==='EXCELLENT' ? GRN
                                         : llm.visibility_verdict==='GOOD'      ? AMB : RED,
                               border:     `1px solid ${llm.visibility_verdict==='EXCELLENT' ? GRN : llm.visibility_verdict==='GOOD' ? AMB : RED}44`,
                             }}>
                          {llm.visibility_verdict}
                        </div>
                      )}
                      <p className="font-body text-[13px] leading-relaxed" style={{ color: '#C0C0C0' }}>
                        {llm.summary}
                      </p>
                    </div>

                    {/* Strengths + Issues side by side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {llm.strengths?.length > 0 && (
                        <div>
                          <p className="font-display font-700 text-[11px] uppercase tracking-widest mb-2" style={{ color: GRN }}>
                            ✓ Strengths
                          </p>
                          <div className="flex flex-col gap-2">
                            {llm.strengths.map((s: string, i: number) => (
                              <div key={i} className="flex gap-2 p-2 rounded-lg" style={{ background: `${GRN}08`, border: `1px solid ${GRN}18` }}>
                                <span className="text-[10px] mt-0.5" style={{ color: GRN }}>✓</span>
                                <span className="font-body text-[12px]" style={{ color: '#C0C0C0' }}>{s}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {llm.critical_issues?.length > 0 && (
                        <div>
                          <p className="font-display font-700 text-[11px] uppercase tracking-widest mb-2" style={{ color: RED }}>
                            ✕ Critical Issues
                          </p>
                          <div className="flex flex-col gap-2">
                            {llm.critical_issues.map((iss: any, i: number) => {
                              const col = iss.severity==='CRITICAL' ? RED : iss.severity==='HIGH' ? AMB : '#F59E0B'
                              return (
                                <div key={i} className="p-2.5 rounded-lg" style={{ background: `${col}08`, border: `1px solid ${col}22` }}>
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge label={iss.severity} type={iss.severity==='CRITICAL'||iss.severity==='HIGH' ? 'error' : 'warn'} />
                                    <span className="font-display font-700 text-[11px]" style={{ color: '#E0E0E0' }}>{iss.issue}</span>
                                  </div>
                                  <p className="font-body text-[10px] mb-0.5" style={{ color: '#666' }}>{iss.impact}</p>
                                  <p className="font-body text-[10px]" style={{ color: col }}>Fix: {iss.fix}</p>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Improvement roadmap */}
                    {llm.roadmap?.length > 0 && (
                      <div>
                        <p className="font-display font-700 text-[11px] uppercase tracking-widest mb-3" style={{ color: PUR }}>
                          Improvement Roadmap
                        </p>
                        <div className="flex flex-col gap-2">
                          {llm.roadmap.map((step: any, i: number) => {
                            const col = step.priority==='HIGH' ? RED : step.priority==='MEDIUM' ? AMB : BLU
                            return (
                              <div key={i} className="flex gap-3 p-3 rounded-lg" style={{ background: '#111', border: '1px solid #1E1E1E' }}>
                                <div className="w-7 h-7 rounded-full flex items-center justify-center font-mono font-800 text-[13px] flex-shrink-0"
                                     style={{ background: `${PUR}22`, color: PUR }}>{step.step}</div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <span className="font-display font-700 text-[12px]" style={{ color: '#E0E0E0' }}>{step.action}</span>
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-700" style={{ background: `${col}15`, color: col }}>
                                      {step.priority}
                                    </span>
                                  </div>
                                  <div className="flex gap-3">
                                    <span className="font-mono text-[10px]" style={{ color: '#484F58' }}>⏱ {step.effort}</span>
                                    <span className="font-mono text-[10px]" style={{ color: GRN }}>{step.expected_impact}</span>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* AI Prompt Examples */}
                    {llm.ai_prompt_examples?.length > 0 && (
                      <div>
                        <p className="font-display font-700 text-[11px] uppercase tracking-widest mb-2" style={{ color: BLU }}>
                          AI Prompt Simulation — Queries this page could answer
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {llm.ai_prompt_examples.map((q: string, i: number) => (
                            <div key={i} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: `${BLU}08`, border: `1px solid ${BLU}18` }}>
                              <span className="font-mono text-[11px] flex-shrink-0" style={{ color: BLU }}>?</span>
                              <span className="font-body text-[12px] italic" style={{ color: '#8B949E' }}>{q}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Info panel when no LLM key */}
              {!llm && (
                <div className="p-4 rounded-xl border flex items-start gap-3"
                     style={{ background: `${AMB}06`, borderColor: `${AMB}22` }}>
                  <span className="text-[18px] flex-shrink-0 mt-0.5">💡</span>
                  <div>
                    <p className="font-display font-700 text-[12px] mb-0.5" style={{ color: AMB }}>
                      Enable Claude AI Analysis for deeper insights
                    </p>
                    <p className="font-body text-[12px]" style={{ color: '#666' }}>
                      Enter your Anthropic API key in the panel above to get AI-generated recommendations,
                      improvement roadmaps, and AI prompt simulations based on your audit data.
                    </p>
                  </div>
                </div>
              )}

              {/* Report exports */}
              <div className="p-4 rounded-xl border flex items-center gap-3 flex-wrap"
                   style={{ background: '#111', borderColor: '#1E1E1E' }}>
                <span className="font-display font-700 text-[11px] uppercase tracking-widest flex-shrink-0" style={{ color: '#484F58' }}>
                  Download Report
                </span>
                <button
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-display font-700 text-[12px] transition-all"
                  style={{ background: `${PUR}18`, color: PUR, border: `1px solid ${PUR}44` }}
                  onClick={() => {
                    const a = document.createElement('a')
                    a.href = `/api/ai-ranking/audit/${result.audit_id}/html`
                    a.target = '_blank'
                    a.click()
                  }}>
                  ◈ HTML Report
                </button>
                <button
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-display font-700 text-[12px] transition-all"
                  style={{ background: `${GRN}18`, color: GRN, border: `1px solid ${GRN}44` }}
                  onClick={() => {
                    const a = document.createElement('a')
                    a.href = `/api/ai-ranking/audit/${result.audit_id}/xlsx`
                    a.download = `ai-ranking-${result.domain}-${result.audit_id}.xlsx`
                    a.click()
                  }}>
                  ⊞ Excel Report
                </button>
                <button
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-display font-700 text-[12px] transition-all"
                  style={{ background: '#1A1A1A', color: '#888', border: '1px solid #2A2A2A' }}
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(blob)
                    a.download = `ai-ranking-${result.domain}-${result.audit_id}.json`
                    a.click()
                  }}>
                  ↓ JSON Data
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
