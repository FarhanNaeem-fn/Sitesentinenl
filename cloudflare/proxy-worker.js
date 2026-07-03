/**
 * SiteSentinel Proxy Worker
 * =========================
 * Production-grade Cloudflare Worker that acts as a reverse proxy.
 *
 * How it works (reverse proxy, NOT forward proxy):
 *   Backend → GET https://your-worker.workers.dev/?url=https://target.com
 *   Worker  → Fetches https://target.com from Cloudflare's edge
 *   Worker  → Returns response body + CF geographic metadata headers
 *
 * Why this is useful vs. forward HTTP proxy:
 *   • Free (100k req/day on CF Workers free tier)
 *   • No credentials to manage
 *   • Cloudflare has PoPs in Dubai (DXB), Riyadh (RUH), London (LHR), etc.
 *   • Returns X-CF-Colo so you know WHICH datacenter handled the request
 *   • Strips X-Frame-Options / CSP for the live-preview iframe
 *
 * Limitation vs. residential proxies:
 *   Smart Placement routes to the PoP nearest the TARGET site, not a
 *   user-specified city. For reliable "test from Dubai" use a residential
 *   proxy. The CF Worker is best for: page preview, accessibility checks,
 *   and cost-free fallback testing.
 *
 * Deploy:
 *   npm install -g wrangler
 *   wrangler secret put PROXY_SECRET    ← set a random string
 *   wrangler deploy
 *
 * Set in backend .env:
 *   CF_WORKER_URL=https://sitesentinel-proxy.<your-subdomain>.workers.dev
 *   CF_WORKER_SECRET=<same value as wrangler secret>
 */

// ── Cloudflare colo → city/country mapping ────────────────────────────────────
// IATA codes for Cloudflare datacenters relevant to SiteSentinel's target regions.
const CF_COLO_MAP = {
  // Middle East
  DXB: { city: 'Dubai',      country: 'AE', region: 'Middle East'   },
  AUH: { city: 'Abu Dhabi',  country: 'AE', region: 'Middle East'   },
  RUH: { city: 'Riyadh',     country: 'SA', region: 'Middle East'   },
  JED: { city: 'Jeddah',     country: 'SA', region: 'Middle East'   },
  KWI: { city: 'Kuwait City',country: 'KW', region: 'Middle East'   },
  MCT: { city: 'Muscat',     country: 'OM', region: 'Middle East'   },
  BAH: { city: 'Bahrain',    country: 'BH', region: 'Middle East'   },
  AMM: { city: 'Amman',      country: 'JO', region: 'Middle East'   },
  // South Asia
  KHI: { city: 'Karachi',    country: 'PK', region: 'South Asia'    },
  LHE: { city: 'Lahore',     country: 'PK', region: 'South Asia'    },
  BOM: { city: 'Mumbai',     country: 'IN', region: 'South Asia'    },
  BLR: { city: 'Bangalore',  country: 'IN', region: 'South Asia'    },
  // Europe
  LHR: { city: 'London',     country: 'GB', region: 'Europe'        },
  FRA: { city: 'Frankfurt',  country: 'DE', region: 'Europe'        },
  CDG: { city: 'Paris',      country: 'FR', region: 'Europe'        },
  AMS: { city: 'Amsterdam',  country: 'NL', region: 'Europe'        },
  // North America
  EWR: { city: 'New York',   country: 'US', region: 'North America' },
  LAX: { city: 'Los Angeles',country: 'US', region: 'North America' },
  // Asia-Pacific
  SIN: { city: 'Singapore',  country: 'SG', region: 'Southeast Asia'},
  NRT: { city: 'Tokyo',      country: 'JP', region: 'East Asia'     },
  SYD: { city: 'Sydney',     country: 'AU', region: 'Oceania'       },
}

// ── Private/internal IP ranges — block to prevent SSRF attacks ────────────────
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0/,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,          // Link-local
  /^::1$/,                // IPv6 loopback
  /^fc00:/i,              // IPv6 ULA
  /^fe80:/i,              // IPv6 link-local
  /\.internal$/i,
  /\.local$/i,
]

// Headers that are safe to forward from the incoming request to the target
const SAFE_FORWARD_HEADERS = new Set([
  'accept',
  'accept-language',
  'accept-encoding',
  'user-agent',
  'content-type',
  'cache-control',
])

// Headers to strip from the proxied response (frame-blocking, CSP, etc.)
const STRIP_RESPONSE_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'x-content-type-options',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
])

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    // OPTIONS pre-flight
    if (request.method === 'OPTIONS') {
      return corsPreflightResponse()
    }

    try {
      return await handleRequest(request, env)
    } catch (err) {
      return jsonError(502, 'Worker error', err.message)
    }
  },
}

