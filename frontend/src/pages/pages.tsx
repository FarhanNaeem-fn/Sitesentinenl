// src/pages/pages.tsx — All QA modules, BugEater dark-gold theme
import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, Cell, PieChart, Pie, Legend,
} from 'recharts'
import { api, validateUrlFormat } from '../api/client'
import { useJob } from '../hooks/useJob'
import { usePersistedState } from '../hooks/usePersistedState'
import {
  Card, KpiTile, LogTerminal, RunButton, StopButton, GhostBtn,
  Input, Select, Gauge, ScoreRing, Toggle, CheckPill, Badge, UserGuideButton,
} from '../components/ui'
import { UG_LOAD, UG_PAGINATION, UG_INTL, UG_LIGHTHOUSE, UG_MOBILE, UG_BASELINE } from '../config/userGuides'
export { UnicornSuite } from './UnicornSuite'

/* ── shared colors ──────────────────────────────────────── */
const G='#F5A623', GRN='#22C55E', RED='#EF4444', BLU='#3B82F6', PUR='#A855F7', AMB='#F59E0B'
const TT = { contentStyle:{background:'#161616',border:'1px solid #333',borderRadius:8,color:'#F0F0F0',fontSize:11}, itemStyle:{color:'#888'}, labelStyle:{color:'#F5A623'} }
const AX = { tick:{fontSize:10,fill:'#3A3A3A'}, axisLine:{stroke:'#242424'}, tickLine:false as any }

/* ── reusable label ─────────────────────────────────────── */
function FieldLabel({ text }: { text: string }) {
  return <p className="font-display font-700 text-[10px] uppercase tracking-[0.07em] mb-1.5" style={{ color: '#3A3A3A' }}>{text}</p>
}

function Divider() { return <div className="w-px h-7 bg-bdr mx-1 flex-shrink-0" /> }

/* ══════════════════════════════════════════════════════════
   LOAD TESTING
══════════════════════════════════════════════════════════ */
const LOAD_TYPES = [
  { value:'performance', icon:'⚙️', label:'Performance', color:BLU, desc:'Standard production load assessment for throughput and latency' },
  { value:'stability',   icon:'🧪', label:'Stability',   color:GRN, desc:'Sustained load testing for long-term platform stability' },
  { value:'load',        icon:'⚡', label:'Load',        color:BLU, desc:'Normal production load at expected user count' },
  { value:'stress',      icon:'🔥', label:'Stress',      color:RED, desc:'Push beyond capacity to find the breaking point' },
  { value:'spike',       icon:'📈', label:'Spike',       color:G,   desc:'Sudden traffic surge to test autoscaling and recovery' },
  { value:'breakpoint',  icon:'💥', label:'Breakpoint',  color:RED, desc:'Slow ramp until the system breaks' },
  { value:'endurance',   icon:'⏱', label:'Endurance',   color:AMB, desc:'Sustained moderate load — detects leaks and drift' },
  { value:'rampup',      icon:'🚀', label:'Ramp-Up',     color:GRN, desc:'Gradual increase to validate growth handling' },
]
const UNICORN_SCENARIOS = [
  { value:'login_browse_checkout',label:'Login → Browse → Checkout' },
  { value:'search_filter_view',   label:'Search → Filter → View Detail' },
  { value:'api_auth_crud',        label:'API Auth → CRUD Operations' },
  { value:'homepage_nav_form',    label:'Homepage → Navigation → Form' },
]

