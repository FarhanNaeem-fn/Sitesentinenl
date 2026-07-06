// src/components/Layout.tsx — BugEater exact layout
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const NAV = [
  { to: '/',           icon: '◈', label: 'QA Scan',       sub: '820+ checks' },
  { to: '/load',       icon: '⚡', label: 'Load Testing',  sub: 'Stress · Spike' },
  { to: '/unicorn',    icon: '🦄', label: 'Unicorn Suite', sub: 'Login · Browse · Checkout' },
  { to: '/pagination', icon: '⊞', label: 'Pagination',    sub: 'API data integrity' },
  { to: '/intl',       icon: '⊕', label: 'International', sub: '16 locales · RTL / LTR' },
  { to: '/ai',         icon: '◎', label: 'AI Features',   sub: '15 AI testing modules' },
  { to: '/baseline',   icon: '◉', label: 'User Baseline', sub: '30 user + 10 AI checks' },
  { to: '/automation', icon: '⚙', label: 'Automation',    sub: 'CI/CD · Scheduler · API' },
  { to: '/lighthouse', icon: '◆', label: 'SuperLighthouse',sub: '7-module deep audit' },
  { to: '/ai-ranking', icon: '◈', label: 'AI Ranking',    sub: 'AI Visibility Auditor' },
  { to: '/mobile',     icon: '▣', label: 'Mobile Testing',sub: 'APK · IPA · Appium' },
  { to: '/test-runner', icon: '📋', label: 'Test Runner',   sub: 'PDF · Excel test cases' },
  { to: '/reports',    icon: '≡', label: 'Reports',       sub: 'Saved scan history' },
  { to: '/history',    icon: '⊘', label: 'Scan History',   sub: 'Supabase Database' },
]

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg">

      {/* ═══ TOP BAR ════════════════════════════════════════════ */}
      <header className="relative flex items-center gap-2 sm:gap-4 px-3 sm:px-5 h-14 flex-shrink-0 bg-card border-b border-bdr z-20">
        {/* Gold shimmer top stripe */}
        <div className="absolute top-0 left-0 right-0 h-[2px] gold-shimmer" />

        {/* Hamburger — mobile only */}
        <button
          onClick={() => setMobileOpen(o => !o)}
          className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 bg-raised border border-bdrhi"
          style={{ color: '#F0F0F0', cursor: 'pointer' }}
          aria-label="Toggle navigation menu">
          <span style={{ fontSize: 15, lineHeight: 1 }}>{mobileOpen ? '✕' : '☰'}</span>
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-display font-800 text-[13px] text-bg flex-shrink-0"
               style={{ background: 'linear-gradient(135deg,#F5A623,#C8831A)', boxShadow: '0 0 14px rgba(245,166,35,0.3)' }}>
            SS
          </div>
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-display font-800 text-[14px] sm:text-[15px] text-tx tracking-tight truncate">SiteSentinel</span>
            <span className="hidden sm:inline font-body text-[12px] text-tx-m">Matrix Pro</span>
          </div>
        </div>

        {/* Version badge */}
        <span className="hidden xs:inline-flex font-display font-700 text-[10px] px-2.5 py-0.5 rounded-full flex-shrink-0"
              style={{ background: 'rgba(245,166,35,0.1)', color: '#F5A623', border: '1px solid rgba(245,166,35,0.25)' }}>
          v3.2
        </span>

        {/* Stat chips */}
        <div className="hidden lg:flex gap-2">
          {[
            ['9 Modules',   'rgba(245,166,35,0.1)',  '#F5A623',  'rgba(245,166,35,0.25)'],
            ['820+ Checks', 'rgba(59,130,246,0.1)',  '#3B82F6',  'rgba(59,130,246,0.25)'],
            ['4 Viewports', 'rgba(168,85,247,0.1)', '#A855F7',  'rgba(168,85,247,0.25)'],
          ].map(([t, bg, fg, bd]) => (
            <span key={t} className="font-display font-700 text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: bg, color: fg, border: `1px solid ${bd}` }}>
              {t}
            </span>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Status */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-2 h-2 rounded-full pulse" style={{ background: '#22C55E', boxShadow: '0 0 8px rgba(34,197,94,0.5)' }} />
          <span className="hidden sm:inline font-display font-700 text-[12px]" style={{ color: '#22C55E' }}>Ready</span>
        </div>
      </header>

      {/* ═══ BODY ═══════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* ─── MOBILE BACKDROP ─────────────────────────────── */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 md:hidden"
            style={{ background: 'rgba(0,0,0,0.6)', top: 56 }}
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* ─── SIDEBAR ──────────────────────────────────────── */}
        <aside
          className={`
            flex flex-col flex-shrink-0 bg-card border-r border-bdr overflow-hidden transition-all duration-200
            fixed md:relative left-0 z-40 md:z-auto w-64
            ${collapsed ? 'md:w-[52px]' : 'md:w-56'}
            ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          `}
          style={{ top: 56, bottom: 0 }}>

          {/* Collapse toggle — desktop only */}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="hidden md:flex absolute top-3 -right-3 z-10 w-6 h-6 rounded-full items-center justify-center font-body text-[10px] bg-raised border border-bdrhi"
            style={{ color: '#555', cursor: 'pointer' }}>
            {collapsed ? '›' : '‹'}
          </button>

          {/* Project label */}
          {!collapsed && (
            <div className="flex items-center gap-2 px-4 py-3 border-b border-bdr flex-shrink-0">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#F5A623', boxShadow: '0 0 6px rgba(245,166,35,0.5)' }} />
              <span className="font-display font-700 text-[12px] text-tx">SiteSentinel Pro</span>
            </div>
          )}

          {/* Nav section label */}
          {!collapsed && (
            <p className="font-display font-700 text-[9px] uppercase tracking-[0.1em] px-4 pt-3 pb-1 flex-shrink-0" style={{ color: '#3A3A3A' }}>
              Testing Modules
            </p>
          )}

          {/* Nav links */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden py-1">
            {NAV.map(item => (
              <NavLink
                key={item.to} to={item.to} end={item.to === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `relative flex items-center gap-2.5 transition-colors cursor-pointer ${isActive ? 'nav-active' : ''}`
                }
                style={({ isActive }) => ({
                  padding: collapsed ? '10px 14px' : '10px 16px',
                  background: isActive ? 'rgba(245,166,35,0.07)' : 'transparent',
                  textDecoration: 'none',
                })}>
                {({ isActive }) => (
                  <>
                    <span className="text-[15px] flex-shrink-0 w-5 text-center transition-colors"
                          style={{ color: isActive ? '#F5A623' : '#3A3A3A', fontFamily: 'monospace' }}>
                      {item.icon}
                    </span>
                    {!collapsed && (
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-[12px] transition-colors"
                           style={{ color: isActive ? '#F0F0F0' : '#888', fontWeight: isActive ? 600 : 400 }}>
                          {item.label}
                        </p>
                        <p className="font-body text-[10px] truncate" style={{ color: '#3A3A3A' }}>{item.sub}</p>
                      </div>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Footer */}
          {!collapsed && (
            <div className="border-t border-bdr px-4 py-3 flex-shrink-0">
              <p className="font-mono text-[9px] text-center" style={{ color: '#2A2A2A' }}>
                SiteSentinel Matrix Pro v3.2
              </p>
            </div>
          )}
        </aside>

        {/* ─── MAIN ────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 px-3 sm:px-5 py-2 border-b border-bdr bg-card flex-shrink-0 overflow-x-auto">
            <span className="font-display font-600 text-[11px] flex-shrink-0" style={{ color: '#F5A623' }}>SiteSentinel</span>
            <span className="font-body text-[11px] flex-shrink-0" style={{ color: '#2A2A2A' }}>›</span>
            <span className="font-body font-500 text-[11px] flex-shrink-0" style={{ color: '#555' }}>QA Workspace</span>
          </div>
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>

      {/* ═══ STATUS BAR ═════════════════════════════════════════ */}
      <footer className="flex items-center px-3 sm:px-5 py-1.5 bg-card border-t border-bdr flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#22C55E', boxShadow: '0 0 6px rgba(34,197,94,0.4)' }} />
          <span className="font-body text-[11px] truncate" style={{ color: '#555' }}>
            <span className="hidden sm:inline">Ready — enter a URL and run a scan</span>
            <span className="sm:hidden">Ready</span>
          </span>
        </div>
        <div className="ml-auto flex-shrink-0">
          <span className="font-display font-700 text-[9px] px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(245,166,35,0.08)', color: '#F5A623', border: '1px solid rgba(245,166,35,0.15)' }}>
            v3.2
          </span>
        </div>
      </footer>
    </div>
  )
}