async function handleRequest(request, env) {
  const url = new URL(request.url)

  // ── 1. Authenticate ────────────────────────────────────────────────────────
  const secret = (
    url.searchParams.get('secret') ||
    request.headers.get('X-Proxy-Secret') ||
    ''
  )
  if (env.PROXY_SECRET && secret !== env.PROXY_SECRET) {
    return jsonError(401, 'Unauthorized', 'Missing or invalid X-Proxy-Secret')
  }

  // ── 2. Resolve target URL ──────────────────────────────────────────────────
  const rawTarget = url.searchParams.get('url')
  if (!rawTarget) {
    return jsonError(400, 'Bad Request', 'Missing required ?url= query parameter')
  }

  let targetUrl
  try {
    targetUrl = new URL(rawTarget)
  } catch {
    return jsonError(400, 'Bad Request', `Invalid URL: ${rawTarget}`)
  }

  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    return jsonError(400, 'Bad Request', `Unsupported protocol: ${targetUrl.protocol}`)
  }

  // ── 3. SSRF protection — block private / internal hosts ───────────────────
  if (BLOCKED_HOST_PATTERNS.some(p => p.test(targetUrl.hostname))) {
    return jsonError(403, 'Forbidden', `Blocked host: ${targetUrl.hostname}`)
  }

  // ── 4. Build forwarded headers (safe subset only) ─────────────────────────
  const forwardHeaders = new Headers()
  for (const [key, value] of request.headers.entries()) {
    if (SAFE_FORWARD_HEADERS.has(key.toLowerCase())) {
      forwardHeaders.set(key, value)
    }
  }
  // Override UA so target sees a real browser string
  if (!forwardHeaders.has('user-agent')) {
    forwardHeaders.set(
      'user-agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    )
  }

  // ── 5. Fetch from Cloudflare edge ─────────────────────────────────────────
  const method = ['GET', 'HEAD'].includes(request.method) ? request.method : 'GET'

  let originResponse
  const t0 = Date.now()
  try {
    originResponse = await fetch(targetUrl.toString(), {
      method,
      headers: forwardHeaders,
      redirect: 'follow',
      cf: {
        // Disable CF caching so audit results are always fresh
        cacheTtl: 0,
        cacheEverything: false,
        // Scrape Shield bypass — we ARE the legitimate client
        scrapeShield: false,
      },
    })
  } catch (err) {
    return jsonError(502, 'Upstream fetch failed', err.message)
  }
  const responseMs = Date.now() - t0

  // ── 6. Resolve CF datacenter metadata ─────────────────────────────────────
  const colo     = request.cf?.colo         ?? ''
  const cfCity   = request.cf?.city         ?? CF_COLO_MAP[colo]?.city    ?? ''
  const cfCountry= request.cf?.country      ?? CF_COLO_MAP[colo]?.country ?? ''
  const cfRegion = request.cf?.region       ?? CF_COLO_MAP[colo]?.region  ?? ''
  const cfLat    = String(request.cf?.latitude  ?? '')
  const cfLon    = String(request.cf?.longitude ?? '')

  // ── 7. Build response headers ──────────────────────────────────────────────
  const responseHeaders = new Headers()

  // Copy origin headers — except the ones we strip
  for (const [key, value] of originResponse.headers.entries()) {
    if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value)
    }
  }

  // CORS — allow SiteSentinel frontend on any origin
  responseHeaders.set('Access-Control-Allow-Origin', '*')
  responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  responseHeaders.set('Access-Control-Allow-Headers', 'X-Proxy-Secret, Content-Type')
  responseHeaders.set('Access-Control-Expose-Headers', [
    'X-CF-Colo', 'X-CF-Country', 'X-CF-City', 'X-CF-Region',
    'X-CF-Lat', 'X-CF-Lon', 'X-Proxy-Response-Ms',
    'X-Proxy-Exit-Ip', 'X-Proxy-Final-Url',
  ].join(', '))

  // Geographic metadata — SiteSentinel backend reads these
  responseHeaders.set('X-CF-Colo',          colo)
  responseHeaders.set('X-CF-Country',        cfCountry)
  responseHeaders.set('X-CF-City',           cfCity)
  responseHeaders.set('X-CF-Region',         cfRegion)
  responseHeaders.set('X-CF-Lat',            cfLat)
  responseHeaders.set('X-CF-Lon',            cfLon)
  responseHeaders.set('X-Proxy-Response-Ms', String(responseMs))
  responseHeaders.set('X-Proxy-Final-Url',   targetUrl.toString())

  // The IP of the CF edge node (as seen by the origin server)
  // CF doesn't expose its own egress IPs, but we can report the PoP
  responseHeaders.set('X-Proxy-Exit-Ip', `cf-${colo.toLowerCase()}.cloudflare.com`)

  // Iframe embedding — allow from any origin (used by SiteSentinel preview)
  responseHeaders.set(
    'Content-Security-Policy',
    "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
  )

  return new Response(originResponse.body, {
    status: originResponse.status,
    headers: responseHeaders,
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function corsPreflightResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Proxy-Secret, Content-Type',
      'Access-Control-Max-Age':       '86400',
    },
  })
}

function jsonError(status, error, message) {
  return new Response(
    JSON.stringify({ error, message, status }),
    {
      status,
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  )
}
