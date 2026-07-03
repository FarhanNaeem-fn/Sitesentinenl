// Persists state in sessionStorage so it survives React unmount/remount during tab navigation.
import { useState, useCallback, useEffect, useRef } from 'react'

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

// Restores window scroll position on mount and keeps it updated in sessionStorage
// as the user scrolls, so returning to a scan page (via SPA nav) lands back
// where the user left off instead of snapping to the top.
export function useScrollRestore(key: string) {
  const restored = useRef(false)

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    const y = ss_read<number>(`scroll_${key}`, 0)
    if (y > 0) {
      // Wait a frame so persisted content has already painted (result cards,
      // live preview, etc.) — restoring against the empty/initial layout
      // would land at the wrong offset once content grows in.
      requestAnimationFrame(() => window.scrollTo(0, y))
    }
  }, [key])

  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => ss_write(`scroll_${key}`, window.scrollY))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [key])
}
