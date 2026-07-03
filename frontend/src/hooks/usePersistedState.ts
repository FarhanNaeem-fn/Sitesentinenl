// Persists state in sessionStorage so it survives React unmount/remount during tab navigation.
import { useState, useCallback } from 'react'

function ss_read<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(`ss_${key}`)
    return raw !== null ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function ss_write<T>(key: string, value: T) {
  try { sessionStorage.setItem(`ss_${key}`, JSON.stringify(value)) } catch {}
}

export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setVal] = useState<T>(() => ss_read(key, initial))

  const setValue = useCallback((updater: T | ((prev: T) => T)) => {
    setVal(prev => {
      const next = typeof updater === 'function'
        ? (updater as (p: T) => T)(prev)
        : updater
      ss_write(key, next)
      return next
    })
  }, [key])

  return [value, setValue]
}
