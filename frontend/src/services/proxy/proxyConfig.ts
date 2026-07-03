// src/services/proxy/proxyConfig.ts
// Static configuration: region metadata and default preferences.
// NO credentials live here — those stay in the backend .env.

import type { ProxyPreferences, ProxyProvider, RegionMeta } from './types'

// ── Region catalogue ──────────────────────────────────────────────────────────
// Mirrors the keys in backend/proxy_manager.py  LOCATION_MAP.

export const REGION_META: RegionMeta[] = [
  // ── Middle East (priority targets) ──────────────────────────────────
  { id: 'ae-dubai',      label: 'Dubai',         flag: '🇦🇪', countryCode: 'AE', city: 'Dubai',         continent: 'Middle East'    },
  { id: 'sa-riyadh',     label: 'Riyadh',        flag: '🇸🇦', countryCode: 'SA', city: 'Riyadh',        continent: 'Middle East'    },
  { id: 'sa-jeddah',     label: 'Jeddah',        flag: '🇸🇦', countryCode: 'SA', city: 'Jeddah',        continent: 'Middle East'    },
  { id: 'kw-kuwait',     label: 'Kuwait City',   flag: '🇰🇼', countryCode: 'KW', city: 'Kuwait City',   continent: 'Middle East'    },
  { id: 'om-muscat',     label: 'Muscat',        flag: '🇴🇲', countryCode: 'OM', city: 'Muscat',        continent: 'Middle East'    },
  { id: 'iq-baghdad',    label: 'Baghdad',       flag: '🇮🇶', countryCode: 'IQ', city: 'Baghdad',       continent: 'Middle East'    },
  // ── South Asia ──────────────────────────────────────────────────────
  { id: 'pk-karachi',    label: 'Karachi',       flag: '🇵🇰', countryCode: 'PK', city: 'Karachi',       continent: 'South Asia'     },
  { id: 'in-mumbai',     label: 'Mumbai',        flag: '🇮🇳', countryCode: 'IN', city: 'Mumbai',        continent: 'South Asia'     },
  { id: 'in-bangalore',  label: 'Bangalore',     flag: '🇮🇳', countryCode: 'IN', city: 'Bangalore',     continent: 'South Asia'     },
  // ── Europe ──────────────────────────────────────────────────────────
  { id: 'uk-london',     label: 'London',        flag: '🇬🇧', countryCode: 'GB', city: 'London',        continent: 'Europe'         },
  { id: 'de-frankfurt',  label: 'Frankfurt',     flag: '🇩🇪', countryCode: 'DE', city: 'Frankfurt',     continent: 'Europe'         },
  { id: 'fr-paris',      label: 'Paris',         flag: '🇫🇷', countryCode: 'FR', city: 'Paris',         continent: 'Europe'         },
  { id: 'nl-amsterdam',  label: 'Amsterdam',     flag: '🇳🇱', countryCode: 'NL', city: 'Amsterdam',     continent: 'Europe'         },
  // ── North America ────────────────────────────────────────────────────
  { id: 'us-new-york',   label: 'New York',      flag: '🇺🇸', countryCode: 'US', city: 'New York',      continent: 'North America'  },
  { id: 'us-california', label: 'California',    flag: '🇺🇸', countryCode: 'US', city: 'Los Angeles',   continent: 'North America'  },
  { id: 'ca-toronto',    label: 'Toronto',       flag: '🇨🇦', countryCode: 'CA', city: 'Toronto',       continent: 'North America'  },
  // ── Asia-Pacific ─────────────────────────────────────────────────────
  { id: 'sg-singapore',  label: 'Singapore',     flag: '🇸🇬', countryCode: 'SG', city: 'Singapore',     continent: 'Southeast Asia' },
  { id: 'jp-tokyo',      label: 'Tokyo',         flag: '🇯🇵', countryCode: 'JP', city: 'Tokyo',         continent: 'East Asia'      },
  { id: 'au-sydney',     label: 'Sydney',        flag: '🇦🇺', countryCode: 'AU', city: 'Sydney',        continent: 'Oceania'        },
]

/** Quick lookup: location_id → RegionMeta */
export const REGION_BY_ID = Object.fromEntries(
  REGION_META.map(r => [r.id, r])
) as Record<string, RegionMeta>

/** Unique continent list (preserves insertion order) */
export const CONTINENTS: string[] = [
  ...new Set(REGION_META.map(r => r.continent)),
]

// ── Provider metadata (purely informational — no credentials) ─────────────────

export interface ProviderInfo {
  id:           ProxyProvider
  name:         string
  dashboardUrl: string
  features:     string[]
  /** Recommended for UAE / KSA */
  uaeStrong:    boolean
  ksaStrong:    boolean
}

export const PROVIDER_INFO: ProviderInfo[] = [
  {
    id:           'cloudflare',
    name:         'Cloudflare Worker',
    dashboardUrl: 'https://dash.cloudflare.com',
    features:     ['Free (100k req/day)', 'Reverse proxy', 'CF Smart Placement', 'No city targeting', 'No credentials needed', 'Iframe CSP bypass'],
    uaeStrong:    false,
    ksaStrong:    false,
  },
  {
    id:           'brightdata',
    name:         'Bright Data',
    dashboardUrl: 'https://brightdata.com/cp',
    features:     ['Residential', 'ISP', 'Datacenter', 'SOCKS5', 'City-level', 'Sticky sessions'],
    uaeStrong:    true,
    ksaStrong:    true,
  },
  {
    id:           'oxylabs',
    name:         'Oxylabs',
    dashboardUrl: 'https://dashboard.oxylabs.io',
    features:     ['Residential', 'Datacenter', 'City-level', 'Sticky sessions'],
    uaeStrong:    true,
    ksaStrong:    true,
  },
  {
    id:           'dataimpulse',
    name:         'DataImpulse',
    dashboardUrl: 'https://app.dataimpulse.com',
    features:     ['Residential', 'Pay-per-GB', 'City-level'],
    uaeStrong:    true,
    ksaStrong:    false,
  },
  {
    id:           'iproyal',
    name:         'IPRoyal',
    dashboardUrl: 'https://iproyal.com/dashboard',
    features:     ['Residential', 'Affordable', 'City-level', 'Sticky sessions'],
    uaeStrong:    true,
    ksaStrong:    false,
  },
  {
    id:           'decodo',
    name:         'Decodo (ex-Smartproxy)',
    dashboardUrl: 'https://dashboard.decodo.com',
    features:     ['Residential', 'HTTP + SOCKS5', 'City-level', 'Sticky sessions'],
    uaeStrong:    true,
    ksaStrong:    true,
  },
]

// ── Default preferences ───────────────────────────────────────────────────────
// Values are overridden by VITE_ env vars at runtime (see ProxyManager.ts).

export const DEFAULT_PREFS: ProxyPreferences = {
  enabled:     import.meta.env.VITE_PROXY_ENABLED !== 'false',
  provider:    'none',    // overwritten from backend /proxy/status
  region:      (import.meta.env.VITE_PROXY_DEFAULT_REGION as ProxyPreferences['region']) || 'ae-dubai',
  sessionType: (import.meta.env.VITE_PROXY_DEFAULT_SESSION_TYPE as ProxyPreferences['sessionType']) || 'rotating',
  protocol:    'http',
  maxRetries:  Number(import.meta.env.VITE_PROXY_MAX_RETRIES)   || 3,
  timeoutMs:   Number(import.meta.env.VITE_PROXY_TIMEOUT_MS)    || 25_000,
}