export function LoadTest() {
  const { state, startJob, finishJob, cancel, reset } = useJob('load_test')
  const [url,setUrl]=usePersistedState('load_url','')
  const [selectedTypes,setSelectedTypes]=usePersistedState<string[]>('load_types',['load'])
  const [vu,setVu]=usePersistedState('load_vu','100')
  const [dur,setDur]=usePersistedState('load_dur','2')
  const [ramp,setRamp]=usePersistedState('load_ramp','30')
  const [think,setThink]=usePersistedState('load_think','500')
  const [urlErr,setUrlErr]=useState('')

  const running=state.status==='running'
  const result=state.result, partial=state.partial
  const liveRPS = partial?.current_rps ?? result?.peak_rps ?? 0
  const liveP50 = partial?.current_p50 ?? result?.final_p50 ?? null
  const liveP95 = partial?.current_p95 ?? result?.final_p95 ?? null
  const liveErr = partial?.current_err ?? null
  const liveVu  = partial?.current_vu  ?? 0
  const chart = result?.rps_series?.map((rps:number,i:number)=>({t:i,rps,p50:result.p50_series[i],p95:result.p95_series[i]})) ?? []

  const toggleType = (value:string) => setSelectedTypes(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])

  async function run(){
    let targetUrl = url.trim()
    if(!targetUrl || selectedTypes.length===0) return
    if(!/^https?:\/\//i.test(targetUrl)) { targetUrl = 'https://' + targetUrl; setUrl(targetUrl) }
    const fmtErr = validateUrlFormat(targetUrl)
    if(fmtErr){ setUrlErr(fmtErr); return }
    setUrlErr('')
    reset()
    const payload: any = await api.loadTest({
      url: targetUrl,
      test_types: selectedTypes,
      virtual_users: +vu,
      duration_min: +dur,
      ramp_up_sec: +ramp,
      think_time_ms: +think,
    })

    if (payload?.job_id) {
      startJob(payload.job_id)
      return
    }

    // Direct load test result payload (Vercel / synchronous execution path)
    if (payload?.id && payload?.status === 'done' && payload?.result) {
      finishJob(payload.result, payload.logs || [])
      return
    }

    finishJob(payload, payload.logs || [])
  }

  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="flex gap-3">
        <KpiTile label="Peak RPS"    value={result?.peak_rps??0}            accent={BLU}/>
        <KpiTile label="P50 Latency" value={liveP50?liveP50+'ms':'—'}        accent={GRN}/>
        <KpiTile label="P95 Latency" value={liveP95?liveP95+'ms':'—'}        accent={G}/>
        <KpiTile label="Error Rate"  value={liveErr!=null?liveErr+'%':'—'}   accent={RED}/>
      </div>

      {/* Strategy */}
      <Card title="Test Strategy" accent={BLU} action={<UserGuideButton config={UG_LOAD} color={BLU}/>}> 
        <div className="mb-2 text-xs text-slate-400">
          {selectedTypes.length > 0
            ? `Selected: ${selectedTypes.map(s => s.toUpperCase()).join(', ')}`
            : 'Choose one or more test types for a multi-route load run.'}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {LOAD_TYPES.map(lt=>(
            <button key={lt.value} onClick={()=>toggleType(lt.value)}
              className="p-3 rounded-xl text-left cursor-pointer transition-all"
              style={{
                background: selectedTypes.includes(lt.value) ? `${lt.color}12` : '#161616',
                border: `1px solid ${selectedTypes.includes(lt.value) ? lt.color : '#242424'}`,
                boxShadow: selectedTypes.includes(lt.value) ? `0 0 12px ${lt.color}22` : 'none'
              }}>
              <div className="text-[18px] mb-1.5">{lt.icon}</div>
              <div className="font-display font-700 text-[12px]" style={{color:selectedTypes.includes(lt.value)?'#F0F0F0':'#888'}}>{lt.label}</div>
              <div className="font-body text-[10px] mt-1 leading-relaxed" style={{color:'#3A3A3A'}}>{lt.desc}</div>
            </button>
          ))}
        </div>
      </Card>

      <div className="flex gap-4">
        <div className="flex-1 flex flex-col gap-4">
          <Card title="Configuration" accent={BLU}>
            <Input label="Target URL" value={url} onChange={setUrl} placeholder="https://example.com" type="url" className="mb-3" error={urlErr}/>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Virtual Users" value={vu}  onChange={setVu}   type="number"/>
              <Input label="Duration (min)" value={dur} onChange={setDur}  type="number"/>
              <Input label="Ramp-Up (sec)"  value={ramp} onChange={setRamp} type="number"/>
            </div>
          </Card>
          <div className="flex gap-2.5">
            <RunButton onClick={run} disabled={!url||running} loading={running} label={running?'Running…':'Run Load Test'} color={BLU}/>
            <StopButton onClick={cancel} disabled={!running}/>
            <GhostBtn onClick={reset} label="Clear"/>
          </div>
          <LogTerminal logs={state.logs} accent={BLU} title="Load Test Output"/>
        </div>

        {/* Live metrics */}
        <div className="w-48 flex-shrink-0">
          <Card title="Live Metrics" accent={BLU}>
            <div className="text-center pb-3 mb-3 border-b border-bdr">
              <FieldLabel text="Req / sec"/>
              <p className="font-mono font-600 text-[32px] leading-none mt-1" style={{color:BLU,filter:running?`drop-shadow(0 0 10px ${BLU}66)`:'none'}}>{liveRPS}</p>
            </div>
            {[['P50',liveP50,GRN],['P95',liveP95,G],['P99',result?.final_p99,RED]].map(([l,v,c])=>(
              <div key={l as string} className="flex justify-between items-center py-2 border-b border-bdr last:border-0">
                <span className="font-display font-700 text-[10px]" style={{color:'#3A3A3A'}}>{l}</span>
                <span className="font-mono font-600 text-[13px]" style={{color:c as string}}>{v?v+'ms':'—'}</span>
              </div>
            ))}
            {running&&liveVu>0&&(
              <div className="mt-3 pt-3 border-t border-bdr">
                <FieldLabel text={`VUs: ${liveVu} / ${vu}`}/>
                <div className="h-1 rounded-full overflow-hidden" style={{background:'#1C1C1C'}}>
                  <div className="h-full rounded-full transition-all duration-300" style={{width:`${Math.min(100,(liveVu/Math.max(+vu,1))*100)}%`,background:BLU,boxShadow:`0 0 6px ${BLU}88`}}/>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {chart.length>0&&(
        <Card title="RPS + Latency Over Time" accent={BLU}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1C1C1C"/>
              <XAxis dataKey="t" {...AX}/>
              <YAxis {...AX}/>
              <Tooltip {...TT}/>
              <Line dataKey="rps" stroke={BLU}  name="RPS"     dot={false} strokeWidth={2}/>
              <Line dataKey="p50" stroke={GRN}  name="P50(ms)" dot={false} strokeWidth={1.5}/>
              <Line dataKey="p95" stroke={G}    name="P95(ms)" dot={false} strokeWidth={1.5}/>
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {(result?.report_html || result?.report_xlsx || result?.report_json) && (
        <Card title="Load Test Report" accent={BLU}>
          <div className="flex flex-wrap gap-3">
            {result?.report_html && (
              <GhostBtn onClick={() => window.open(result.report_html, '_blank')} label="View HTML Report" icon="👁️" />
            )}
            {result?.report_xlsx && (
              <GhostBtn onClick={() => { const a=document.createElement('a');a.href=result.report_xlsx;a.download=result.report_xlsx.split('/').pop()??'load_report.xlsx';a.click() }} label="Download Excel" icon="📊" />
            )}
            {result?.report_json && (
              <GhostBtn onClick={() => { const a=document.createElement('a');a.href=result.report_json;a.download=result.report_json.split('/').pop()??'load_report.json';a.click() }} label="Download JSON" icon="⬇️" />
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   PAGINATION
══════════════════════════════════════════════════════════ */
export function Pagination() {
  const{state,startJob,cancel,reset}=useJob('pagination')
  const[url,setUrl]=usePersistedState('pag_url','')
  const[total,setTotal]=usePersistedState('pag_total','500')
  const[pp,setPp]=usePersistedState('pag_pp','20')
  const[idf,setIdf]=usePersistedState('pag_idf','id')
  const running=state.status==='running',result=state.result
  const [urlErr,setUrlErr]=useState('')
  async function run(){
    let targetUrl = url.trim()
    if(!targetUrl)return;
    if(!/^https?:\/\//i.test(targetUrl)){ targetUrl = 'https://' + targetUrl; setUrl(targetUrl) }
    const checkUrl = targetUrl.replace('{page}','1').replace('{size}','10')
    const fmtErr = validateUrlFormat(checkUrl)
    if(fmtErr){ setUrlErr(fmtErr); return }
    setUrlErr('')
    reset();const{job_id}=await api.pagination({url:targetUrl,total_records:+total,per_page:+pp,id_field:idf});startJob(job_id)}
  return(
    <div className="p-5 flex flex-col gap-4">
      <div className="flex gap-3">
        <KpiTile label="Pages Checked"   value={result?.pages_checked??0} accent={BLU}/>
        <KpiTile label="Records Found"   value={result?.records_found??0} accent={GRN}/>
        <KpiTile label="Duplicates"      value={result?.duplicates??0}    accent={RED}/>
        <KpiTile label="Missing Records" value={result?.missing??0}       accent={G}/>
      </div>
      <Card title="Pagination Configuration" accent={GRN} action={<UserGuideButton config={UG_PAGINATION} color={GRN}/>}>
        <Input label="API URL Pattern" value={url} onChange={setUrl} placeholder="https://api.example.com/items?page={page}&per_page={size}" className="mb-3" error={urlErr}/>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Total Records" value={total} onChange={setTotal} type="number"/>
          <Input label="Per Page"      value={pp}    onChange={setPp}    type="number"/>
          <Input label="ID Field"      value={idf}   onChange={setIdf}/>
        </div>
      </Card>
      <div className="flex gap-2 flex-wrap"><RunButton onClick={run} disabled={!url||running} loading={running} label={running?'Testing…':'Run Pagination Test'} color={GRN}/><StopButton onClick={cancel} disabled={!running}/><GhostBtn onClick={reset} label="Clear"/>
      {state.result?.report_html&&<GhostBtn onClick={()=>window.open(state.result.report_html,'_blank')} label="View HTML Report" icon="👁️"/>}
      {state.result?.report_xlsx&&<GhostBtn onClick={()=>{const a=document.createElement('a');a.href=state.result.report_xlsx;a.download=state.result.report_xlsx.split('/').pop();a.click()}} label="Download Excel" icon="📊"/>}
      </div>
      <LogTerminal logs={state.logs} accent={GRN}/>
      {result?.pages?.length>0&&(
        <Card title="Page-by-Page Results" accent={GRN}>
          <div className="overflow-x-auto">
            <table className="be-table">
              <thead><tr><th>Page</th><th>Records</th><th>Dups</th><th>Sort</th><th>Status</th></tr></thead>
              <tbody>
                {result.pages.map((p:any)=>(
                  <tr key={p.page}>
                    <td style={{color:'#F0F0F0',fontFamily:'"JetBrains Mono",monospace'}}>{p.page}</td>
                    <td>{p.records}</td>
                    <td style={{fontWeight:700,fontFamily:'"JetBrains Mono",monospace',color:p.duplicates>0?RED:GRN}}>{p.duplicates}</td>
                    <td style={{color:p.sort_ok?GRN:G}}>{p.sort_ok?'✓ OK':'⚠ Mismatch'}</td>
                    <td><span className="be-badge" style={{color:p.status==='ok'?GRN:p.status==='err'?RED:G,background:p.status==='ok'?'rgba(34,197,94,0.1)':p.status==='err'?'rgba(239,68,68,0.1)':'rgba(245,166,35,0.1)',borderColor:p.status==='ok'?'rgba(34,197,94,0.3)':p.status==='err'?'rgba(239,68,68,0.3)':'rgba(245,166,35,0.3)'}}>{p.status?.toUpperCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   INTERNATIONAL
══════════════════════════════════════════════════════════ */
const REGIONS=[
  {l:'en-GB',f:'🇬🇧',n:'United Kingdom',d:'LTR'},{l:'en-US',f:'🇺🇸',n:'United States',d:'LTR'},
  {l:'de-DE',f:'🇩🇪',n:'Germany',d:'LTR'},{l:'fr-FR',f:'🇫🇷',n:'France',d:'LTR'},
  {l:'ar-AE',f:'🇦🇪',n:'UAE (Arabic)',d:'RTL'},{l:'ur-PK',f:'🇵🇰',n:'Pakistan',d:'RTL'},
  {l:'fa-IR',f:'🇮🇷',n:'Iran',d:'RTL'},{l:'ja-JP',f:'🇯🇵',n:'Japan',d:'LTR'},
  {l:'zh-CN',f:'🇨🇳',n:'China',d:'LTR'},{l:'hi-IN',f:'🇮🇳',n:'India',d:'LTR'},
  {l:'pt-BR',f:'🇧🇷',n:'Brazil',d:'LTR'},{l:'es-ES',f:'🇪🇸',n:'Spain',d:'LTR'},
  {l:'ko-KR',f:'🇰🇷',n:'South Korea',d:'LTR'},{l:'ru-RU',f:'🇷🇺',n:'Russia',d:'LTR'},
  {l:'tr-TR',f:'🇹🇷',n:'Turkey',d:'LTR'},{l:'nl-NL',f:'🇳🇱',n:'Netherlands',d:'LTR'},
]
export function International(){
  const{state,startJob,cancel,reset}=useJob('intl')
  const[url,setUrl]=usePersistedState('intl_url','')
  const[sel,setSel]=usePersistedState<string[]>('intl_sel',['en-GB','en-US','ar-AE'])
  const running=state.status==='running',result=state.result
  const [urlErr,setUrlErr]=useState('')
  const tog=(l:string)=>setSel(s=>s.includes(l)?s.filter(x=>x!==l):[...s,l])
  async function run(){
    let targetUrl = url.trim()
    if(!targetUrl||!sel.length)return;
    if(!/^https?:\/\//i.test(targetUrl)){ targetUrl = 'https://' + targetUrl; setUrl(targetUrl) }
    const fmtErr = validateUrlFormat(targetUrl)
    if(fmtErr){ setUrlErr(fmtErr); return }
    setUrlErr('')
    reset();const{job_id}=await api.international({url:targetUrl,locales:sel});startJob(job_id)}
  return(
    <div className="p-5 flex flex-col gap-4">
      <Card title="International & Localisation QA" accent={PUR} action={<UserGuideButton config={UG_INTL} color={PUR}/>}>
        <Input label="Target URL" value={url} onChange={setUrl} placeholder="https://example.com" type="url" className="mb-4" error={urlErr}/>
        <FieldLabel text={`Select Regions (${sel.length} of ${REGIONS.length})`}/>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {REGIONS.map(r=>(
            <button key={r.l} onClick={()=>tog(r.l)} className="p-2.5 rounded-xl text-left cursor-pointer transition-all"
              style={{background:sel.includes(r.l)?`${PUR}12`:'#161616',border:`1px solid ${sel.includes(r.l)?PUR:'#242424'}`,boxShadow:sel.includes(r.l)?`0 0 10px ${PUR}22`:'none'}}>
              <div className="text-[18px]">{r.f}</div>
              <div className="font-body font-600 text-[11px] mt-1.5 truncate text-tx">{r.n}</div>
              <div className="font-mono text-[9px] mt-0.5" style={{color:'#3A3A3A'}}>{r.l}</div>
              <span className="be-badge mt-1.5 inline-block" style={{color:r.d==='RTL'?PUR:GRN,background:r.d==='RTL'?'rgba(168,85,247,0.1)':'rgba(34,197,94,0.1)',borderColor:r.d==='RTL'?'rgba(168,85,247,0.3)':'rgba(34,197,94,0.3)'}}>{r.d}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <RunButton onClick={run} disabled={!url||!sel.length||running} loading={running} label={running?'Testing…':'Run International QA'} color={PUR} icon="🌐"/>
          <StopButton onClick={cancel} disabled={!running}/>
          <GhostBtn onClick={()=>setSel(REGIONS.map(r=>r.l))} label="All"/>
          <GhostBtn onClick={()=>setSel([])} label="None"/>
          {state.result?.report_html&&<GhostBtn onClick={()=>window.open(state.result.report_html,'_blank')} label="View HTML Report" icon="👁️"/>}
          {state.result?.report_xlsx&&<GhostBtn onClick={()=>{const a=document.createElement('a');a.href=state.result.report_xlsx;a.download=state.result.report_xlsx.split('/').pop();a.click()}} label="Download Excel" icon="📊"/>}
        </div>
      </Card>
      <LogTerminal logs={state.logs} accent={PUR}/>
      {result?.results&&(
        <Card title="Results by Region" accent={PUR}>
          <div className="overflow-x-auto">
            <table className="be-table">
              <thead><tr><th>Region</th><th>Locale</th><th>Dir</th><th>hreflang</th><th>Charset</th><th>Status</th></tr></thead>
              <tbody>
                {result.results.map((r:any)=>(
                  <tr key={r.locale}>
                    <td style={{color:'#F0F0F0'}}>{r.flag} {r.name}</td>
                    <td><code style={{fontFamily:'"JetBrains Mono",monospace',fontSize:10,color:'#888'}}>{r.locale}</code></td>
                    <td><span className="be-badge" style={{color:r.dir==='RTL'?PUR:GRN,background:r.dir==='RTL'?'rgba(168,85,247,0.1)':'rgba(34,197,94,0.1)',borderColor:r.dir==='RTL'?'rgba(168,85,247,0.3)':'rgba(34,197,94,0.3)'}}>{r.dir}</span></td>
                    <td style={{fontWeight:700,color:r.hreflang?GRN:RED}}>{r.hreflang?'✓':'✗'}</td>
                    <td style={{fontFamily:'"JetBrains Mono",monospace',fontSize:11}}>{r.charset}</td>
                    <td><span className="be-badge" style={{color:r.status==='pass'?GRN:r.status==='warn'?G:RED,background:r.status==='pass'?'rgba(34,197,94,0.1)':r.status==='warn'?'rgba(245,166,35,0.1)':'rgba(239,68,68,0.1)',borderColor:r.status==='pass'?'rgba(34,197,94,0.3)':r.status==='warn'?'rgba(245,166,35,0.3)':'rgba(239,68,68,0.3)'}}>{r.status?.toUpperCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   MULTI-LOCATION
══════════════════════════════════════════════════════════ */
const ML_LOCATIONS = [
  { id: 'anywhere',   flag: '🌐', name: 'Anywhere (Random)',      sub: 'Default server location' },
  { id: 'ae-dubai',   flag: '🇦🇪', name: 'Dubai, UAE',             sub: 'Middle East region' },
  { id: 'pk-karachi', flag: '🇵🇰', name: 'Karachi, Pakistan',      sub: 'South Asia region' },
  { id: 'sa-riyadh',  flag: '🇸🇦', name: 'Riyadh, Saudi Arabia',   sub: 'GCC region' },
  { id: 'uk-london',  flag: '🇬🇧', name: 'London, UK',             sub: 'Europe region' },
  { id: 'us-new-york',flag: '🇺🇸', name: 'New York, US',           sub: 'North America region' },
]

export function MultiLocation() {
  const { state, startJob, cancel, reset } = useJob('multi_location')
  const [url, setUrl] = usePersistedState('ml_url', '')
  const [sel, setSel] = usePersistedState<string[]>('ml_sel', ['ae-dubai', 'pk-karachi', 'sa-riyadh'])
  const running = state.status === 'running', result = state.result
  const [urlErr, setUrlErr] = useState('')
  const tog = (id: string) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  async function run() {
    let targetUrl = url.trim()
    if (!targetUrl || !sel.length) return
    if (!/^https?:\/\//i.test(targetUrl)) { targetUrl = 'https://' + targetUrl; setUrl(targetUrl) }
    const fmtErr = validateUrlFormat(targetUrl)
    if (fmtErr) { setUrlErr(fmtErr); return }
    setUrlErr('')
    reset()
    const { job_id } = await api.multiLocation({ url: targetUrl, locations: sel })
    startJob(job_id)
  }

  const dl = (d: any) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }))
    a.download = `multi_location_${Date.now()}.json`
    a.click()
  }

  return (
    <div className="p-5 flex flex-col gap-4">
      {result && (
        <div className="grid grid-cols-3 gap-3">
          {([
            ['Health Score', result.health, GRN, `${result.results?.length ?? 0} locations`],
            ['Accessible', result.results?.filter((r: any) => r.ok).length ?? 0, GRN, 'Reachable'],
            ['Blocked',     result.results?.filter((r: any) => !r.ok).length ?? 0, RED, 'Unreachable'],
          ] as any[]).map(([lbl, val, col, sub]: any[]) => (
            <div key={lbl} className="be-card overflow-hidden">
              <div style={{ height: 3, background: `linear-gradient(90deg,${col},${col}55,transparent)` }} />
              <div className="p-5 flex flex-col items-center gap-2">
                <p className="font-display font-800 text-[32px]" style={{ color: col, filter: `drop-shadow(0 0 8px ${col}55)` }}>{typeof val === 'number' && lbl === 'Health Score' ? `${val}%` : val}</p>
                <p className="font-display font-700 text-[11px]" style={{ color: '#888' }}>{lbl}</p>
                <p className="font-body text-[10px]" style={{ color: '#3A3A3A' }}>{sub}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Card title="Multi-Location Accessibility Check" accent={BLU}>
        <Input label="Target URL" value={url} onChange={setUrl} placeholder="https://example.com" type="url" className="mb-4" error={urlErr}/>
        <FieldLabel text={`Select Locations (${sel.length} of ${ML_LOCATIONS.length})`} />
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          {ML_LOCATIONS.map(loc => (
            <button key={loc.id} onClick={() => tog(loc.id)} className="p-3.5 rounded-xl text-left cursor-pointer transition-all"
              style={{
                background: sel.includes(loc.id) ? `${BLU}12` : '#161616',
                border: `1px solid ${sel.includes(loc.id) ? BLU : '#242424'}`,
                boxShadow: sel.includes(loc.id) ? `0 0 12px ${BLU}22` : 'none'
              }}>
              <div className="text-[24px]">{loc.flag}</div>
              <div className="font-display font-700 text-[12px] mt-1.5" style={{ color: sel.includes(loc.id) ? '#F0F0F0' : '#888' }}>{loc.name}</div>
              <div className="font-body text-[10px] mt-0.5" style={{ color: '#3A3A3A' }}>{loc.sub}</div>
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <RunButton onClick={run} disabled={!url || !sel.length || running} loading={running} label={running ? 'Checking…' : 'Run Accessibility Check'} color={BLU} icon="📡" />
          <StopButton onClick={cancel} disabled={!running} />
          <GhostBtn onClick={() => setSel(ML_LOCATIONS.map(l => l.id))} label="All" />
          <GhostBtn onClick={() => setSel([])} label="None" />
          <GhostBtn onClick={reset} label="Clear" />
          {result && <GhostBtn onClick={() => dl(result)} label="Download" icon="↓" />}
        </div>
      </Card>

      <LogTerminal logs={state.logs} accent={BLU} />

      {result?.results && (
        <Card title="Accessibility by Location" accent={BLU}>
          <div className="overflow-x-auto">
            <table className="be-table">
              <thead><tr><th>Location</th><th>HTTP Status</th><th>Response (ms)</th><th>Accessible</th></tr></thead>
              <tbody>
                {result.results.map((r: any) => (
                  <tr key={r.location}>
                    <td style={{ color: '#F0F0F0', fontWeight: 600 }}>{r.flag} {r.name}</td>
                    <td><code style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, color: r.ok ? GRN : RED }}>{r.status || '—'}</code></td>
                    <td style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11 }}>{r.ms}ms</td>
                    <td>
                      <span className="be-badge" style={{
                        color: r.ok ? GRN : RED,
                        background: r.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                        borderColor: r.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'
                      }}>{r.ok ? '✓ ACCESSIBLE' : '✗ BLOCKED'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Quick QA results (auto-run after accessibility check) ─── */}
      {result?.qa_summary && Object.keys(result.qa_summary).length > 0 && (() => {
        const qa = result.qa_summary
        const sec = qa.sec_headers ?? {}
        const checks = [
          { label: 'HTTPS',              ok: qa.https },
          { label: 'Title tag',          ok: !!qa.title },
          { label: 'Meta description',   ok: !!qa.meta_desc },
          { label: 'H1 heading',         ok: !!qa.h1 },
          { label: 'Viewport meta',      ok: qa.has_viewport },
          { label: 'Charset meta',       ok: qa.has_charset },
          { label: 'HSTS header',        ok: sec.hsts },
          { label: 'X-Content-Type-Opt', ok: sec.x_content_type },
          { label: 'CSP header',         ok: sec.csp },
          { label: 'X-Frame-Options',    ok: sec.x_frame },
        ]
        const passed = checks.filter(c => c.ok).length
        return (
          <Card title={`Quick QA — ${qa.final_url || result.url}`} accent={GRN}>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-3 rounded-xl" style={{background:'rgba(34,197,94,0.06)',border:'1px solid rgba(34,197,94,0.2)'}}>
                <p className="text-[10px] font-display font-700 mb-1" style={{color:'#3A3A3A'}}>LOAD TIME</p>
                <p className="font-mono font-700 text-[22px]" style={{color:GRN}}>{qa.load_ms}ms</p>
              </div>
              <div className="p-3 rounded-xl" style={{background:'rgba(34,197,94,0.06)',border:'1px solid rgba(34,197,94,0.2)'}}>
                <p className="text-[10px] font-display font-700 mb-1" style={{color:'#3A3A3A'}}>QA CHECKS</p>
                <p className="font-mono font-700 text-[22px]" style={{color:GRN}}>{passed}<span className="text-[14px]">/{checks.length}</span></p>
              </div>
            </div>
            {qa.title && (
              <p className="text-[12px] mb-2 truncate" style={{color:'#888'}}>
                <span style={{color:'#3A3A3A'}}>Title: </span>{qa.title}
              </p>
            )}
            {qa.meta_desc && (
              <p className="text-[12px] mb-3 truncate" style={{color:'#888'}}>
                <span style={{color:'#3A3A3A'}}>Description: </span>{qa.meta_desc}
              </p>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {checks.map(c => (
                <div key={c.label} className="flex items-center gap-2 py-1 px-2 rounded-lg"
                     style={{background: c.ok ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)'}}>
                  <span style={{color: c.ok ? GRN : RED, fontWeight:700, fontSize:12}}>{c.ok ? '✓' : '✗'}</span>
                  <span className="text-[11px]" style={{color: c.ok ? '#C9D1D9' : '#8B949E'}}>{c.label}</span>
                </div>
              ))}
            </div>
            {qa.issues?.length > 0 && (
              <div className="mt-3 p-3 rounded-xl" style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)'}}>
                <p className="text-[11px] font-700 mb-2" style={{color:RED}}>Issues found:</p>
                {qa.issues.map((iss: string) => (
                  <p key={iss} className="text-[11px] mb-1" style={{color:'#8B949E'}}>• {iss}</p>
                ))}
              </div>
            )}
          </Card>
        )
      })()}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   AI FEATURES
══════════════════════════════════════════════════════════ */
const AI_MODULES=[
  {k:'test_case_gen',   l:'AI Test Case Generator',          b:'Phase 1',d:'Auto-generate test cases from URL structure and page content'},
  {k:'self_healing',    l:'Self-Healing Test Scripts',       b:'Phase 2',d:'Auto-repair broken selectors when UI changes between runs'},
  {k:'nlp_testing',     l:'Natural Language Testing',        b:'Phase 1',d:'Write test descriptions in plain English — no code required'},
  {k:'smart_regression',l:'Smart Regression Testing',        b:'Phase 1',d:'AI selects only tests relevant to code paths that changed'},
  {k:'visual_testing',  l:'Visual Testing (UI/UX)',          b:'Phase 2',d:'Pixel-diff screenshots vs baseline or Figma across viewports'},
  {k:'perf_engine',     l:'Performance & Load Engine',       b:'Phase 2',d:'Simulate 50–1,000 VUs · P50/P95/P99 latency · throughput'},
  {k:'ai_pagination',   l:'AI Pagination & Data Tester',     b:'Phase 1',d:'500+ records validated — no dups, no missing, sort verified'},
  {k:'api_schema',      l:'API Testing + Schema Validation', b:'Phase 1',d:'Endpoint health, response assertion, breaking-change detection'},
  {k:'security_ai',     l:'Security Testing (AI Layer)',     b:'Phase 3',d:'OWASP Top-10 · XSS · SQLi · Header analysis · Cookie flags'},
  {k:'bug_detection',   l:'AI Bug Detection & Root Cause',   b:'Phase 3',d:'Classify bugs, trace to source line, suggest fix automatically'},
  {k:'cross_browser',   l:'Cross-Browser & Device Testing',  b:'Phase 2',d:'Chrome, Firefox, Safari, Edge, Mobile — parallel execution'},
  {k:'cicd',            l:'CI/CD Integration',               b:'Phase 3',d:'Jenkins, GitHub Actions, GitLab CI — auto-trigger on push'},
  {k:'session_replay',  l:'Session Replay & Debugging',      b:'Phase 3',d:'Record sessions, replay errors, capture DOM snapshots'},
  {k:'voice_commands',  l:'Voice / Chat-Based Commands',     b:'Phase 3',d:'Run scans from voice or a conversational chat interface'},
  {k:'test_data_gen',   l:'AI Test Data Generator',          b:'Phase 2',d:'Generate realistic locale-specific test data automatically'},
]
const PHASE_COL:Record<string,string>={'Phase 1':GRN,'Phase 2':G,'Phase 3':PUR}

export function AIFeatures(){
  const[enabled,setEnabled]=usePersistedState<string[]>('ai_enabled',['test_case_gen','smart_regression','visual_testing','perf_engine','ai_pagination','api_schema','cross_browser'])
  const[saved,setSaved]=useState(false)
  async function save(){await api.saveAIFeatures(enabled);setSaved(true);setTimeout(()=>setSaved(false),2500)}
  return(
    <div className="p-5 flex flex-col gap-4">
      {['Phase 1','Phase 2','Phase 3'].map(phase=>(
        <Card key={phase} title={`AI Modules — ${phase}`} accent={PHASE_COL[phase]}>
          {AI_MODULES.filter(m=>m.b===phase).map(m=>(
            <Toggle key={m.k} checked={enabled.includes(m.k)} onChange={on=>setEnabled(s=>on?[...s,m.k]:s.filter(x=>x!==m.k))} label={m.l} description={m.d} badge={m.b}/>
          ))}
        </Card>
      ))}
      <div className="flex items-center gap-3 flex-wrap">
        <RunButton onClick={save} label="Save Configuration" color={G} icon="💾"/>
        <GhostBtn onClick={()=>setEnabled(AI_MODULES.map(m=>m.k))} label="Enable All"/>
        <GhostBtn onClick={()=>setEnabled([])} label="Disable All"/>
        {saved&&<span className="font-display font-700 text-[13px]" style={{color:GRN}}>✓ Saved — {enabled.length} modules active</span>}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   USER BASELINE
══════════════════════════════════════════════════════════ */
export function UserBaseline(){
  const{state,startJob,cancel,reset}=useJob('user_baseline')
  const[url,setUrl]=usePersistedState('ub_url','')
  const[modes,setModes]=usePersistedState<string[]>('ub_modes',['normal','ai'])
  const running=state.status==='running',result=state.result
  const [urlErr,setUrlErr]=useState('')
  async function run(){
    let targetUrl = url.trim()
    if(!targetUrl||!modes.length)return;
    if(!/^https?:\/\//i.test(targetUrl)){ targetUrl = 'https://' + targetUrl; setUrl(targetUrl) }
    const fmtErr = validateUrlFormat(targetUrl)
    if(fmtErr){ setUrlErr(fmtErr); return }
    setUrlErr('')
    reset();const{job_id}=await api.userBaseline({url:targetUrl,modes});startJob(job_id)}
  const dl=(d:any)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));a.download=`baseline_${Date.now()}.json`;a.click()}
  return(
    <div className="p-5 flex flex-col gap-4">
      {result&&(
        <div className="grid grid-cols-3 gap-3">
          {([['Normal User Score',result.normal_score,PUR,'30 checks'],['AI Board Score',result.ai_score,BLU,'10 modules'],['Combined Score',result.combined_score,GRN,'Weighted avg']]).map(([lbl,sc,col,sub]: any[])=>(
            <div key={lbl} className="be-card overflow-hidden">
              <div style={{height:3,background:`linear-gradient(90deg,${col},${col}55,transparent)`}}/>
              <div className="p-5 flex flex-col items-center gap-3">
                <ScoreRing score={sc} size={96} label={lbl}/>
                <p className="font-body text-[10px]" style={{color:'#3A3A3A'}}>{sub}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <Card title="User Baseline Testing" accent={PUR} action={<UserGuideButton config={UG_BASELINE} color={PUR}/>}>
        <Input label="Target URL" value={url} onChange={setUrl} placeholder="https://example.com" type="url" className="mb-4" error={urlErr}/>
        <FieldLabel text="Select Baseline Modes"/>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[{v:'normal',icon:'👤',l:'Normal User Baseline',sub:'30 checks from a real user perspective',col:PUR},{v:'ai',icon:'🤖',l:'AI Board Baseline',sub:'10 strategic AI evaluation modules',col:BLU}].map(m=>(
            <button key={m.v} onClick={()=>setModes(s=>s.includes(m.v)?s.filter(x=>x!==m.v):[...s,m.v])} className="p-4 rounded-xl text-left cursor-pointer transition-all"
              style={{background:modes.includes(m.v)?`${m.col}10`:'#161616',border:`1px solid ${modes.includes(m.v)?m.col:'#242424'}`,boxShadow:modes.includes(m.v)?`0 0 14px ${m.col}22`:'none'}}>
              <div className="text-[24px] mb-2">{m.icon}</div>
              <div className="font-display font-700 text-[13px] mb-1" style={{color:modes.includes(m.v)?'#F0F0F0':'#888'}}>{m.l}</div>
              <div className="font-body text-[11px] leading-relaxed" style={{color:'#3A3A3A'}}>{m.sub}</div>
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <RunButton onClick={run} disabled={!url||!modes.length||running} loading={running} label={running?'Running…':'Run User Baseline'} color={PUR} icon="👤"/>
          <StopButton onClick={cancel} disabled={!running}/>
          <GhostBtn onClick={reset} label="Clear"/>
          {result&&<GhostBtn onClick={()=>dl(result)} label="Download" icon="↓"/>}
          {result?.report_html && (
            <GhostBtn onClick={() => window.open(result.report_html, '_blank')} label="View Report" icon="👁️" />
          )}
          {result?.report_json && (
            <GhostBtn onClick={() => {
              const a = document.createElement('a')
              a.href = result.report_json
              a.download = result.report_json.split('/').pop() || 'baseline_report.json'
              a.click()
            }} label="Download JSON" icon="⬇️" />
          )}
        </div>
      </Card>
      <LogTerminal logs={state.logs} accent={PUR}/>
      {result?.normal_results?.length>0&&(
        <Card title={`Normal User Results (${result.normal_results.filter((r:any)=>r.ok).length}/30 passed)`} accent={PUR}>
          <div className="grid grid-cols-2 gap-2">
            {result.normal_results.map((r:any,i:number)=>(
              <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg" style={{background:r.ok?'rgba(34,197,94,0.05)':'rgba(245,166,35,0.05)',border:`1px solid ${r.ok?'rgba(34,197,94,0.15)':'rgba(245,166,35,0.15)'}`}}>
                <span className="font-700 text-[12px] flex-shrink-0 mt-px" style={{color:r.ok?GRN:G}}>{r.ok?'✓':'✗'}</span>
                <div>
                  <p className="font-body font-600 text-[11px] text-tx">{r.check}</p>
                  <p className="font-body text-[10px] mt-0.5 leading-relaxed" style={{color:'#3A3A3A'}}>{r.criterion}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {result?.ai_results?.length>0&&(
        <Card title="AI Board Module Results" accent={BLU}>
          <div className="flex flex-col gap-2">
            {result.ai_results.map((r:any,i:number)=>(
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{background:'#161616',border:'1px solid #242424'}}>
                <div className="w-12 h-12 rounded-full flex items-center justify-center font-mono font-700 text-[13px] flex-shrink-0"
                     style={{background:r.score>=70?'rgba(34,197,94,0.1)':r.score>=50?'rgba(245,166,35,0.1)':'rgba(239,68,68,0.1)',color:r.score>=70?GRN:r.score>=50?G:RED,border:`1px solid ${r.score>=70?'rgba(34,197,94,0.25)':r.score>=50?'rgba(245,166,35,0.25)':'rgba(239,68,68,0.25)'}`,boxShadow:`0 0 8px ${r.score>=70?GRN:r.score>=50?G:RED}33`}}>{r.score}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-700 text-[12px] text-tx">{r.module}</p>
                  <p className="font-body text-[10px] mt-0.5" style={{color:'#3A3A3A'}}>{r.description}</p>
                  <p className="font-mono text-[10px] mt-1" style={{color:'#555'}}>{r.detail}</p>
                </div>
                <Badge label={r.status.toUpperCase()} type={r.status==='pass'?'success':r.status==='warn'?'warn':'error'}/>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   SUPER LIGHTHOUSE  (7-module deep audit)
══════════════════════════════════════════════════════════ */
const SL_MODULES=[
  {id:'multi_device',    label:'Multi-Device',      icon:'📱', color:BLU,  weight:'25%'},
  {id:'accessibility_deep',label:'Deep A11y',       icon:'♿', color:GRN,  weight:'25%'},
  {id:'security',        label:'Security Headers',  icon:'🔒', color:RED,  weight:'20%'},
  {id:'crux',            label:'CrUX / RUM',        icon:'📊', color:PUR,  weight:'15%'},
  {id:'third_party',     label:'Third-Party',       icon:'🔗', color:AMB,  weight:'5%'},
  {id:'spa',             label:'SPA Detection',     icon:'⚛',  color:BLU,  weight:'5%'},
  {id:'network',         label:'Network',           icon:'🌐', color:GRN,  weight:'5%'},
]
const SL_CATS:Record<string,string>={performance:'Performance',accessibility:'Accessibility','best-practices':'Best Practices',seo:'SEO'}
const SL_CAT_C:Record<string,string>={performance:BLU,accessibility:GRN,'best-practices':PUR,seo:RED}
const CWV_META=[{k:'lcp',l:'LCP',t:'<2.5s',c:GRN},{k:'cls',l:'CLS',t:'<0.1',c:RED},{k:'fcp',l:'FCP',t:'<1.8s',c:BLU},{k:'si',l:'Speed Index',t:'<3.4s',c:PUR},{k:'tbt',l:'TBT',t:'<300ms',c:AMB},{k:'ttfb',l:'TTFB',t:'<800ms',c:G}]

function SlGrade({score}:{score:number|null}){
  const s=score??0
  const g=s>=90?'A':s>=75?'B':s>=60?'C':s>=45?'D':'F'
  const c=s>=90?GRN:s>=75?BLU:s>=60?G:s>=45?AMB:RED
  return(
    <div style={{textAlign:'center'}}>
      <div style={{fontSize:52,fontWeight:900,color:c,lineHeight:1}}>{g}</div>
      <div style={{fontSize:28,fontWeight:800,color:c}}>{s}</div>
      <div style={{fontSize:10,color:'#484F58',textTransform:'uppercase',letterSpacing:'.06em',marginTop:2}}>Weighted Score</div>
    </div>
  )
}

export function Lighthouse(){
  const{state,startJob,cancel,reset}=useJob('super_lighthouse')
  const[url,setUrl]=usePersistedState('slh_url','')
  const[compareUrl,setCompareUrl]=usePersistedState('slh_compare','')
  const[cats,setCats]=usePersistedState<string[]>('slh_cats',['performance','accessibility','best-practices','seo'])
  const[mods,setMods]=usePersistedState<string[]>('slh_mods',SL_MODULES.map(m=>m.id))
  const[resTab,setResTab]=useState<string>('overview')
  const running=state.status==='running',result=state.result
  const [urlErr,setUrlErr]=useState('')

  async function run(){
    let u=url.trim()
    if(!u)return
    if(!/^https?:\/\//i.test(u)){u='https://'+u;setUrl(u)}
    const fmtErr = validateUrlFormat(u)
    if(fmtErr){ setUrlErr(fmtErr); return }
    setUrlErr('')
    reset()
    const{job_id}=await api.superLighthouse({url:u,compare_url:compareUrl.trim(),categories:cats,modules:mods})
    startJob(job_id)
  }

  const overall=result?.overall_score??null
  const moduleScores:Record<string,number>=result?.module_scores??{}
  const desktop=result?.multi_device?.desktop??{}
  const mobile=result?.multi_device?.mobile??{}
  const security=result?.security??{}
  const a11y=result?.accessibility_deep??{}
  const network=result?.network??{}
  const thirdParty=result?.third_party??{}
  const spa=result?.spa??{}
  const crux=result?.crux??{}
  const compare=result?.compare??null
  const findings=[...(desktop.findings??[])]

  const radarData=SL_MODULES.map(m=>({subject:m.label.split(' ')[0],score:moduleScores[m.id]??0}))

  const TABS=[
    {id:'overview',  label:'Overview'},
    {id:'multidev',  label:'Multi-Device'},
    {id:'security',  label:'Security'},
    {id:'a11y',      label:'Accessibility'},
    {id:'network',   label:'Network'},
    {id:'thirdparty',label:'Third-Party'},
    {id:'findings',  label:'Findings'},
  ]

  return(
    <div className="p-5 flex flex-col gap-4">

      {/* Config */}
      <Card title="SuperLighthouse — 7-Module Deep Audit" accent={G} action={<UserGuideButton config={UG_LIGHTHOUSE} color={G}/>}>
        <div className="flex gap-3 mb-3 flex-wrap">
          <Input label="Target URL" value={url} onChange={setUrl} placeholder="https://example.com" type="url" className="flex-1 min-w-[220px]" error={urlErr}/>
          <Input label="Compare URL (optional)" value={compareUrl} onChange={setCompareUrl} placeholder="https://competitor.com" type="url" className="flex-1 min-w-[220px]"/>
        </div>
        <FieldLabel text="Audit Categories"/>
        <div className="flex flex-wrap gap-2 mb-3">
          {Object.entries(SL_CATS).map(([k,l])=>(
            <button key={k} onClick={()=>setCats(cs=>cs.includes(k)?cs.filter(c=>c!==k):[...cs,k])} className="be-pill" style={cats.includes(k)?{background:`${SL_CAT_C[k]}14`,color:SL_CAT_C[k],borderColor:`${SL_CAT_C[k]}44`}:{}}>{l}</button>
          ))}
        </div>
        <FieldLabel text="Active Modules"/>
        <div className="flex flex-wrap gap-2 mb-4">
          {SL_MODULES.map(m=>(
            <button key={m.id} onClick={()=>setMods(ms=>ms.includes(m.id)?ms.filter(x=>x!==m.id):[...ms,m.id])} className="be-pill text-[10px]"
              style={mods.includes(m.id)?{background:`${m.color}14`,color:m.color,borderColor:`${m.color}44`}:{}}>
              {m.icon} {m.label} <span style={{opacity:.5}}>{m.weight}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <RunButton onClick={run} disabled={!url||running} loading={running} label={running?'Auditing…':'Run SuperLighthouse'} color={G} icon="◆"/>
          <StopButton onClick={cancel} disabled={!running}/><GhostBtn onClick={reset} label="Clear"/>
          {result?.report_html&&<GhostBtn onClick={()=>window.open(result.report_html,'_blank')} label="HTML Report" icon="👁️"/>}
          {result?.report_xlsx&&<GhostBtn onClick={()=>{const a=document.createElement('a');a.href=result.report_xlsx;a.download=result.report_xlsx.split('/').pop();a.click()}} label="Excel" icon="📊"/>}
          {result?.report_json&&<GhostBtn onClick={()=>{const a=document.createElement('a');a.href=result.report_json;a.download=result.report_json.split('/').pop();a.click()}} label="JSON" icon="⬇️"/>}
        </div>
        {result?.simulated&&<p className="mt-2.5 text-[11px] px-3 py-2 rounded-lg" style={{color:G,background:'rgba(245,166,35,0.06)',border:'1px solid rgba(245,166,35,0.15)'}}>⚠ Simulation mode — add PSI_API_KEY in .env for real data</p>}
      </Card>

      {/* Result tabs */}
      {result&&(
        <div className="flex gap-1 flex-wrap">
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setResTab(t.id)} className="be-pill text-[11px]"
              style={resTab===t.id?{background:'rgba(245,166,35,0.12)',color:G,borderColor:'rgba(245,166,35,0.35)'}:{}}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Overview tab ── */}
      {result&&resTab==='overview'&&(
        <>
          <div className="grid grid-cols-3 gap-4">
            <Card title="Overall Grade" accent={G}>
              <SlGrade score={overall}/>
            </Card>
            <Card title="Module Scores" accent={G} className="col-span-2">
              <div className="flex flex-col gap-2">
                {SL_MODULES.map(m=>{
                  const sc=moduleScores[m.id]??null
                  const col=sc==null?'#484F58':sc>=80?GRN:sc>=60?G:RED
                  return(
                    <div key={m.id} style={{display:'flex',alignItems:'center',gap:10}}>
                      <span style={{fontSize:13,width:18}}>{m.icon}</span>
                      <span style={{fontSize:11,color:'#8B949E',width:110,flexShrink:0}}>{m.label}</span>
                      <div style={{flex:1,height:6,background:'#21262D',borderRadius:3,overflow:'hidden'}}>
                        <div style={{height:'100%',width:`${sc??0}%`,background:col,borderRadius:3,transition:'width .4s'}}/>
                      </div>
                      <span style={{fontSize:12,fontWeight:700,color:col,width:28,textAlign:'right'}}>{sc??'—'}</span>
                      <span style={{fontSize:9,color:'#3A3A3A',width:24}}>{m.weight}</span>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card title="Module Radar" accent={G}>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#1C1C1C"/>
                  <PolarAngleAxis dataKey="subject" tick={{fontSize:9,fill:'#555'}}/>
                  <PolarRadiusAxis angle={30} domain={[0,100]} tick={{fontSize:8,fill:'#3A3A3A'}}/>
                  <Radar dataKey="score" stroke={G} fill={G} fillOpacity={0.12} dot={{fill:G,r:3}}/>
                </RadarChart>
              </ResponsiveContainer>
            </Card>
            <Card title="PSI Category Scores" accent={G}>
              <div className="flex gap-3 flex-wrap">
                {Object.entries(SL_CATS).map(([k,l])=>{
                  const dsc=desktop.scores?.[k]??null
                  const msc=mobile.scores?.[k]??null
                  return(
                    <div key={k} className="flex-1 min-w-[80px] be-card overflow-hidden">
                      <div style={{height:2,background:SL_CAT_C[k]}}/>
                      <div className="p-2 text-center">
                        <p style={{fontSize:9,color:SL_CAT_C[k],fontWeight:700,marginBottom:4}}>{l}</p>
                        <p style={{fontSize:18,fontWeight:800,color:SL_CAT_C[k]}}>{dsc??'—'}</p>
                        <p style={{fontSize:9,color:'#484F58'}}>📱 {msc??'—'}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
        </>
      )}

      {/* ── Multi-Device tab ── */}
      {result&&resTab==='multidev'&&(
        <>
          <div className="grid grid-cols-2 gap-4">
            {[{label:'🖥 Desktop',data:desktop,col:BLU},{label:'📱 Mobile',data:mobile,col:PUR}].map(({label,data,col})=>(
              <Card key={label} title={label} accent={col}>
                <div className="flex gap-2 flex-wrap mb-3">
                  {Object.entries(SL_CATS).map(([k,l])=>(
                    <div key={k} className="flex-1 min-w-[70px] be-card overflow-hidden">
                      <div style={{height:2,background:SL_CAT_C[k]}}/>
                      <div className="p-2"><Gauge score={data.scores?.[k]??null} color={SL_CAT_C[k]} label={l}/></div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {CWV_META.map(c=>(
                    <div key={c.k} className="be-card text-center overflow-hidden">
                      <div style={{height:2,background:c.c}}/>
                      <div className="p-2">
                        <p style={{fontSize:9,color:c.c,fontWeight:700}}>{c.l}</p>
                        <p style={{fontSize:13,fontWeight:800,color:c.c}}>{data.cwv?.[c.k]??'—'}</p>
                        <p style={{fontSize:9,color:'#3A3A3A'}}>{c.t}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
          {compare&&(
            <Card title="Comparison: Target vs Competitor" accent={G}>
              <table className="be-table w-full">
                <thead><tr><th>Metric</th><th>Target</th><th>Competitor</th></tr></thead>
                <tbody>
                  {Object.entries(SL_CATS).map(([k,l])=>(
                    <tr key={k}>
                      <td style={{color:'#E6EDF3'}}>{l}</td>
                      <td style={{color:SL_CAT_C[k],fontWeight:700}}>{desktop.scores?.[k]??'—'}</td>
                      <td style={{color:'#484F58'}}>{compare.desktop?.scores?.[k]??'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {/* ── Security tab ── */}
      {result&&resTab==='security'&&(
        <Card title="Security Headers Analysis" accent={RED}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div style={{textAlign:'center',padding:'16px 0'}}>
              <div style={{fontSize:40,fontWeight:900,color:security.score>=80?GRN:security.score>=60?G:RED}}>{security.score??'—'}</div>
              <div style={{fontSize:10,color:'#484F58',textTransform:'uppercase'}}>Security Score</div>
            </div>
            <div style={{display:'flex',flexDirection:'column',justifyContent:'center',gap:6}}>
              <p style={{fontSize:11,color:'#8B949E'}}>✓ {security.passed??0} headers present</p>
              <p style={{fontSize:11,color:'#8B949E'}}>✗ {security.failed??0} headers missing</p>
              <p style={{fontSize:11,color:'#8B949E'}}>HTTPS: <span style={{color:(security.https??false)?GRN:RED}}>{(security.https??false)?'Yes':'No'}</span></p>
            </div>
          </div>
          <table className="be-table w-full">
            <thead><tr><th>Header</th><th>Status</th><th>Value</th><th>Importance</th></tr></thead>
            <tbody>
              {(security.headers??[]).map((h:any,i:number)=>(
                <tr key={i}>
                  <td style={{color:'#E6EDF3',fontFamily:'monospace',fontSize:11}}>{h.name}</td>
                  <td><span style={{color:h.present?GRN:RED,fontWeight:700,fontSize:11}}>{h.present?'✓ Present':'✗ Missing'}</span></td>
                  <td style={{fontFamily:'monospace',fontSize:10,color:'#484F58',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis'}}>{h.value||'—'}</td>
                  <td><span className="be-badge" style={{color:h.severity==='critical'?RED:h.severity==='high'?AMB:G,background:h.severity==='critical'?'rgba(239,68,68,.1)':h.severity==='high'?'rgba(245,158,11,.1)':'rgba(245,166,35,.1)',borderColor:h.severity==='critical'?'rgba(239,68,68,.3)':h.severity==='high'?'rgba(245,158,11,.3)':'rgba(245,166,35,.3)'}}>{h.severity}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* ── Accessibility tab ── */}
      {result&&resTab==='a11y'&&(
        <Card title="Deep Accessibility Analysis" accent={GRN}>
          <div className="flex gap-4 mb-4">
            <div style={{textAlign:'center',padding:'0 20px'}}>
              <div style={{fontSize:40,fontWeight:900,color:a11y.score>=80?GRN:a11y.score>=60?G:RED}}>{a11y.score??'—'}</div>
              <div style={{fontSize:10,color:'#484F58',textTransform:'uppercase'}}>A11y Score</div>
            </div>
            <div style={{flex:1}}>
              <p style={{fontSize:11,color:'#8B949E',marginBottom:4}}>PSI Accessibility: <strong style={{color:GRN}}>{desktop.scores?.accessibility??'—'}</strong></p>
              <p style={{fontSize:11,color:'#8B949E',marginBottom:4}}>Custom Checks: {a11y.passed??0}/{a11y.total??0} passed</p>
            </div>
          </div>
          <div className="flex flex-col">
            {(a11y.checks??[]).map((c:any,i:number)=>(
              <div key={i} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'8px 0',borderBottom:'1px solid #161616'}}>
                <span style={{fontSize:14,color:c.passed?GRN:RED,flexShrink:0}}>{c.passed?'✓':'✗'}</span>
                <div style={{flex:1}}>
                  <p style={{fontSize:12,fontWeight:600,color:'#E6EDF3',margin:0}}>{c.name}</p>
                  <p style={{fontSize:10,color:'#484F58',margin:0}}>{c.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Network tab ── */}
      {result&&resTab==='network'&&(
        <Card title="Network Analysis" accent={GRN}>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              {l:'Total Size',v:`${network.total_kb??0} KB`,c:network.total_kb<500?GRN:network.total_kb<2000?G:RED},
              {l:'JavaScript',v:`${network.js_kb??0} KB`,c:network.js_kb<300?GRN:network.js_kb<800?G:RED},
              {l:'CSS',v:`${network.css_kb??0} KB`,c:GRN},
              {l:'Images',v:`${network.img_kb??0} KB`,c:network.img_kb<500?GRN:network.img_kb<2000?G:RED},
            ].map(item=>(
              <div key={item.l} className="be-card text-center overflow-hidden">
                <div style={{height:2,background:item.c}}/>
                <div className="p-3">
                  <p style={{fontSize:9,color:item.c,fontWeight:700,textTransform:'uppercase',marginBottom:4}}>{item.l}</p>
                  <p style={{fontSize:18,fontWeight:800,color:item.c}}>{item.v}</p>
                </div>
              </div>
            ))}
          </div>
          <div style={{background:'#0D1117',border:'1px solid #21262D',borderRadius:10,padding:16}}>
            <p style={{fontSize:11,color:'#8B949E',margin:'0 0 4px'}}>Resources: {network.resource_count??0} total requests</p>
            <p style={{fontSize:11,color:'#8B949E',margin:'0 0 4px'}}>Network Score: <strong style={{color:network.score>=80?GRN:network.score>=60?G:RED}}>{network.score??'—'}</strong></p>
            <p style={{fontSize:10,color:'#484F58',marginTop:8}}>Target: Total page weight under 1 MB, JS under 300 KB for good mobile performance.</p>
          </div>
        </Card>
      )}

      {/* ── Third-Party tab ── */}
      {result&&resTab==='thirdparty'&&(
        <Card title="Third-Party Script Analysis" accent={AMB}>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              {l:'Total Requests',v:thirdParty.total_requests??0,c:AMB},
              {l:'Scripts',v:thirdParty.script_count??0,c:thirdParty.script_count>10?RED:G},
              {l:'Unique Domains',v:thirdParty.unique_domains??0,c:AMB},
            ].map(item=>(
              <div key={item.l} className="be-card text-center overflow-hidden">
                <div style={{height:2,background:item.c}}/>
                <div className="p-3">
                  <p style={{fontSize:9,color:item.c,fontWeight:700,textTransform:'uppercase',marginBottom:4}}>{item.l}</p>
                  <p style={{fontSize:20,fontWeight:800,color:item.c}}>{item.v}</p>
                </div>
              </div>
            ))}
          </div>
          {(thirdParty.domains??[]).length>0&&(
            <div style={{background:'#0D1117',border:'1px solid #21262D',borderRadius:10,padding:16}}>
              <p style={{fontSize:10,color:'#484F58',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8,fontWeight:700}}>Third-Party Domains</p>
              <div className="flex flex-wrap gap-1.5">
                {(thirdParty.domains??[]).map((d:string,i:number)=>(
                  <span key={i} style={{fontSize:10,color:'#8B949E',background:'#161B22',border:'1px solid #30363D',borderRadius:5,padding:'2px 7px'}}>{d}</span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Findings tab ── */}
      {result&&resTab==='findings'&&findings.length>0&&(
        <Card title={`PSI Audit Findings (${findings.length})`} accent={G}>
          <div className="overflow-x-auto">
            <table className="be-table w-full">
              <thead><tr><th>Category</th><th>Audit</th><th>Score</th><th>Value</th></tr></thead>
              <tbody>
                {findings.slice(0,50).map((f:any,i:number)=>(
                  <tr key={i}>
                    <td><span className="be-badge" style={{color:BLU,background:'rgba(59,130,246,0.1)',borderColor:'rgba(59,130,246,0.3)'}}>{f.category}</span></td>
                    <td style={{color:'#F0F0F0',fontSize:12}}>{f.title}</td>
                    <td><span className="be-badge" style={{color:(f.score??0)>=90?GRN:(f.score??0)>=50?G:RED,background:(f.score??0)>=90?'rgba(34,197,94,0.1)':(f.score??0)>=50?'rgba(245,166,35,0.1)':'rgba(239,68,68,0.1)',borderColor:(f.score??0)>=90?'rgba(34,197,94,0.3)':(f.score??0)>=50?'rgba(245,166,35,0.3)':'rgba(239,68,68,0.3)'}}>{f.score??'N/A'}</span></td>
                    <td style={{fontFamily:'monospace',fontSize:10,color:'#484F58'}}>{f.display_value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <LogTerminal logs={state.logs} accent={G}/>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   MOBILE TESTING
══════════════════════════════════════════════════════════ */
const MOB_G='#3DDC84'
const CHECKS_DEF=[
  {k:'launch',   l:'App Launch & Loading',           c:MOB_G},{k:'ui_render',l:'UI Element Rendering',          c:MOB_G},
  {k:'touch',    l:'Touch & Gesture Response',       c:MOB_G},{k:'nav',      l:'Screen Navigation Flow',         c:MOB_G},
  {k:'network',  l:'Network Requests & APIs',        c:BLU},  {k:'memory',   l:'Memory Usage & Leaks',            c:G},
  {k:'cpu',      l:'CPU & Battery Impact',           c:G},    {k:'crash_det',l:'Crash Detection & Stability',    c:RED},
  {k:'perms',    l:'App Permissions Handling',       c:PUR},  {k:'offline',  l:'Offline / No-Network Mode',      c:AMB},
  {k:'deeplink', l:'Deep Links & Intent Handling',   c:BLU},  {k:'push',     l:'Push Notification Delivery',     c:PUR},
  {k:'i18n',     l:'Localisation & i18n',            c:AMB},  {k:'a11y_chk', l:'Accessibility (TalkBack/VO)',    c:GRN},
  {k:'sec_chk',  l:'Security: SSL + Storage',        c:RED},
]

export function MobileTesting(){
  const{state,startJob,cancel,reset}=useJob('mobile_testing')
  const[platform,setPlatform]=usePersistedState('mob_platform','android')
  const[buildPath,setBuildPath]=usePersistedState('mob_buildpath','')
  const[device,setDevice]=usePersistedState('mob_device','')
  const[osVer,setOsVer]=usePersistedState('mob_osver','')
  const[appium,setAppium]=usePersistedState('mob_appium','http://127.0.0.1:4723')
  const[testType,setTestType]=usePersistedState('mob_testtype','full')
  const[bm,setBm]=usePersistedState('mob_bm','headless')
  const[checks,setChecks]=usePersistedState<string[]>('mob_checks',['launch','ui_render','touch','nav','network','memory','crash_det','perms','a11y_chk','sec_chk'])
  const[uploaded,setUploaded]=usePersistedState('mob_uploaded','')
  const running=state.status==='running',result=state.result

  async function handleUpload(f:File){try{const r=await api.upload(f);setUploaded(r.path);setBuildPath(r.path)}catch(e){alert('Upload failed: '+e)}}
  async function run(){const path=uploaded||buildPath;if(!path){alert('Upload or enter a build file path');return}reset();const{job_id}=await api.mobile({platform,build_path:path,device,os_version:osVer,appium_url:appium,test_type:testType,browser_mode:bm,checks});startJob(job_id)}
  const dl=(d:any)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));a.download=`mobile_${Date.now()}.json`;a.click()}

  const pieData=[
    {name:'Pass', value:result?.results?.filter((r:any)=>r.status==='pass').length??0, fill:GRN},
    {name:'Fail', value:result?.results?.filter((r:any)=>r.status==='fail').length??0, fill:RED},
    {name:'Crash',value:result?.results?.filter((r:any)=>r.status==='crash').length??0,fill:G},
  ].filter(d=>d.value>0)

  return(
    <div className="p-5 flex flex-col gap-4">
      <div className="flex gap-3">
        <KpiTile label="Tests Run" value={result?.total??0}   accent={MOB_G}/><KpiTile label="Passed" value={result?.passed??0} accent={GRN}/>
        <KpiTile label="Failed"    value={result?.failed??0}  accent={RED}/> <KpiTile label="Crashes" value={result?.crashes??0} accent={G}/>
      </div>

      <Card title="1. Select Platform" accent={MOB_G} action={<UserGuideButton config={UG_MOBILE} color={MOB_G}/>}>
        <div className="grid grid-cols-2 gap-3">
          {[{v:'android',icon:'🤖',l:'Android',sub:'APK / APKS · ADB + UiAutomator2',col:MOB_G},{v:'ios',icon:'📲',l:'iOS',sub:'IPA · XCUITest via Appium (macOS)',col:'#60A5FA'}].map(p=>(
            <button key={p.v} onClick={()=>setPlatform(p.v)} className="p-4 rounded-xl text-left cursor-pointer transition-all"
              style={{background:platform===p.v?`${p.col}10`:'#161616',border:`1px solid ${platform===p.v?p.col:'#242424'}`,boxShadow:platform===p.v?`0 0 14px ${p.col}22`:'none'}}>
              <div className="text-[28px] mb-2">{p.icon}</div>
              <div className="font-display font-800 text-[14px] mb-1" style={{color:p.col}}>{p.l}</div>
              <div className="font-body text-[11px]" style={{color:'#3A3A3A'}}>{p.sub}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card title={`2. Upload ${platform==='android'?'APK / APKS':'IPA'} File`} accent={MOB_G}>
        <div className="flex gap-3 items-end mb-2.5">
          <div className="flex-1">
            <FieldLabel text={`${platform==='android'?'APK / APKS':'IPA'} file`}/>
            <input type="file" accept={platform==='android'?'.apk,.apks':'.ipa'} onChange={e=>e.target.files?.[0]&&handleUpload(e.target.files[0])} className="be-input cursor-pointer w-full"/>
          </div>
          {uploaded&&<div className="px-3 py-2 rounded-lg font-body font-600 text-[11px] flex-shrink-0" style={{background:'rgba(34,197,94,0.1)',color:GRN,border:'1px solid rgba(34,197,94,0.2)'}}>✓ Uploaded</div>}
        </div>
        <Input value={buildPath} onChange={setBuildPath} placeholder="/path/to/app.apk  — or upload above"/>
      </Card>

      <Card title="3. Device & Driver Configuration" accent={MOB_G}>
        <div className="grid grid-cols-4 gap-3">
          <Input label="Device Name / UDID" value={device} onChange={setDevice} placeholder="Pixel_6_API_34"/>
          <Input label="OS Version" value={osVer} onChange={setOsVer} placeholder="14.0"/>
          <Select label="Browser / Driver Mode" value={bm} onChange={setBm} options={[{value:'headless',label:'🖥 Headless (fastest)'},{value:'visible',label:'👁 Visible (debug)'}]}/>
          <Select label="Test Type" value={testType} onChange={setTestType} options={[{value:'full',label:'Full Suite'},{value:'ui',label:'UI/UX'},{value:'perf',label:'Performance'},{value:'crash',label:'Crash/Stability'},{value:'api',label:'API+Network'},{value:'a11y',label:'Accessibility'},{value:'security',label:'Security'}]}/>
        </div>
        <div className="mt-3">
          <Input label="Appium Server URL" value={appium} onChange={setAppium}/>
          <p className="font-body text-[10px] mt-1.5" style={{color:'#3A3A3A'}}>Start Appium first: <code className="font-mono" style={{color:G}}>appium</code> — default port 4723</p>
        </div>
      </Card>

      <Card title="4. Test Checks (15 available)" accent={MOB_G}>
        <div className="flex flex-wrap gap-2">
          {CHECKS_DEF.map(c=>(
            <button key={c.k} onClick={()=>setChecks(cs=>cs.includes(c.k)?cs.filter(x=>x!==c.k):[...cs,c.k])} className="be-pill" style={checks.includes(c.k)?{background:`${c.c}12`,color:c.c,borderColor:`${c.c}44`,boxShadow:`0 0 8px ${c.c}22`}:{}}>{c.l}</button>
          ))}
        </div>
      </Card>

      <div className="flex gap-2 flex-wrap">
        <RunButton onClick={run} disabled={running} loading={running} label={running?'Testing…':'Run Mobile Tests'} color={MOB_G} icon="📱"/>
        <StopButton onClick={cancel} disabled={!running}/><GhostBtn onClick={reset} label="Clear"/>
        {result&&<GhostBtn onClick={()=>dl(result)} label="Download JSON" icon="↓"/>}
        {result?.report_html&&<GhostBtn onClick={()=>window.open(result.report_html,'_blank')} label="View HTML Report" icon="👁️"/>}
        {result?.report_xlsx&&<GhostBtn onClick={()=>{const a=document.createElement('a');a.href=result.report_xlsx;a.download=result.report_xlsx.split('/').pop();a.click()}} label="Download Excel" icon="📊"/>}
      </div>
      <LogTerminal logs={state.logs} accent={MOB_G}/>

      {result?.results?.length>0&&(
        <div className="grid grid-cols-2 gap-4">
          <Card title="Pass / Fail Breakdown" accent={MOB_G}>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart><Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={70} label>{pieData.map((e,i)=><Cell key={i} fill={e.fill}/>)}</Pie>
                <Tooltip {...TT}/><Legend formatter={v=><span style={{color:'#888',fontSize:11}}>{v}</span>}/>
              </PieChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Per-Check Results" accent={MOB_G}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={result.results.map((r:any)=>({name:r.check.split(' ').slice(0,2).join(' '),value:r.status==='pass'?1:0,fill:r.status==='pass'?GRN:r.status==='crash'?G:RED}))} layout="vertical" margin={{left:0,right:8}}>
                <XAxis type="number" domain={[0,1]} hide/><YAxis type="category" dataKey="name" tick={{fontSize:9,fill:'#3A3A3A'}} width={80}/>
                <Tooltip contentStyle={TT.contentStyle} formatter={(v:any)=>v===1?'Pass':'Fail'}/>
                <Bar dataKey="value" radius={[0,4,4,0]}>{result.results.map((_:any,i:number)=><Cell key={i} fill={result.results[i].status==='pass'?GRN:result.results[i].status==='crash'?G:RED}/>)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {result?.results?.length>0&&(
        <Card title="Detailed Test Results" accent={MOB_G}>
          <div className="overflow-x-auto">
            <table className="be-table">
              <thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead>
              <tbody>
                {result.results.map((r:any,i:number)=>(
                  <tr key={i}>
                    <td style={{color:'#F0F0F0',fontWeight:600}}>{r.check}</td>
                    <td><span className="be-badge" style={{color:r.status==='pass'?GRN:r.status==='crash'?G:RED,background:r.status==='pass'?'rgba(34,197,94,0.1)':r.status==='crash'?'rgba(245,166,35,0.1)':'rgba(239,68,68,0.1)',borderColor:r.status==='pass'?'rgba(34,197,94,0.3)':r.status==='crash'?'rgba(245,166,35,0.3)':'rgba(239,68,68,0.3)'}}>{r.status==='pass'?'PASS':r.status==='crash'?'CRASH':'FAIL'}</span></td>
                    <td>{r.detail||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   AUTOMATION (7 sub-tabs)
══════════════════════════════════════════════════════════ */
export function Automation(){
  const[tab,setTab]=usePersistedState('auto_tab','suites')
  const TABS=[{k:'suites',l:'Test Suites'},{k:'browser',l:'Browser'},{k:'api',l:'API Testing'},{k:'regression',l:'Regression'},{k:'cicd',l:'CI/CD'},{k:'scheduler',l:'Scheduler'},{k:'reports',l:'Reports'}]
  return(
    <div>
      <div className="flex bg-card border-b border-bdr overflow-x-auto">
        {TABS.map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)} className="px-5 py-3 font-display font-700 text-[12px] whitespace-nowrap cursor-pointer transition-all flex-shrink-0"
            style={{background:'transparent',border:'none',borderBottom:`2px solid ${tab===t.k?G:'transparent'}`,color:tab===t.k?G:'#555'}}>
            {t.l}
          </button>
        ))}
      </div>
      <div className="p-5">
        {tab==='suites'&&<SuitesTab/>}{tab==='browser'&&<BrowserTab/>}{tab==='api'&&<ApiTab/>}
        {tab==='regression'&&<RegressionTab/>}{tab==='cicd'&&<CicdTab/>}{tab==='scheduler'&&<SchedulerTab/>}{tab==='reports'&&<ReportsSubTab/>}
      </div>
    </div>
  )
}

function SuitesTab(){
  const[name,setName]=useState(''),[url,setUrl]=useState(''),[suites,setSuites]=useState<any[]>([])
  function add(){
    if(!name||!url)return;
    let targetUrl = url.trim()
    if(!/^https?:\/\//i.test(targetUrl)){
      targetUrl = 'https://' + targetUrl
    }
    setSuites(s=>[...s,{name,url:targetUrl,created:new Date().toLocaleString(),status:'Ready'}]);
    setName('');setUrl('')
  }
  return(<div className="flex flex-col gap-4">
    <Card title="Create Test Suite" accent={G}>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Input label="Suite Name" value={name} onChange={setName} placeholder="Nightly QA Suite"/>
        <Input label="Target URL" value={url} onChange={setUrl} type="url" placeholder="https://example.com"/>
      </div>
      <GhostBtn onClick={add} label="+ Create Suite"/>
    </Card>
    {suites.length>0&&<Card title="Saved Suites" accent={G}><div className="overflow-x-auto"><table className="be-table"><thead><tr><th>Name</th><th>URL</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead><tbody>{suites.map((s,i)=>(<tr key={i}><td style={{color:'#F0F0F0',fontWeight:600}}>{s.name}</td><td style={{fontFamily:'"JetBrains Mono",monospace',fontSize:10}}>{s.url}</td><td>{s.created}</td><td><Badge label={s.status} type="warn"/></td><td><button onClick={()=>setSuites(ss=>ss.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:RED,cursor:'pointer',fontSize:11}}>Remove</button></td></tr>))}</tbody></table></div></Card>}
  </div>)
}

function BrowserTab(){
  const{state,startJob,cancel,reset}=useJob('auto_browser')
  const[url,setUrl]=usePersistedState('auto_br_url','')
  const CK=['Page load <3s','HTTP 200','No JS errors','No broken images','Title tag','H1 heading','Viewport meta','HTTPS cert','Form labels','ARIA landmarks','LCP <2.5s','CLS <0.1','Mobile touch targets','Cookie Secure flag','CSP header']
  const[sel,setSel]=useState(CK.slice(0,8))
  async function run(){
    let targetUrl = url.trim()
    if(!targetUrl)return;
    if(!/^https?:\/\//i.test(targetUrl)){
      targetUrl = 'https://' + targetUrl
      setUrl(targetUrl)
    }
    reset();const{job_id}=await api.apiTest({url:targetUrl,method:'GET',assert_status:200,checks:sel});startJob(job_id)}
  return(<div className="flex flex-col gap-4">
    <Card 
      title="Browser Automation Checks" 
      accent={BLU}
      action={state.result?.report_html && (
        <div className="flex gap-2">
          <GhostBtn onClick={() => window.open(state.result.report_html, '_blank')} label="View HTML" icon="👁️"/>
          {state.result.report_json && (
            <GhostBtn 
              onClick={() => {
                const a = document.createElement('a');
                a.href = state.result.report_json;
                a.download = state.result.report_json.split('/').pop();
                a.click();
              }} 
              label="Download JSON" 
              icon="⬇️"
            />
          )}
        </div>
      )}
    >
      <Input label="Target URL" value={url} onChange={setUrl} type="url" placeholder="https://example.com" className="mb-3"/>
      <div className="flex flex-wrap gap-2 mb-3">{CK.map(c=><CheckPill key={c} checked={sel.includes(c)} onChange={on=>setSel(s=>on?[...s,c]:s.filter(x=>x!==c))} label={c}/>)}</div>
      <div className="flex gap-2"><RunButton onClick={run} disabled={!url||state.status==='running'} loading={state.status==='running'} label="Run Checks" color={BLU}/><StopButton onClick={cancel} disabled={state.status!=='running'}/><GhostBtn onClick={reset} label="Clear"/></div>
    </Card>
    <LogTerminal logs={state.logs} accent={BLU}/>
  </div>)
}

function ApiTab(){
  const{state,startJob,cancel,reset}=useJob('auto_api')
  const[url,setUrl]=usePersistedState('auto_api_url','')
  const[method,setMethod]=usePersistedState('auto_api_method','GET')
  const[body,setBody]=usePersistedState('auto_api_body','{}')
  const[assertStatus,setAS]=usePersistedState('auto_api_status','200')
  async function run(){
    let targetUrl = url.trim()
    if(!targetUrl)return;
    if(!/^https?:\/\//i.test(targetUrl)){
      targetUrl = 'https://' + targetUrl
      setUrl(targetUrl)
    }
    reset();const{job_id}=await api.apiTest({url:targetUrl,method,headers:{},body:method==='GET'?'':body,assert_status:+assertStatus});startJob(job_id)}
  return(<div className="flex flex-col gap-4">
    <Card title="API Testing" accent={AMB}>
      <div className="flex gap-3 mb-3">
        <Select label="Method" value={method} onChange={setMethod} className="w-28" options={['GET','POST','PUT','PATCH','DELETE'].map(v=>({value:v,label:v}))}/>
        <Input label="Endpoint URL" value={url} onChange={setUrl} type="url" placeholder="https://api.example.com/endpoint" className="flex-1"/>
      </div>
      {method!=='GET'&&(<div className="mb-3"><FieldLabel text="Request Body (JSON)"/><textarea value={body} onChange={e=>setBody(e.target.value)} rows={4} className="be-input w-full resize-y" style={{fontFamily:'"JetBrains Mono",monospace',fontSize:11}}/></div>)}
      <Input label="Assert Status Code" value={assertStatus} onChange={setAS} type="number" className="mb-3"/>
      <div className="flex gap-2"><RunButton onClick={run} disabled={!url||state.status==='running'} loading={state.status==='running'} label="Send Request" color={AMB}/><GhostBtn onClick={reset} label="Clear"/></div>
    </Card>
    <LogTerminal logs={state.logs} accent={AMB}/>
  </div>)
}

function RegressionTab(){
  const{state,startJob,cancel,reset}=useJob('auto_regression')
  const[base,setBase]=usePersistedState('auto_reg_base','')
  const[comp,setComp]=usePersistedState('auto_reg_comp','')
  async function run(){
    let targetBase = base.trim()
    let targetComp = comp.trim()
    if(!targetBase||!targetComp)return;
    if(!/^https?:\/\//i.test(targetBase)){
      targetBase = 'https://' + targetBase
      setBase(targetBase)
    }
    if(!/^https?:\/\//i.test(targetComp)){
      targetComp = 'https://' + targetComp
      setComp(targetComp)
    }
    reset();const{job_id}=await api.qaScan({url:targetBase,checks:['seo','performance','security','accessibility','broken_links']});startJob(job_id)}
  return(<div className="flex flex-col gap-4">
    <Card title="Regression Runner" accent={GRN}>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Input label="Baseline URL" value={base} onChange={setBase} type="url" placeholder="https://staging.example.com"/>
        <Input label="Comparison URL" value={comp} onChange={setComp} type="url" placeholder="https://production.example.com"/>
      </div>
      <div className="flex gap-2"><RunButton onClick={run} disabled={!base||!comp||state.status==='running'} loading={state.status==='running'} label="Run Regression" color={GRN}/><StopButton onClick={cancel} disabled={state.status!=='running'}/><GhostBtn onClick={reset} label="Clear"/></div>
    </Card>
    <LogTerminal logs={state.logs} accent={GRN}/>
  </div>)
}

function CicdTab(){
  const[platform,setPlatform]=useState('GitHub Actions'),[ciUrl,setCiUrl]=useState(''),[copied,setCopied]=useState(false)
  let targetUrl = ciUrl.trim()
  if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl
  }
  const formattedUrl = targetUrl || 'https://example.com'
  const CFGS:Record<string,string>={'GitHub Actions':`name: SiteSentinel QA\non: [push, pull_request]\njobs:\n  qa:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n        with: { python-version: '3.11' }\n      - run: pip install -r backend/requirements.txt\n      - run: playwright install chromium\n      - name: Run QA Scan\n        run: |\n          curl -X POST http://localhost:8000/scan/qa \\\n            -H "Content-Type: application/json" \\\n            -d \'{"url":"${formattedUrl}","checks":["seo","performance","security"]}\'`,'GitLab CI':`stages: [test]\nqa-scan:\n  stage: test\n  image: python:3.11\n  before_script:\n    - pip install -r backend/requirements.txt\n    - playwright install chromium\n  script:\n    - uvicorn backend.main:app --port 8000 &\n    - sleep 3\n    - curl -X POST http://localhost:8000/scan/qa -H "Content-Type: application/json" -d \'{"url":"${formattedUrl}"}\'`,'Jenkins':`pipeline {\n  agent any\n  stages {\n    stage('QA Scan') {\n      steps {\n        sh 'pip install -r backend/requirements.txt'\n        sh 'playwright install chromium'\n        sh 'uvicorn backend.main:app --port 8000 &'\n        sh 'sleep 3'\n        sh 'curl -X POST http://localhost:8000/scan/qa -H "Content-Type: application/json" -d \\'{"url":"${formattedUrl}"}\\''\n      }\n    }\n  }\n}`}
  function copy(){navigator.clipboard.writeText(CFGS[platform]||'');setCopied(true);setTimeout(()=>setCopied(false),2000)}
  return(<div className="flex flex-col gap-4">
    <Card title="CI/CD Config Generator" accent={G}>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Select label="Platform" value={platform} onChange={setPlatform} options={['GitHub Actions','GitLab CI','Jenkins'].map(v=>({value:v,label:v}))}/>
        <Input label="Target URL" value={ciUrl} onChange={setCiUrl} type="url" placeholder="https://example.com"/>
      </div>
      <FieldLabel text="Generated Config"/>
      <textarea readOnly value={CFGS[platform]||''} rows={14} className="be-input w-full mb-3 font-mono resize-none" style={{fontFamily:'"JetBrains Mono",monospace',fontSize:11,background:'#080808'}}/>
      <div className="flex items-center gap-3">
        <RunButton onClick={copy} label={copied?'✓ Copied!':'Copy Config'} color={G} icon="📋"/>
        {copied&&<span className="font-display font-700 text-[12px]" style={{color:GRN}}>Copied to clipboard</span>}
      </div>
    </Card>
  </div>)
}

function SchedulerTab(){
  const[jobs,setJobs]=useState<any[]>([]),[name,setName]=useState(''),[url,setUrl]=useState(''),[freq,setFreq]=useState('Daily')
  function add(){
    if(!name||!url)return;
    let targetUrl = url.trim()
    if(!/^https?:\/\//i.test(targetUrl)){
      targetUrl = 'https://' + targetUrl
    }
    setJobs(s=>[...s,{name,url:targetUrl,freq,last:'Never',status:'Active'}]);
    setName('');setUrl('')
  }
  return(<div className="flex flex-col gap-4">
    <Card title="Test Scheduler" accent={BLU}>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <Input label="Job Name" value={name} onChange={setName} placeholder="Nightly QA"/>
        <Input label="Target URL" value={url} onChange={setUrl} type="url" placeholder="https://example.com"/>
        <Select label="Frequency" value={freq} onChange={setFreq} options={['Every hour','Every 6h','Daily','Weekly'].map(v=>({value:v,label:v}))}/>
      </div>
      <GhostBtn onClick={add} label="+ Add Schedule"/>
    </Card>
    {jobs.length>0&&<Card title="Scheduled Jobs" accent={BLU}><div className="overflow-x-auto"><table className="be-table"><thead><tr><th>Job</th><th>URL</th><th>Frequency</th><th>Last Run</th><th>Status</th></tr></thead><tbody>{jobs.map((j,i)=>(<tr key={i}><td style={{color:'#F0F0F0',fontWeight:600}}>{j.name}</td><td style={{fontFamily:'"JetBrains Mono",monospace',fontSize:10}}>{j.url}</td><td>{j.freq}</td><td style={{color:'#3A3A3A'}}>{j.last}</td><td><Badge label={j.status} type="success"/></td></tr>))}</tbody></table></div></Card>}
  </div>)
}

function ReportsSubTab(){
  const [reports,  setReports]  = useState<any[]>([])
  const [dlStatus, setDlStatus] = useState<Record<string, 'idle'|'loading'|'error'>>({})
  useEffect(()=>{ api.listReports().then(r=>setReports(r.reports)).catch(()=>{}) },[])

  // Fetch → blob → object URL: works regardless of proxy or CORS headers
  async function dlReport(name: string) {
    setDlStatus(s => ({ ...s, [name]: 'loading' }))
    try {
      const res = await fetch(api.getReportUrl(name))
      if (!res.ok) throw new Error(`${res.status}`)
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(objUrl), 2000)
      setDlStatus(s => ({ ...s, [name]: 'idle' }))
    } catch {
      setDlStatus(s => ({ ...s, [name]: 'error' }))
      setTimeout(() => setDlStatus(s => ({ ...s, [name]: 'idle' })), 3000)
    }
  }

  const TYPE_META: Record<string, {icon:string; label:string; color:string}> = {
    xlsx: { icon:'📊', label:'Excel', color:'#22C55E' },
    html: { icon:'🌐', label:'HTML',  color:'#3B82F6' },
    json: { icon:'{}', label:'JSON',  color:'#8B949E' },
  }

  return(
    <Card title="Saved Reports" accent={G}>
      {reports.length===0
        ? <div className="text-center py-10">
            <div className="text-[40px] mb-3">📭</div>
            <p className="font-body" style={{color:'#3A3A3A'}}>No reports yet. Run a QA scan to generate reports.</p>
          </div>
        : <div className="overflow-x-auto">
            <table className="be-table">
              <thead>
                <tr><th>Type</th><th>Filename</th><th>Size</th><th>Generated</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {reports.map(r => {
                  const ext  = r.type || r.name.split('.').pop() || ''
                  const meta = TYPE_META[ext] ?? { icon:'📄', label: ext.toUpperCase(), color:'#8B949E' }
                  const st   = dlStatus[r.name] ?? 'idle'
                  return (
                    <tr key={r.name}>
                      <td>
                        <span className="be-badge" style={{color:meta.color,background:`${meta.color}18`,borderColor:`${meta.color}44`,fontWeight:700}}>
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      <td style={{fontFamily:'"JetBrains Mono",monospace',fontSize:10,color:'#C9D1D9'}}>{r.name}</td>
                      <td style={{fontFamily:'"JetBrains Mono",monospace',fontSize:11}}>
                        {r.size >= 1024 ? `${Math.round(r.size/1024)} KB` : `${r.size} B`}
                      </td>
                      <td style={{color:'#8B949E',fontSize:11}}>{new Date(r.modified).toLocaleString()}</td>
                      <td>
                        {/* HTML: open via /api proxy so Vite dev server doesn't inject HMR into the report */}
                        {ext === 'html' && (
                          <div className="flex gap-3 items-center">
                            <button
                              onClick={() => window.open(api.getReportUrl(r.name), '_blank')}
                              style={{background:'none',border:'none',color:'#3B82F6',cursor:'pointer',fontWeight:700,fontSize:12,padding:0}}>
                              View ↗
                            </button>
                            <button
                              onClick={() => dlReport(r.name)}
                              disabled={dlStatus[r.name] === 'loading'}
                              style={{background:'none',border:'none',cursor:dlStatus[r.name]==='loading'?'wait':'pointer',
                                      fontWeight:700,fontSize:12,padding:0,
                                      color: dlStatus[r.name]==='error' ? '#EF4444' : dlStatus[r.name]==='loading' ? '#8B949E' : meta.color}}>
                              {dlStatus[r.name] === 'loading' ? '…' : dlStatus[r.name] === 'error' ? 'Error ✗' : 'Download ↓'}
                            </button>
                          </div>
                        )}
                        {/* xlsx / json: fetch → blob download (reliable cross-proxy) */}
                        {(ext === 'xlsx' || ext === 'json') && (
                          <button
                            onClick={() => dlReport(r.name)}
                            disabled={st === 'loading'}
                            style={{background:'none',border:'none',cursor:st==='loading'?'wait':'pointer',
                                    fontWeight:700,fontSize:12,padding:0,
                                    color: st==='error' ? '#EF4444' : st==='loading' ? '#8B949E' : meta.color}}>
                            {st === 'loading' ? '…' : st === 'error' ? 'Error ✗' : 'Download ↓'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
      }
    </Card>
  )
}

export function Reports(){
  return <div className="p-5"><ReportsSubTab/></div>
}

export function AllScans(){
  const [jobs,setJobs]=useState<any[]>([])
  const [loading,setLoading]=useState(false)
  const [detail,setDetail]=useState<any>(null)
  const [autoRefresh,setAutoRefresh]=useState(true)
  
  useEffect(()=>{
    const refresh=()=>{api.dashboardList().then(r=>setJobs(r.jobs)).catch(()=>{})}
    refresh()
    if(!autoRefresh) return
    const iv=setInterval(refresh, 3000)
    return ()=>clearInterval(iv)
  },[autoRefresh])
  
  async function gen(fmt:'html'|'csv'|'both'){
    setLoading(true)
    try{
      const r=await api.dashboardReport({format:fmt})
      if(r.report_html) window.open(r.report_html,'_blank')
      else if(r.report_csv) window.open(r.report_csv,'_blank')
    }catch(e){alert('Failed to generate report: '+e)}
    setLoading(false)
  }
  
  async function viewDetail(jid:string){
    try{
      const d=await api.dashboardDetail(jid)
      setDetail(d)
    }catch(e){alert('Failed to load details: '+e)}
  }
  
  const stats={
    total: jobs.length,
    done: jobs.filter(j=>j.status==='done').length,
    running: jobs.filter(j=>j.status==='running').length,
    error: jobs.filter(j=>j.status==='error').length,
  }
  
  const typeBreakdown:Record<string,number>={}
  jobs.forEach(j=>{typeBreakdown[j.type]=(typeBreakdown[j.type]||0)+1})
  
  const avgScore=jobs.length>0?Math.round(jobs.reduce((s,j)=>s+(j.report_score||0),0)/jobs.length):0

  if(detail) return (
    <div className="p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-700 text-lg">Scan Details: {detail.summary.job_id}</h2>
        <GhostBtn onClick={()=>setDetail(null)} label="← Back"/>
      </div>
      
      <div className="grid grid-cols-4 gap-3">
        <div className="be-card p-3"><p className="font-body text-[10px]" style={{color:'#3A3A3A'}}>TYPE</p><p className="font-display font-700 text-[14px] mt-1">{detail.summary.type}</p></div>
        <div className="be-card p-3"><p className="font-body text-[10px]" style={{color:'#3A3A3A'}}>STATUS</p><p className="font-display font-700 text-[14px] mt-1">{detail.summary.status}</p></div>
        <div className="be-card p-3"><p className="font-body text-[10px]" style={{color:'#3A3A3A'}}>PROGRESS</p><p className="font-display font-700 text-[14px] mt-1" style={{color:G}}>{detail.summary.progress}%</p></div>
        <div className="be-card p-3"><p className="font-body text-[10px]" style={{color:'#3A3A3A'}}>STARTED</p><p className="font-body text-[11px] mt-1">{new Date(detail.summary.started).toLocaleString().slice(0,16)}</p></div>
      </div>
      
      {detail.metrics?.by_result && (
        <Card title="Test Results" accent={GRN}>
          <div className="flex gap-4">
            <div className="flex-1 p-3 rounded-lg" style={{background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.2)'}}>
              <p className="font-body text-[11px]" style={{color:'#3A3A3A'}}>PASSED</p>
              <p className="font-display font-700 text-[24px]" style={{color:GRN}}>{detail.metrics.by_result.Pass}</p>
            </div>
            <div className="flex-1 p-3 rounded-lg" style={{background:'rgba(245,166,35,0.1)',border:'1px solid rgba(245,166,35,0.2)'}}>
              <p className="font-body text-[11px]" style={{color:'#3A3A3A'}}>WARNINGS</p>
              <p className="font-display font-700 text-[24px]" style={{color:G}}>{detail.metrics.by_result.Warn}</p>
            </div>
            <div className="flex-1 p-3 rounded-lg" style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)'}}>
              <p className="font-body text-[11px]" style={{color:'#3A3A3A'}}>FAILED</p>
              <p className="font-display font-700 text-[24px]" style={{color:RED}}>{detail.metrics.by_result.Fail}</p>
            </div>
          </div>
        </Card>
      )}
      
      {detail.test_cases?.length>0 && (
        <Card title={`Test Cases (${detail.test_cases.length})`} accent={BLU}>
          <div className="overflow-x-auto">
            <table className="be-table">
              <thead><tr><th>Name</th><th>Category</th><th>Result</th><th>Severity</th><th>Detail</th></tr></thead>
              <tbody>
                {detail.test_cases.slice(0,20).map((tc:any,i:number)=>(
                  <tr key={i}>
                    <td style={{color:'#F0F0F0',fontWeight:600}}>{tc['Test Name']}</td>
                    <td>{tc.Category}</td>
                    <td><span className="be-badge" style={{color:tc.Result==='Pass'?GRN:tc.Result==='Warn'?G:RED,background:tc.Result==='Pass'?'rgba(34,197,94,0.1)':tc.Result==='Warn'?'rgba(245,166,35,0.1)':'rgba(239,68,68,0.1)',borderColor:tc.Result==='Pass'?'rgba(34,197,94,0.3)':tc.Result==='Warn'?'rgba(245,166,35,0.3)':'rgba(239,68,68,0.3)'}}>{tc.Result}</span></td>
                    <td>{tc.Severity}</td>
                    <td style={{fontSize:11}}>{tc.Detail?.slice(0,40)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      
      <Card title="Recent Logs" accent={AMB}>
        <div className="font-mono text-[11px]" style={{background:'#080808',padding:12,borderRadius:8,maxHeight:200,overflowY:'auto'}}>
          {detail.logs?.slice(-20).map((log:any,i:number)=>(
            <div key={i} style={{color:log.level==='err'?RED:log.level==='ok'?GRN:'#888',marginBottom:4}}>
              <span style={{color:'#3A3A3A'}}>{log.ts}</span> {log.msg}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )

  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-700">All Scans Dashboard</h2>
        <div className="flex gap-2 items-center">
          <Toggle checked={autoRefresh} onChange={setAutoRefresh} label="Auto-Refresh"/>
          <RunButton onClick={()=>api.dashboardList().then(r=>setJobs(r.jobs))} label="Refresh" color={BLU} icon="🔄"/>
          <RunButton onClick={()=>gen('both')} loading={loading} label={loading?'Generating…':'Export'} color={G}/>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="be-card p-4"><p className="font-body text-[10px]" style={{color:'#3A3A3A'}}>TOTAL SCANS</p><p className="font-display font-700 text-[28px]">{stats.total}</p></div>
        <div className="be-card p-4"><p className="font-body text-[10px]" style={{color:'#3A3A3A'}}>COMPLETED</p><p className="font-display font-700 text-[28px]" style={{color:GRN}}>{stats.done}</p></div>
        <div className="be-card p-4"><p className="font-body text-[10px]" style={{color:'#3A3A3A'}}>RUNNING</p><p className="font-display font-700 text-[28px]" style={{color:G}}>{stats.running}</p></div>
        <div className="be-card p-4"><p className="font-body text-[10px]" style={{color:'#3A3A3A'}}>ERRORS</p><p className="font-display font-700 text-[28px]" style={{color:RED}}>{stats.error}</p></div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card title="Scan Types" accent={BLU}>
          {Object.entries(typeBreakdown).map(([type,count])=>(
            <div key={type} className="flex justify-between items-center py-2 border-b border-bdr last:border-0">
              <span className="font-body text-[12px]">{type}</span>
              <span className="font-display font-700" style={{color:BLU}}>{count as number}</span>
            </div>
          ))}
        </Card>
        <Card title="Avg Score" accent={GRN}>
          <div className="text-center py-4">
            <p className="font-body text-[12px]" style={{color:'#3A3A3A'}}>Average Score</p>
            <p className="font-display font-700 text-[48px]" style={{color:GRN,lineHeight:1}}>{avgScore}%</p>
          </div>
        </Card>
      </div>

      <Card title="Scans" accent={G}>
        <div className="overflow-x-auto">
          <table className="be-table">
            <thead><tr><th>Job ID</th><th>Type</th><th>Status</th><th>Progress</th><th>Score</th><th>Action</th></tr></thead>
            <tbody>
              {jobs.map((j:any)=> (
                <tr key={j.job_id}>
                  <td style={{fontFamily:'"JetBrains Mono",monospace',fontSize:11}}>{j.job_id.slice(0,12)}</td>
                  <td>{j.type}</td>
                  <td><span className="be-badge" style={{color:j.status==='done'?GRN:j.status==='running'?G:RED,background:j.status==='done'?'rgba(34,197,94,0.1)':j.status==='running'?'rgba(245,166,35,0.1)':'rgba(239,68,68,0.1)',borderColor:j.status==='done'?'rgba(34,197,94,0.3)':j.status==='running'?'rgba(245,166,35,0.3)':'rgba(239,68,68,0.3)'}}>{j.status}</span></td>
                  <td>{j.progress}%</td>
                  <td style={{color:GRN,fontWeight:600}}>{j.report_score||0}%</td>
                  <td><button onClick={()=>viewDetail(j.job_id)} style={{background:'none',border:'none',color:BLU,cursor:'pointer',fontWeight:600,fontSize:12}}>View →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   SCAN HISTORY
   ══════════════════════════════════════════════════════════ */
export function History() {
  const [scans, setScans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await api.getScanHistory()
      setScans(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h2 className="font-display font-800 text-[24px] text-white">Scan History</h2>
        <GhostBtn onClick={load} label={loading ? 'Refreshing...' : 'Refresh'} icon="🔄" />
      </div>

      <Card title="All Recent Scans" accent={BLU}>
        {loading && <p className="text-sm text-slate-500">Loading historical data...</p>}
        {!loading && scans.length === 0 && <p className="text-sm text-slate-500">No scans found in database.</p>}

        {!loading && scans.length > 0 && (
          <div className="overflow-x-auto">
            <table className="be-table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Type</th>
                  <th>URL</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((s: any) => (
                  <tr key={s.id}>
                    <td className="font-mono text-[11px] text-slate-400">{s.id.slice(0, 13)}...</td>
                    <td><span className="be-badge" style={{ background: '#1e1e1e', color: '#888' }}>{s.type.toUpperCase()}</span></td>
                    <td className="max-w-[200px] truncate" title={s.url}>{s.url}</td>
                    <td>
                      <Badge 
                        label={s.status.toUpperCase()} 
                        type={s.status === 'completed' || s.status === 'done' ? 'success' : s.status === 'failed' || s.status === 'error' ? 'error' : 'warn'} 
                      />
                    </td>
                    <td className="text-[11px] text-slate-500">{new Date(s.created_at).toLocaleString()}</td>
                    <td>
                      <GhostBtn onClick={() => window.open(`/scans/${s.id}`, '_blank')} label="Details" icon="🔍" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}