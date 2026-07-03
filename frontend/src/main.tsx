import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// On a hard browser refresh (F5 / Ctrl-R) wipe all scan state from sessionStorage.
// This resets input fields, logs, and completed job results so the UI starts clean.
// Server-side reports (JSON/HTML/XLSX files) are stored on disk and are never touched.
try {
  const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  const isReload = navEntry
    ? navEntry.type === 'reload'
    : (performance as any).navigation?.type === 1   // legacy fallback
  if (isReload) {
    Object.keys(sessionStorage).forEach(k => {
      if (k.startsWith('ss_')) sessionStorage.removeItem(k)
    })
  }
} catch { /* ignore in environments where Performance API is unavailable */ }

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
