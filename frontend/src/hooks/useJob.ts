// useJob — thin React adapter over the module-level jobStore singleton.
// The store keeps SSE connections alive across navigation; this hook just
// subscribes to state for whichever tab is currently mounted.
import { useState, useEffect, useCallback, useRef } from 'react'
import * as store from './jobStore'
import type { LogEntry } from '../api/client'

export type { JobState } from './jobStore'

// Unique counter for anonymous jobs — incremented only once per hook instance
let _anonSeq = 0

export function useJob(persistKey?: string) {
  // Stabilise the key across re-renders (useRef evaluated only on first mount)
  const keyRef = useRef<string | undefined>(undefined)
  if (keyRef.current === undefined) {
    keyRef.current = persistKey ?? `__anon_${++_anonSeq}__`
  }
  const key = keyRef.current

  const [state, setLocalState] = useState<store.JobState>(() => store.getState(key))

  useEffect(() => {
    // Re-read the global store — state may have changed while we were away
    setLocalState(store.getState(key))
    // Subscribe: future store updates will flow to local React state
    return store.subscribe(key, setLocalState)
  }, [key])

  const startJobFn = useCallback((jobId: string) => {
    store.startJob(key, jobId)
  }, [key])

  const finishJobFn = useCallback((result: any, logs: LogEntry[] = []) => {
    store.finishJob(key, result, logs)
  }, [key])

  const cancel = useCallback(async () => {
    await store.cancelJob(key)
  }, [key])

  const reset = useCallback(() => {
    store.resetJob(key)
  }, [key])

  return { state, startJob: startJobFn, finishJob: finishJobFn, cancel, reset }
}
