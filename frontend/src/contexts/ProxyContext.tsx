// src/contexts/ProxyContext.tsx
// React context that makes proxy state available to the entire component tree
// without prop-drilling.
//
// Wrap your app (or a subtree) with <ProxyProvider> once:
//
//   <ProxyProvider>
//     <App />
//   </ProxyProvider>
//
// Then consume in any child:
//   const proxy = useProxyContext()

import React, {
  createContext,
  useContext,
  type ReactNode,
} from 'react'
import { useProxy }       from '../hooks/useProxy'
import type { UseProxyReturn } from '../services/proxy/types'

// ── Context ───────────────────────────────────────────────────────────────────

const ProxyContext = createContext<UseProxyReturn | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────────

interface ProxyProviderProps {
  children: ReactNode
}

export function ProxyProvider({ children }: ProxyProviderProps) {
  const proxyState = useProxy()
  return (
    <ProxyContext.Provider value={proxyState}>
      {children}
    </ProxyContext.Provider>
  )
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

export function useProxyContext(): UseProxyReturn {
  const ctx = useContext(ProxyContext)
  if (!ctx) {
    throw new Error('useProxyContext must be used inside <ProxyProvider>')
  }
  return ctx
}
