// src/api/client.ts  — v3.3 — all endpoints wired + Vercel fix + proxy API

// Frontend and backend are always deployed as a single origin (see vercel.json's
// /api/(.*) rewrite), so the API base is always relative. VITE_API_BASE_URL
// remains as an explicit override for non-standard setups.
const BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? '/api'
  : 'https://sitesentinenl.vercel.app' 

export interface LogEntry { ts: string; level: string; msg: string }

/** Client-side URL format check — call before any API scan. Returns error string or null. */
export function validateUrlFormat(url: string): string | null {
  const u = url.trim()
  if (!u) return 'Please enter a URL'
  try {
    const parsed = new URL(u)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return 'URL must use http:// or https://'
    }
    const host = parsed.hostname
    if (!host || !host.includes('.') || host.endsWith('.')) {
      return 'Invalid URL — missing or incomplete domain name'
    }
    return null
  } catch {
    return 'Invalid URL format — please enter a valid web address (e.g. https://example.com)'
  }
}
export interface Job      { id: string; status: string; logs: LogEntry[]; result: any; progress: number; partial?: any }

function ensureHttps(url: string): string {
  if (!url) return url;
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  if (body && typeof body === 'object') {
    const b = body as any;
    if (typeof b.url === 'string' && b.url) {
      b.url = ensureHttps(b.url);
    }
  }
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${r.status} — ${await r.text()}`)
  return r.json()
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`)
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
}

// SSE live stream — returns a cleanup function
export function streamJob(
  jobId: string,
  onLog:     (entry: LogEntry) => void,
  onPartial: (data: any)       => void,
  onDone:    (result: any)     => void,
  onError:   (err: string)     => void,
  since:     number = 0,
): () => void {
  const es = new EventSource(`${BASE}/jobs/${jobId}/stream?since=${since}`)
  // Job failures are reported explicitly by the server as a message with an
  // `error` field (see the "not found" / terminal-status branches in the
  // backend's stream generator) — those are the only cases that should mark
  // the job as errored. EventSource's onerror fires for ordinary transient
  // connection drops (briefly true right after a hard page reload, network
  // blips, etc.) as well as for the server closing the response after a
  // clean 'done' — neither is an actual job failure, so onerror must not
  // treat them as one. We just let the browser's built-in auto-reconnect
  // keep retrying; `finished` stops it from doing anything once we've
  // already resolved via an explicit message.
  let finished = false
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      if (data.event === 'done')    { finished = true; onDone(data.result ?? data); es.close() }
      else if (data.event === 'partial') onPartial(data.data)
      else if (data.error)          { finished = true; onError(data.error); es.close() }
      else                            onLog(data as LogEntry)
    } catch { /* ignore bad frames */ }
  }
  es.onerror = () => {
    if (finished) es.close()
    // otherwise: no-op — let EventSource auto-reconnect and keep waiting
    // for an explicit done/error message from the server.
  }
  return () => es.close()
}

export async function cancelJob(id: string) {
  await fetch(`${BASE}/jobs/${id}`, { method: 'DELETE' })
}

