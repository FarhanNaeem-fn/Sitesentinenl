"""
SiteSentinel — all FastAPI route handlers.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from config import BROWSER_WS, REPORTS_DIR, UPLOADS_DIR, log, AI_RANKING_DIR
from job_manager import jobs, new_job, _safe_get_job_summary, _generate_all_scans_csv, _generate_all_scans_html
from models import (
    QAScanRequest, LoadTestRequest, UnicornRequest, PaginationRequest, IntlRequest,
    UserBaselineRequest, LighthouseRequest, MobileTestRequest, APITestRequest,
    MultiLocationRequest, TestCasesRunRequest, LoginCredentialsRequest,
    SiteHealthRequest, AIFeaturesConfig, AIAnalysisRequest, AIRankingRequest, SuperLighthouseRequest,
)
from proxy_manager import proxy_manager
from supabase_client import db

from qa_scanner import _run_qa_scan
from load_tester import _run_load_test, _run_unicorn, _run_pagination, _run_intl
from baseline_scanner import _run_user_baseline
from lighthouse_scanner import _run_lighthouse
from mobile_scanner import _run_mobile
from api_tester import _run_api_test
from multi_location_scanner import _run_multi_location
from site_health_scanner import _run_site_health
from test_cases_runner import _parse_test_cases_from_excel, _parse_test_cases_from_pdf, _run_test_cases
from ai_ranking_scanner import _run_ai_ranking
from super_lighthouse_scanner import _run_super_lighthouse

router = APIRouter()

# AI crawler list (used by ai-ranking report routes)
AI_CRAWLERS = [
    {"name": "GPTBot",           "ua": "GPTBot",           "owner": "OpenAI",      "desc": "ChatGPT training & browsing"},
    {"name": "ClaudeBot",        "ua": "ClaudeBot",        "owner": "Anthropic",   "desc": "Claude AI training"},
    {"name": "PerplexityBot",    "ua": "PerplexityBot",    "owner": "Perplexity",  "desc": "Perplexity AI search"},
    {"name": "Google-Extended",  "ua": "Google-Extended",  "owner": "Google",      "desc": "Gemini / Bard training"},
    {"name": "CCBot",            "ua": "CCBot",            "owner": "CommonCrawl", "desc": "Common Crawl dataset"},
    {"name": "Bytespider",       "ua": "Bytespider",       "owner": "ByteDance",   "desc": "TikTok / Doubao AI"},
    {"name": "FacebookBot",      "ua": "FacebookBot",      "owner": "Meta",        "desc": "Meta AI training"},
    {"name": "Applebot",         "ua": "Applebot",         "owner": "Apple",       "desc": "Apple AI / Siri"},
    {"name": "cohere-ai",        "ua": "cohere-ai",        "owner": "Cohere",      "desc": "Cohere AI training"},
    {"name": "AI2Bot",           "ua": "AI2Bot",           "owner": "Allen AI",    "desc": "AI2 / Dolma dataset"},
    {"name": "anthropic-ai",     "ua": "anthropic-ai",     "owner": "Anthropic",   "desc": "Anthropic research crawl"},
    {"name": "omgili",           "ua": "omgili",           "owner": "Webz.io",     "desc": "AI training data"},
    {"name": "Googlebot",        "ua": "Googlebot",        "owner": "Google",      "desc": "Google Search (SEO reference)"},
]


# ── Root & health ──────────────────────────────────────────────────────────────

@router.get("/")
def root():
    return {"name":"SiteSentinel Matrix Pro API","version":"3.1.0","modules":9}

@router.get("/health")
def health_check():
    return {"status":"ok","timestamp":datetime.now().isoformat()}


# ── Proxy endpoints ────────────────────────────────────────────────────────────

@router.get("/proxy/status")
def proxy_status():
    """Return proxy configuration status (no credentials)."""
    return {
        "enabled":  proxy_manager.enabled,
        "provider": proxy_manager.provider or None,
        "health":   proxy_manager.get_health(),
    }

@router.post("/proxy/rotate/{location_id}")
def proxy_rotate(location_id: str):
    """Force a new sticky session for a location."""
    new_sid = proxy_manager.rotate_session(location_id)
    return {"location_id": location_id, "new_session_id": new_sid}

@router.post("/proxy/test")
async def proxy_test(body: dict):
    """
    Quick connectivity test for the configured proxy.
    Body: { "location_id": "ae-dubai", "session_type": "rotating" }

    For CF Worker:   hits httpbin.org/ip through the worker, returns CF colo metadata.
    For residential: hits httpbin.org/ip through the exit node, returns exit IP.
    """
    import aiohttp, ssl as _ssl
    location_id  = body.get("location_id", "ae-dubai")
    session_type = body.get("session_type", "rotating")
    test_url     = "https://httpbin.org/ip"

    if not proxy_manager.enabled:
        return {"success": False, "error": "No proxy provider configured"}

    ssl_ctx = _ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode    = _ssl.CERT_NONE

    t0 = time.time()
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20)) as session:

            # ── Cloudflare Worker ──────────────────────────────────────────────
            if proxy_manager.is_cloudflare:
                resp, cf_meta = await proxy_manager.cf_fetch(session, test_url, ssl_ctx=ssl_ctx)
                data    = await resp.json(content_type=None)
                ms      = round((time.time() - t0) * 1000)
                exit_ip = data.get("origin", cf_meta.get("exit_ip", "unknown"))
                proxy_manager.mark_success(location_id, response_ms=float(ms), exit_ip=exit_ip)
                return {
                    "success":     True,
                    "exit_ip":     exit_ip,
                    "response_ms": ms,
                    "provider":    "cloudflare",
                    "location_id": location_id,
                    "cf_colo":     cf_meta.get("colo", ""),
                    "cf_city":     cf_meta.get("city", ""),
                    "cf_country":  cf_meta.get("country", ""),
                    "cf_region":   cf_meta.get("region", ""),
                    "note": (
                        f"Request handled by Cloudflare PoP: "
                        f"{cf_meta.get('city') or cf_meta.get('colo', '?')} "
                        f"({cf_meta.get('country', '?')})"
                    ),
                }

            # ── Residential forward proxy ──────────────────────────────────────
            proxy_kwargs = proxy_manager.aiohttp_kwargs(location_id, session_type=session_type)
            if not proxy_kwargs:
                return {"success": False, "error": f"Could not build proxy URL for '{location_id}'"}
            async with session.get(test_url, ssl=ssl_ctx, **proxy_kwargs) as resp:
                data    = await resp.json()
                ms      = round((time.time() - t0) * 1000)
                exit_ip = data.get("origin", "unknown")
                proxy_manager.mark_success(location_id, response_ms=float(ms), exit_ip=exit_ip)
                return {
                    "success":     True,
                    "exit_ip":     exit_ip,
                    "response_ms": ms,
                    "provider":    proxy_manager.provider,
                    "location_id": location_id,
                }

    except Exception as e:
        proxy_manager.mark_failure(location_id, str(e))
        return {"success": False, "error": str(e)[:120]}


# ── Jobs ───────────────────────────────────────────────────────────────────────

@router.get("/jobs/{jid}")
def get_job(jid:str):
    j=jobs.get(jid)
    if not j: raise HTTPException(404,"Job not found")
    return j

@router.get("/jobs/{jid}/logs")
def get_logs(jid:str,since:int=0):
    j=jobs.get(jid)
    if not j: raise HTTPException(404,"Job not found")
    return {"logs":j["logs"][since:],"total":len(j["logs"]),
            "status":j["status"],"progress":j["progress"],
            "partial":j.get("partial")}

@router.delete("/jobs/{jid}")
def cancel_job(jid:str):
    if jid in jobs: jobs[jid]["cancel"]=True; jobs[jid]["status"]="cancelled"
    return {"ok":True}

@router.post("/jobs/{jid}/provide-login")
async def provide_login(jid: str, creds: LoginCredentialsRequest):
    if jid not in jobs:
        raise HTTPException(404, "Job not found")
    jobs[jid]["login_credentials"] = {"username": creds.username, "password": creds.password}
    return {"ok": True}

@router.get("/jobs/{jid}/stream")
async def stream(jid:str):
    async def gen() -> AsyncGenerator[str,None]:
        sent=0
        while True:
            j=jobs.get(jid)
            if not j: yield f"data:{json.dumps({'error':'not found'})}\n\n"; break
            for e in j["logs"][sent:]: yield f"data:{json.dumps(e)}\n\n"
            sent=len(j["logs"])
            # Also emit partial metrics if available
            if j.get("partial"):
                yield f"data:{json.dumps({'event':'partial','data':j['partial']})}\n\n"
            if j["status"] in ("done","error","cancelled"):
                yield f"data:{json.dumps({'event':'done','status':j['status'],'result':j.get('result'),'progress':100})}\n\n"
                break
            await asyncio.sleep(.3)
    return StreamingResponse(gen(),media_type="text/event-stream",
                             headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})


# ── History Retrieval ──────────────────────────────────────────────────────────

@router.get("/scans/history")
async def get_scan_history(limit: int = 50, offset: int = 0):
    return db.get_scan_history(limit, offset)

@router.get("/scans/{jid}/details")
async def get_scan_details(jid: str):
    # Try to get from in-memory first if it's currently running
    if jid in jobs:
        return jobs[jid]

    # Fallback to DB
    scan = db.get_scan(jid)
    if not scan:
        raise HTTPException(404, "Scan not found")

    # Get logs and reports from DB
    logs = db.get_logs(jid)
    reports = db.get_reports(jid)

    return {
        "id": scan["id"],
        "kind": scan["type"],
        "status": scan["status"],
        "progress": scan["progress"],
        "result": scan["result"],
        "created": scan["created_at"],
        "url": scan["url"],
        "logs": logs,
        "reports": reports
    }


# ── Scan endpoints ─────────────────────────────────────────────────────────────

@router.post("/scan/qa")
async def scan_qa(req: QAScanRequest, bg: BackgroundTasks):
    jid = new_job("qa_scan", url=req.url)
    # Always run as background task to ensure consistent API contract across environments.
    bg.add_task(_run_qa_scan, jid, req)
    return {"job_id": jid}

@router.post("/scan/load")
async def scan_load(req:LoadTestRequest,bg:BackgroundTasks):
    jid=new_job("load_test", url=req.url)
    bg.add_task(_run_load_test,jid,req)
    return{"job_id":jid}

@router.post("/scan/unicorn")
async def scan_unicorn(req:UnicornRequest,bg:BackgroundTasks):
    jid=new_job("unicorn", url=req.url)
    bg.add_task(_run_unicorn,jid,req)
    return{"job_id":jid}

@router.post("/scan/pagination")
async def scan_pagination(req:PaginationRequest,bg:BackgroundTasks):
    jid=new_job("pagination", url=req.url); bg.add_task(_run_pagination,jid,req); return{"job_id":jid}

@router.post("/scan/international")
async def scan_intl(req:IntlRequest,bg:BackgroundTasks):
    jid=new_job("international", url=req.url); bg.add_task(_run_intl,jid,req); return{"job_id":jid}

@router.post("/scan/user-baseline")
async def scan_baseline(req:UserBaselineRequest,bg:BackgroundTasks):
    jid=new_job("user_baseline", url=req.url); bg.add_task(_run_user_baseline,jid,req); return{"job_id":jid}

@router.post("/scan/lighthouse")
async def scan_lh(req: LighthouseRequest, bg: BackgroundTasks):
    jid = new_job("lighthouse", url=req.url)
    bg.add_task(_run_lighthouse, jid, req)
    return {"job_id": jid}

@router.post("/scan/mobile")
async def scan_mobile(req:MobileTestRequest,bg:BackgroundTasks):
    jid=new_job("mobile"); bg.add_task(_run_mobile,jid,req); return{"job_id":jid}

@router.post("/scan/api-test")
async def scan_api(req:APITestRequest,bg:BackgroundTasks):
    jid=new_job("api_test", url=req.url); bg.add_task(_run_api_test,jid,req); return{"job_id":jid}

@router.post("/scan/multi-location")
async def scan_multi_location(req: MultiLocationRequest, bg: BackgroundTasks):
    jid = new_job("multi_location", url=req.url)
    bg.add_task(_run_multi_location, jid, req)
    return {"job_id": jid}


@router.get("/scan/page-proxy")
async def scan_page_proxy(url: str):
    """
    Fetch a live webpage and return it without X-Frame-Options / CSP frame-ancestors
    so it can be embedded directly in an iframe inside the app.
    A <base href> is injected so relative links/assets resolve against the origin domain.

    Routing priority:
      1. CF Worker (if CF_WORKER_URL is configured) — strips frame headers at the edge
      2. Direct aiohttp fetch (fallback)
    """
    import aiohttp, ssl as _ssl, re as _re
    from fastapi.responses import HTMLResponse

    ssl_ctx = _ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode    = _ssl.CERT_NONE
    headers = {
        "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
    }
    try:
        async with aiohttp.ClientSession(headers=headers, timeout=aiohttp.ClientTimeout(total=20)) as s:
            # ── Route through CF Worker when available ─────────────────────────
            if proxy_manager.cf_configured:
                fetch_url = proxy_manager.cf_worker_url(url)
                # CF Worker already strips X-Frame-Options and injects CORS
                async with s.get(fetch_url, ssl=ssl_ctx) as resp:
                    final    = resp.headers.get("X-Proxy-Final-Url", url)
                    raw      = await resp.read()
                    encoding = resp.charset or "utf-8"
                    html     = raw.decode(encoding, errors="replace")
                    cf_colo  = resp.headers.get("X-CF-Colo", "")
                    log.info(f"page-proxy via CF Worker [{cf_colo}]: {url[:60]}")
            else:
                # ── Direct fetch fallback ──────────────────────────────────────
                async with s.get(url, allow_redirects=True, ssl=ssl_ctx) as resp:
                    final    = str(resp.url)
                    raw      = await resp.read()
                    encoding = resp.charset or "utf-8"
                    html     = raw.decode(encoding, errors="replace")

        # Inject <base href> so relative URLs work
        base = f'<base href="{final}">'
        if _re.search(r'<head[^>]*>', html, _re.I):
            html = _re.sub(r'(<head[^>]*>)', rf'\1{base}', html, count=1, flags=_re.I)
        else:
            html = f"<head>{base}</head>" + html

        # Return from our own origin — browser sees no X-Frame-Options
        return HTMLResponse(
            content=html,
            headers={
                "Content-Security-Policy": "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;",
            },
        )
    except Exception as exc:
        error_html = (
            f'<html><body style="font-family:sans-serif;padding:24px;background:#0D1117;color:#8B949E;">'
            f'<h2 style="color:#EF4444;">Preview Unavailable</h2>'
            f'<p>Could not load: <code>{url}</code></p>'
            f'<p style="font-size:12px;color:#555;">{str(exc)[:120]}</p>'
            f'</body></html>'
        )
        return HTMLResponse(content=error_html, status_code=200)


@router.get("/scan/preview-image")
async def scan_preview_image(url: str):
    """
    Take a Playwright viewport screenshot of the given URL and return it as JPEG.
    Used by the Live Preview panel — bypasses X-Frame-Options completely.
    """
    from fastapi.responses import Response as FResponse
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as pw:
            if BROWSER_WS:
                browser = await pw.chromium.connect_over_cdp(BROWSER_WS)
            else:
                browser = await pw.chromium.launch(
                    headless=True,
                    args=["--no-sandbox", "--disable-setuid-sandbox",
                          "--disable-blink-features=AutomationControlled"],
                )
            ctx = await browser.new_context(
                viewport={"width": 1280, "height": 720},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                extra_http_headers={
                    "Accept-Language": "en-US,en;q=0.9",
                    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
                },
            )
            page = await ctx.new_page()
            try:
                await page.goto(url, timeout=25000, wait_until="domcontentloaded")
                await asyncio.sleep(1.5)
            except Exception:
                pass  # screenshot whatever loaded so far
            shot = await page.screenshot(
                type="jpeg", quality=82,
                clip={"x": 0, "y": 0, "width": 1280, "height": 720},
            )
            await browser.close()
        return FResponse(content=shot, media_type="image/jpeg")
    except Exception as exc:
        log.error(f"preview-image failed: {exc}")
        raise HTTPException(500, f"Preview failed: {str(exc)[:80]}")


@router.post("/scan/site-health")
async def scan_site_health(req:SiteHealthRequest,bg:BackgroundTasks):
    jid=new_job("site_health", url=req.domain); bg.add_task(_run_site_health,jid,req); return{"job_id":jid}

@router.post("/config/ai-features")
async def save_ai_features(cfg:AIFeaturesConfig):
    return{"ok":True,"saved":len(cfg.enabled_modules),"modules":cfg.enabled_modules}


# ─────────────────────────────────────────────────────────────
#  AI ANALYSIS ENDPOINT
# ─────────────────────────────────────────────────────────────

@router.post("/scan/ai-analysis")
async def run_ai_analysis(req: AIAnalysisRequest):
    """Generate AI-powered recommendations from scan results.
    Uses Anthropic Claude if ANTHROPIC_API_KEY is set; falls back to rule-based insights."""

    ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

    # Build a concise summary of the scan
    score   = req.health_score or 0
    issues  = req.total_issues or 0
    pages   = req.pages_scanned or 1
    details = req.details or {}
    failed_tests = [t for t in (req.test_cases or []) if str(t.get("Result","")).lower() in ("fail","failed")]
    img_count = len(req.image_issues or [])
    lnk_count = len(req.link_issues or [])

    if ANTHROPIC_KEY:
        try:
            import aiohttp
            prompt_text = f"""You are SiteSentinel AI, an expert web quality analyst.

