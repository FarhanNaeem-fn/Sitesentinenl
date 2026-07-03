// Module-level singleton — survives React navigation (component mount/unmount).
// SSE connections are kept alive here regardless of which tab is active.
import { streamJob, cancelJob as apiCancelJob, type LogEntry } from '../api/client'

export interface JobState {
  jobId:    string | null
  status:   'idle' | 'running' | 'done' | 'error' | 'cancelled'
  logs:     LogEntry[]
  result:   any
  partial:  any
  progress: number
  error:    string | null
}

const IDLE: JobState = {
  jobId: null, status: 'idle', logs: [], result: null,
  partial: null, progress: 0, error: null,
}

type Listener = (state: JobState) => void

// These maps live for the entire browser session — navigation doesn't touch them
const _states    = new Map<string, JobState>()
const _stops     = new Map<string, () => void>()
const _listeners = new Map<string, Set<Listener>>()

// ── sessionStorage helpers ───────────────────────────────────────────────────
function ss_read(key: string): JobState | null {
  try {
    const raw = sessionStorage.getItem(`ss_job_${key}`)
    if (!raw) return null
    const s = JSON.parse(raw) as JobState
    return (s.status === 'done' || s.status === 'error') ? s : null
  } catch { return null }
}
function ss_write(key: string, s: JobState) {
  try { sessionStorage.setItem(`ss_job_${key}`, JSON.stringify(s)) } catch {}
}
function ss_clear(key: string) {
  try { sessionStorage.removeItem(`ss_job_${key}`) } catch {}
}

// ── Internal helpers ─────────────────────────────────────────────────────────
function _get(key: string): JobState {
  if (_states.has(key)) return _states.get(key)!
  const ss = ss_read(key)
  if (ss) { _states.set(key, ss); return ss }
  return IDLE
}

function _set(key: string, updater: JobState | ((prev: JobState) => JobState)) {
  const prev = _states.get(key) ?? IDLE
  const next = typeof updater === 'function' ? updater(prev) : updater
  _states.set(key, next)
  if (next.status === 'done' || next.status === 'error') ss_write(key, next)
  _listeners.get(key)?.forEach(fn => fn(next))
}

// ── Public API ───────────────────────────────────────────────────────────────
export function getState(key: string): JobState {
  return _get(key)
}

export function subscribe(key: string, fn: Listener): () => void {
  if (!_listeners.has(key)) _listeners.set(key, new Set())
  _listeners.get(key)!.add(fn)
  return () => _listeners.get(key)?.delete(fn)
}

export function startJob(key: string, jobId: string) {
  _stops.get(key)?.()
  _stops.delete(key)
  ss_clear(key)

  const initial: JobState = {
    jobId, status: 'running', logs: [], result: null,
    partial: null, progress: 0, error: null,
  }
  _states.set(key, initial)
  _listeners.get(key)?.forEach(fn => fn(initial))

  const stop = streamJob(
    jobId,
    (entry)  => _set(key, s => ({ ...s, logs: [...s.logs, entry], progress: Math.min(s.progress + 0.4, 94) })),
    (data)   => _set(key, s => ({ ...s, partial: data })),
    (result) => _set(key, s => ({ ...s, status: 'done',  result,         progress: 100 })),
    (err)    => _set(key, s => ({ ...s, status: 'error', error: err })),
  )
  _stops.set(key, stop)
}

export function finishJob(key: string, result: any, logs: LogEntry[] = []) {
  _stops.get(key)?.()
  _stops.delete(key)
  _set(key, { ...IDLE, status: 'done', result, logs, progress: 100 })
}

export async function cancelJob(key: string) {
  _stops.get(key)?.()
  _stops.delete(key)
  const jobId = _states.get(key)?.jobId
  if (jobId) await apiCancelJob(jobId).catch(() => {})
  ss_clear(key)
  _set(key, { ...IDLE, status: 'cancelled' })
}

export function resetJob(key: string) {
  _stops.get(key)?.()
  _stops.delete(key)
  ss_clear(key)
  _states.delete(key)
  _listeners.get(key)?.forEach(fn => fn(IDLE))
}
