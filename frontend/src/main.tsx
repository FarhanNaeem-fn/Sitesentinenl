import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Preserve scan state and UI persistence across refreshes.
// sessionStorage-backed scan results, selected tabs, and live preview state
// now survive browser reloads so returning to a scan page restores the UI.
try {
  const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  const isReload = navEntry
    ? navEntry.type === 'reload'
    : (performance as any).navigation?.type === 1   // legacy fallback
  if (isReload) {
    // Keep sessionStorage state intact so scans and preview state persist.
  }
} catch { /* ignore in environments where Performance API is unavailable */ }

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