A QA scan of {req.url or 'the website'} returned these results:
- Health Score: {score}/100
- Pages Scanned: {pages}
- Total Issues Found: {issues}
- Image Accessibility Issues: {img_count}
- Broken/Error Links: {lnk_count}

Category scores (passed/total):
{chr(10).join(f"  • {k}: {v.get('passed',0)} passed, {v.get('failed',0)} failed" for k,v in details.items() if isinstance(v,dict))}

Top failed tests:
{chr(10).join(f"  • [{t.get('Severity','?')}] {t.get('Test Name','?')}: {t.get('Detail','')[:80]}" for t in failed_tests[:10])}

Provide a concise, actionable QA analysis with:
1. Executive Summary (2-3 sentences)
2. Top 3 Critical Issues to fix immediately
3. Performance & SEO Quick Wins (3 bullet points)
4. Accessibility Recommendations (2-3 bullet points)
5. Overall Priority Roadmap (short, numbered list)

Keep it professional, practical, and specific to the data above. Max 400 words."""

            headers = {
                "x-api-key": ANTHROPIC_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            }
            body = {
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 800,
                "messages": [{"role": "user", "content": prompt_text}]
            }
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://api.anthropic.com/v1/messages",
                    headers=headers, json=body, timeout=30
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        analysis = data.get("content", [{}])[0].get("text", "")
                        return {"analysis": analysis, "source": "claude"}
                    else:
                        err = await resp.text()
                        log.warning(f"Anthropic API error {resp.status}: {err[:200]}")
        except Exception as e:
            log.warning(f"AI analysis failed, falling back to rule-based: {e}")

    # ── Rule-based fallback ──────────────────────────────────────────────────
    lines = [f"AI-Powered QA Analysis — {req.url or 'Website'}", "=" * 56, ""]

    grade = "Excellent" if score >= 90 else "Good" if score >= 75 else "Fair" if score >= 60 else "Needs Improvement"
    lines.append(f"📊 Executive Summary")
    lines.append(f"Health Score: {score}/100 ({grade}). Scanned {pages} page(s) and found {issues} total issue(s) across all checks. {img_count} accessibility image issues and {lnk_count} broken link(s) detected.")
    lines.append("")

    lines.append("🔴 Critical Issues")
    critical = [t for t in failed_tests if str(t.get("Severity","")).upper() in ("CRITICAL","HIGH")]
    if critical:
        for t in critical[:3]:
            lines.append(f"  • [{t.get('Severity')}] {t.get('Test Name','')}: {t.get('Detail','')[:100]}")
    elif lnk_count > 0:
        lines.append(f"  • Fix {lnk_count} broken link(s) — these harm SEO and user trust.")
    elif img_count > 0:
        lines.append(f"  • Add alt text to {img_count} image(s) — required for accessibility compliance.")
    else:
        lines.append("  • No critical issues detected in this scan.")
    lines.append("")

    lines.append("⚡ Performance & SEO Quick Wins")
    perf = details.get("performance", {})
    seo  = details.get("seo", {})
    if perf.get("failed", 0) > 0:
        lines.append(f"  • Resolve {perf['failed']} performance issue(s): optimise images, enable caching, minify assets.")
    if seo.get("failed", 0) > 0:
        lines.append(f"  • Fix {seo['failed']} SEO issue(s): ensure meta descriptions, proper headings, and canonical URLs.")
    lines.append("  • Enable HTTP/2 and Brotli compression for faster load times.")
    lines.append("")

    lines.append("♿ Accessibility Recommendations")
    a11y = details.get("accessibility", {})
    if a11y.get("failed", 0) > 0:
        lines.append(f"  • Address {a11y['failed']} accessibility failure(s) to meet WCAG 2.1 AA standards.")
    if img_count > 0:
        lines.append(f"  • Add descriptive alt text to {img_count} image(s).")
    lines.append("  • Test keyboard navigation and screen-reader compatibility.")
    lines.append("")

    lines.append("📋 Priority Roadmap")
    priority = []
    if score < 60:   priority.append("1. Immediate: Fix critical and high severity issues")
    if lnk_count:    priority.append(f"{'2' if priority else '1'}. Fix {lnk_count} broken link(s)")
    if img_count:    priority.append(f"{len(priority)+1}. Add alt text to {img_count} image(s)")
    if not priority: priority.append("1. Maintain current quality standards")
    priority.append(f"{len(priority)+1}. Schedule regular automated QA scans")
    for p in priority:
        lines.append(f"  {p}")

    return {"analysis": "\n".join(lines), "source": "rule-based"}


# ── Test-cases routes ──────────────────────────────────────────────────────────

@router.post("/scan/test-cases/parse")
async def parse_test_cases(file: UploadFile = File(...)):
    ext = Path(file.filename or '').suffix.lower()
    if ext not in ('.xlsx', '.xls', '.pdf'):
        raise HTTPException(400, f"Unsupported file type '{ext}'. Use .xlsx, .xls, or .pdf")
    tmp = REPORTS_DIR / f"tc_upload_{datetime.now().strftime('%Y%m%d_%H%M%S')}{ext}"
    tmp.write_bytes(await file.read())
    try:
        if ext in ('.xlsx', '.xls'):
            tcs = _parse_test_cases_from_excel(tmp)
        else:
            tcs = _parse_test_cases_from_pdf(tmp)
        if not tcs:
            raise HTTPException(422, "Could not extract any test cases from the file. Check the format.")
        return {"test_cases": tcs, "count": len(tcs), "format": ext.lstrip('.')}
    finally:
        tmp.unlink(missing_ok=True)


@router.post("/scan/test-cases/run")
async def run_test_cases(req: TestCasesRunRequest, bg: BackgroundTasks):
    jid = new_job("test_runner")
    bg.add_task(_run_test_cases, jid, req)
    return {"job_id": jid}


# ── Upload ─────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload(file:UploadFile=File(...)):
    ext=Path(file.filename).suffix.lower()
    if ext not in {".apk",".apks",".ipa",".pdf",".txt"}:
        raise HTTPException(400,f"File type {ext} not allowed")
    dest=UPLOADS_DIR/f"{uuid.uuid4().hex[:8]}_{file.filename}"
    dest.write_bytes(await file.read())
    return{"path":str(dest),"filename":file.filename,"size":dest.stat().st_size}


# ── Reports ────────────────────────────────────────────────────────────────────

@router.get("/reports")
def list_reports():
    files = []
    for ext in ["*.json", "*.html", "*.xlsx"]:
        files.extend(REPORTS_DIR.glob(ext))
    files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
    return {"reports": [
        {
            "name":     f.name,
            "size":     f.stat().st_size,
            "modified": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
            "type":     f.suffix.lstrip("."),   # "html" | "json" | "xlsx"
        }
        for f in files[:100]
    ]}

@router.get("/reports/{filename}")
def get_report(filename: str):
    p = REPORTS_DIR / filename
    if not p.exists():
        raise HTTPException(404, "Not found")
    # Pick a sensible media type so browsers handle xlsx as download
    media_map = {
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".html": "text/html",
        ".json": "application/json",
    }
    media_type = media_map.get(p.suffix.lower(), "application/octet-stream")
    return FileResponse(
        p,
        media_type=media_type,
        filename=p.name if p.suffix.lower() == ".xlsx" else None,
    )


# ── Dashboard ──────────────────────────────────────────────────────────────────

@router.get("/scan/dashboard")
def scan_dashboard():
    # Return a summary of all jobs
    summaries = [_safe_get_job_summary(jid, j) for jid, j in jobs.items()]
    return {"jobs": summaries}


@router.get("/scan/dashboard/{jid}")
def scan_dashboard_detail(jid: str):
    # Return detailed info for a single scan for drill-down
    j = jobs.get(jid)
    if not j:
        raise HTTPException(404, "Job not found")

    r = j.get("result") or {}
    summary = _safe_get_job_summary(jid, j)

    # Extract detailed metrics based on scan type
    details = {
        "summary": summary,
        "logs": j.get("logs", [])[-50:],  # Last 50 logs
        "metrics": {},
    }

    if isinstance(r, dict):
        # QA Scan: include test case breakdown
        if "all_test_cases" in r:
            test_cases = r.get("all_test_cases", [])
            by_category = {}
            by_result = {"Pass": 0, "Fail": 0, "Warn": 0}
            for tc in test_cases:
                cat = tc.get("Category", "Other")
                if cat not in by_category:
                    by_category[cat] = []
                by_category[cat].append(tc)
                res = tc.get("Result", "Fail")
                if res == "Pass":
                    by_result["Pass"] += 1
                elif res == "Warn":
                    by_result["Warn"] += 1
                else:
                    by_result["Fail"] += 1
            details["metrics"]["by_category"] = {k: len(v) for k, v in by_category.items()}
            details["metrics"]["by_result"] = by_result
            details["test_cases"] = test_cases[:100]  # First 100 test cases

        # Baseline Scan: include mode results
        if "normal_results" in r or "ai_results" in r:
            normal_pass = sum(1 for nr in r.get("normal_results", []) if nr.get("ok"))
            normal_total = len(r.get("normal_results", []))
            ai_pass = sum(1 for ar in r.get("ai_results", []) if ar.get("status") == "pass")
            ai_total = len(r.get("ai_results", []))
            details["metrics"]["normal"] = {"pass": normal_pass, "total": normal_total}
            details["metrics"]["ai"] = {"pass": ai_pass, "total": ai_total}
            details["results"] = {
                "normal_results": r.get("normal_results", []),
                "ai_results": r.get("ai_results", []),
            }

    return details


@router.post("/scan/dashboard/report")
def scan_dashboard_report(format: str = 'both'):
    # Generate aggregated CSV and/or HTML reports for all scans and return report URLs
    csv_path = _generate_all_scans_csv(jobs)
    html_path = _generate_all_scans_html(jobs)
    ret = {}
    if format in ('csv','both'):
        ret['report_csv'] = f"/reports/{csv_path.name}"
    if format in ('html','both'):
        ret['report_html'] = f"/reports/{html_path.name}"
    return ret


@router.post("/scan/master-report")
def scan_master_report():
    """Generate a consolidated enterprise master report combining all completed scans."""
    from report_engine import build_master_report
    from datetime import datetime as _dt
    ts = _dt.now().strftime("%Y%m%d_%H%M%S")
    html = build_master_report(jobs)
    out = REPORTS_DIR / f"master_report_{ts}.html"
    out.write_text(html, encoding="utf-8")
    return {"report_html": f"/reports/{out.name}"}


# ── AI Ranking routes ──────────────────────────────────────────────────────────

@router.post("/scan/ai-ranking")
async def scan_ai_ranking(req: AIRankingRequest, bg: BackgroundTasks):
    jid = new_job("ai_ranking", url=req.url)
    bg.add_task(_run_ai_ranking, jid, req)
    return {"job_id": jid}


@router.get("/ai-ranking/history")
def air_history(limit: int = 20):
    audits = []
    for f in sorted(AI_RANKING_DIR.glob("air_*.json"), reverse=True)[:limit]:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            audits.append({
                "audit_id": data.get("audit_id", f.stem),
                "url": data.get("url", ""),
                "timestamp": data.get("timestamp", ""),
                "overall": data.get("scores", {}).get("overall", 0),
            })
        except Exception:
            pass
    return {"audits": audits}


@router.get("/ai-ranking/audit/{audit_id}")
def air_audit_detail(audit_id: str):
    f = AI_RANKING_DIR / f"{audit_id}.json"
    if not f.exists():
        raise HTTPException(404, "Audit not found")
    return json.loads(f.read_text(encoding="utf-8"))


@router.get("/ai-ranking/audit/{audit_id}/html")
def air_report_html(audit_id: str):
    from fastapi.responses import HTMLResponse
    f = AI_RANKING_DIR / f"{audit_id}.html"
    if not f.exists():
        raise HTTPException(404, "Report not found")
    return HTMLResponse(f.read_text(encoding="utf-8"))


@router.get("/ai-ranking/audit/{audit_id}/xlsx")
def air_report_xlsx(audit_id: str):
    from fastapi.responses import Response
    f = AI_RANKING_DIR / f"{audit_id}.xlsx"
    if not f.exists():
        raise HTTPException(404, "Report not found")
    return Response(
        content=f.read_bytes(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={audit_id}.xlsx"}
    )


# ── Super Lighthouse routes ────────────────────────────────────────────────────

@router.post("/scan/super-lighthouse")
async def scan_super_lighthouse(req: SuperLighthouseRequest, bg: BackgroundTasks):
    jid = new_job("super_lighthouse", url=req.url)
    bg.add_task(_run_super_lighthouse, jid, req)
    return {"job_id": jid}