export const api = {
  health:       () => get<{status:string}>('/health'),
  listReports:  () => get<{reports:any[]}>('/reports'),
  getReportUrl: (f: string) => {
    if (!f) return f
    if (/^https?:\/\//i.test(f)) return f
    const filename = f.replace(/^\/reports\//, '').replace(/^reports\//, '')
    return `${BASE}/reports/${filename}`
  },

  qaScan: (b:{url:string;viewport?:string;max_pages?:number;figma_url?:string;checks?:string[]}) =>
    post<{job_id:string}>('/scan/qa', b),

  loadTest: (b:{url:string;test_type?:string;test_types?:string[];virtual_users?:number;duration_min?:number;ramp_up_sec?:number;think_time_ms?:number}) =>
    post<{job_id:string}>('/scan/load', b),

  unicorn: (b:{url:string;scenario?:string;headers?:Record<string,string>;virtual_users?:number;duration_min?:number}) =>
    post<{job_id:string}>('/scan/unicorn', b),

  pagination: (b:{url:string;total_records?:number;per_page?:number;id_field?:string;sort_field?:string;sort_dir?:string}) =>
    post<{job_id:string}>('/scan/pagination', b),

  international: (b:{url:string;locales:string[]}) =>
    post<{job_id:string}>('/scan/international', b),

  multiLocation: (b:{
    url:                 string;
    locations:           string[];
    use_proxy?:          boolean;
    proxy_session_type?: 'rotating' | 'sticky';
    proxy_protocol?:     'http' | 'socks5';
  }) =>
    post<{job_id:string}>('/scan/multi-location', b),

  userBaseline: (b:{url:string;modes?:string[]}) =>
    post<{job_id:string}>('/scan/user-baseline', b),

  lighthouse: (b:{url:string;device?:string;categories?:string[];browser_mode?:string}) =>
    post<{job_id:string}>('/scan/lighthouse', b),

  mobile: (b:{platform:string;build_path:string;device?:string;os_version?:string;appium_url?:string;test_type?:string;browser_mode?:string;checks?:string[]}) =>
    post<{job_id:string}>('/scan/mobile', b),

  apiTest: (b:{url:string;method?:string;headers?:Record<string,string>;body?:string;assert_status?:number;assert_contains?:string;checks?:string[]}) =>
    post<{job_id:string}>('/scan/api-test', b),

  siteHealth: (b:{domain:string;checks?:string[]}) =>
    post<{job_id:string}>('/scan/site-health', b),

  saveAIFeatures: (enabled_modules:string[]) =>
    post('/config/ai-features', { enabled_modules }),


  parseTestCases: async (file: File): Promise<{test_cases:any[];count:number;format:string}> => {
    const fd = new FormData(); fd.append('file', file)
    const r  = await fetch(`${BASE}/scan/test-cases/parse`, { method: 'POST', body: fd })
    if (!r.ok) throw new Error(`${r.status} — ${await r.text()}`)
    return r.json()
  },

  runTestCases: (b: {url:string; test_cases:any[]; viewport?:string; login_username?:string; login_password?:string}) =>
    post<{job_id:string}>('/scan/test-cases/run', b),

  provideLogin: (jid: string, username: string, password: string) =>
    post<{ok:boolean}>(`/jobs/${jid}/provide-login`, { username, password }),

  upload: async (file: File): Promise<{path:string;filename:string;size:number}> => {
    const fd = new FormData(); fd.append('file', file)
    const r  = await fetch(`${BASE}/upload`, { method:'POST', body:fd })
    if (!r.ok) throw new Error(`Upload failed: ${r.status}`)
    return r.json()
  },
  dashboardList: () => get<{jobs:any[]}>('/scan/dashboard'),
  dashboardDetail: (jid:string) => get<any>(`/scan/dashboard/${jid}`),
  dashboardReport: (opts:{format?:'html'|'csv'|'both'}) => post<any>('/scan/dashboard/report', opts || {}),

  // ── Proxy management ──────────────────────────────────────────────────────
  /** Get proxy provider status + per-location health from the backend. */
  proxyStatus: () => get<{
    enabled:  boolean;
    provider: string | null;
    health:   Array<{
      locationId: string; successCount: number; failureCount: number;
      successRate: number; consecutiveFailures: number; isHealthy: boolean;
      lastIp: string | null; avgResponseMs: number;
    }>;
  }>('/proxy/status'),

  /** Run a live connectivity test for a location through the proxy. */
  proxyTest: (b:{ location_id: string; session_type?: 'rotating'|'sticky' }) =>
    post<{
      success: boolean; exitIp?: string; responseMs?: number;
      provider?: string; locationId?: string; error?: string;
    }>('/proxy/test', b),

  /** Force a new sticky session for a specific location. */
  proxyRotate: (locationId: string) =>
    post<{ locationId: string; newSessionId: string }>(`/proxy/rotate/${locationId}`, {}),

  getScanHistory: (limit?: number, offset?: number) =>
    get<any[]>(`/scans/history?limit=${limit || 50}&offset=${offset || 0}`),
  getScanDetails: (jid: string) =>
    get<any>(`/scans/${jid}/details`),

  // ── AI Ranking ────────────────────────────────────────────────────────────
  aiRanking: (b: {
    url: string;
    competitor_urls?: string[];
    use_llm?: boolean;
    llm_api_key?: string;
    checks?: string[];
  }) => post<{ job_id: string }>('/scan/ai-ranking', b),

  aiRankingHistory: (limit?: number) =>
    get<{ audits: any[] }>(`/ai-ranking/history${limit ? `?limit=${limit}` : ''}`),

  aiRankingAudit: (auditId: string) =>
    get<any>(`/ai-ranking/audit/${auditId}`),

  // ── SuperLighthouse ───────────────────────────────────────────────────────
  superLighthouse: (b: {
    url: string;
    compare_url?: string;
    devices?: string[];
    categories?: string[];
    modules?: string[];
    browser_mode?: string;
  }) => post<{ job_id: string }>('/scan/super-lighthouse', b),
}
