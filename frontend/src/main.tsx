import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// A browser refresh should start the app clean — stale scan URLs, selected
// checks, and job state from a previous session shouldn't reappear. In-app
// navigation between tabs (no reload) still keeps state, since that's held
// in module-level memory (jobStore, ProxyManager) independent of storage.
try {
  const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  const isReload = navEntry
    ? navEntry.type === 'reload'
    : (performance as any).navigation?.type === 1   // legacy fallback
  if (isReload) {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith('ss_'))
      .forEach(k => sessionStorage.removeItem(k))
  }
} catch { /* ignore in environments where Performance API is unavailable */ }

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
