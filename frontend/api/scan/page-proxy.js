/**
 * Vercel Edge Function — /api/scan/page-proxy?url=<target>
 *
 * Fetches the target webpage and returns it from our own origin so an
 * iframe can embed it without being blocked by X-Frame-Options or
 * frame-ancestors CSP on the target site.
 *
 * Locally, Vite's "/api" proxy sends this path to FastAPI instead.
 * On Vercel (production), this Edge Function handles it.
 */
export const config = { runtime: 'edge' }

export default async function handler(request) {
  const { searchParams } = new URL(request.url)
  const targetUrl = searchParams.get('url')

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 })
  }

  const HEADERS = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  }

  try {
    const response = await fetch(targetUrl, {
      headers: HEADERS,
      redirect: 'follow',
    })

    const finalUrl = response.url
    let html = await response.text()

    // Inject <base href> so relative assets (CSS, JS, images) resolve correctly
    const baseTag = `<base href="${finalUrl}">`
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/(<head[^>]*>)/i, `$1${baseTag}`)
    } else {
      html = `<head>${baseTag}</head>` + html
    }

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Allow all sub-resources so the proxied page renders properly
        'Content-Security-Policy':
          "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;",
      },
    })
  } catch (err) {
    const errorHtml = `<html>
<body style="font-family:sans-serif;padding:24px;background:#0D1117;color:#8B949E;">
  <h2 style="color:#EF4444;">Preview Unavailable</h2>
  <p>Could not load: <code>${targetUrl}</code></p>
  <p style="font-size:12px;color:#555;">${String(err?.message ?? err).slice(0, 120)}</p>
</body>
</html>`
    return new Response(errorHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
}
