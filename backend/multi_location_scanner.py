"""
SiteSentinel — Multi-location availability checker.
"""
from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime
from pathlib import Path

from config import REPORTS_DIR, log, _run_in_proactor
from core import _url_preflight
from job_manager import jdone, jlog, jobs
from models import MultiLocationRequest
from proxy_manager import proxy_manager
from supabase_client import db


def _run_multi_location(jid: str, req: MultiLocationRequest):
    _run_in_proactor(_run_multi_location_impl(jid, req))


async def _run_multi_location_impl(jid: str, req: MultiLocationRequest):
    import aiohttp, ssl as _ssl

    LOC_META = {
        "anywhere":    {"name": "Anywhere (Random)",      "flag": "🌐", "lat": 0.1},
        "ae-dubai":    {"name": "Dubai, UAE",             "flag": "🇦🇪", "lat": 0.35},
        "pk-karachi":  {"name": "Karachi, Pakistan",      "flag": "🇵🇰", "lat": 0.50},
        "sa-riyadh":   {"name": "Riyadh, Saudi Arabia",  "flag": "🇸🇦", "lat": 0.40},
        "uk-london":   {"name": "London, UK",             "flag": "🇬🇧", "lat": 0.25},
        "us-new-york": {"name": "New York, US",           "flag": "🇺🇸", "lat": 0.70},
    }

    HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT":             "1",
        "Connection":      "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest":  "document",
        "Sec-Fetch-Mode":  "navigate",
        "Sec-Fetch-Site":  "none",
        "Sec-Fetch-User":  "?1",
    }

    results = []
    jlog(jid, "="*52, "hdr")
    jlog(jid, f"  MULTI-LOCATION CHECK — {req.url}", "hdr")
    jlog(jid, f"  Checking {len(req.locations)} location(s) via HTTP...", "hdr")
    jlog(jid, "="*52, "hdr")
    if not await _url_preflight(jid, req.url): return

    ssl_ctx = _ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = _ssl.CERT_NONE

    timeout = aiohttp.ClientTimeout(total=20, connect=8)

    if req.use_proxy and proxy_manager.enabled:
        jlog(jid, f"  Proxy mode: ON ({proxy_manager.provider} / {req.proxy_session_type})", "info")
    elif req.use_proxy:
        jlog(jid, "  ⚠ Proxy requested but ACTIVE_PROXY_PROVIDER not configured — going direct", "warn")

    async with aiohttp.ClientSession(headers=HEADERS, timeout=timeout) as session:
        for i, loc_id in enumerate(req.locations):
            if jobs[jid].get("cancel"):
                break

            meta = LOC_META.get(loc_id, {"name": loc_id, "flag": "📍", "lat": 0.2})
            jlog(jid, f"Checking {meta['flag']} {meta['name']}...", "info")

            if not (req.use_proxy and proxy_manager.enabled):
                await asyncio.sleep(meta["lat"])

            t0 = time.time()
            try:
                using_proxy = req.use_proxy and proxy_manager.enabled

                if using_proxy and proxy_manager.is_cloudflare:
                    jlog(jid, f"  → via Cloudflare Worker [{loc_id}]", "info")
                    try:
                        _resp, _meta = await proxy_manager.fetch_with_retry(
                            session, req.url, loc_id, ssl_ctx=ssl_ctx
                        )
                        ms     = _meta["ms"]
                        status = _meta["status"]
                        ok     = 200 <= status < 400
                        results.append({
                            "location":   loc_id,
                            "name":       meta["name"],
                            "flag":       meta["flag"],
                            "status":     status,
                            "ms":         ms,
                            "ok":         ok,
                            "via_proxy":  True,
                            "proxy_type": "cloudflare",
                            "cf_colo":    _meta.get("colo", ""),
                            "cf_city":    _meta.get("city", ""),
                            "cf_country": _meta.get("country", ""),
                            "exit_ip":    _meta.get("exit_ip", ""),
                        })
                        icon = "✓" if ok else "✗"
                        colo_tag = f" [CF:{_meta.get('colo', '?')}]" if _meta.get("colo") else ""
                        jlog(jid, f"  {icon} {meta['name']}: HTTP {status} in {ms}ms{colo_tag}",
                             "ok" if ok else "warn")
                    except Exception as exc:
                        ms = round((time.time() - t0) * 1000)
                        err_msg = str(exc)[:80]
                        results.append({
                            "location": loc_id, "name": meta["name"], "flag": meta["flag"],
                            "error": err_msg, "status": 0, "ms": ms, "ok": False,
                            "via_proxy": True, "proxy_type": "cloudflare",
                        })
                        jlog(jid, f"  ✗ {meta['name']}: {err_msg}", "err")

                elif using_proxy:
                    jlog(jid, f"  → via {proxy_manager.provider} proxy [{loc_id}]", "info")
                    req_kwargs: dict = {"allow_redirects": True, "ssl": ssl_ctx, "max_redirects": 5}
                    proxy_kwargs = proxy_manager.aiohttp_kwargs(
                        loc_id, session_type=req.proxy_session_type, protocol=req.proxy_protocol
                    )
                    req_kwargs.update(proxy_kwargs)
                    async with session.get(req.url, **req_kwargs) as resp:
                        ms     = round((time.time() - t0) * 1000)
                        status = resp.status
                        ok     = 200 <= status < 400
                        proxy_manager.mark_success(loc_id, response_ms=float(ms))
                    results.append({
                        "location": loc_id, "name": meta["name"], "flag": meta["flag"],
                        "status": status, "ms": ms, "ok": ok,
                        "via_proxy": True, "proxy_type": proxy_manager.provider,
                    })
                    icon = "✓" if ok else "✗"
                    jlog(jid, f"  {icon} {meta['name']}: HTTP {status} in {ms}ms",
                         "ok" if ok else "warn")

                else:
                    req_kwargs = {"allow_redirects": True, "ssl": ssl_ctx, "max_redirects": 5}
                    async with session.get(req.url, **req_kwargs) as resp:
                        ms     = round((time.time() - t0) * 1000)
                        status = resp.status
                        ok     = 200 <= status < 400
                    results.append({
                        "location": loc_id, "name": meta["name"], "flag": meta["flag"],
                        "status": status, "ms": ms, "ok": ok, "via_proxy": False,
                    })
                    icon = "✓" if ok else "✗"
                    jlog(jid, f"  {icon} {meta['name']}: HTTP {status} in {ms}ms",
                         "ok" if ok else "warn")

            except Exception as exc:
                ms      = round((time.time() - t0) * 1000)
                err_msg = str(exc)[:80]
                if req.use_proxy and proxy_manager.enabled:
                    proxy_manager.mark_failure(loc_id, err_msg)
                results.append({
                    "location":   loc_id,
                    "name":       meta["name"],
                    "flag":       meta["flag"],
                    "error":      err_msg,
                    "status":     0,
                    "ms":         ms,
                    "ok":         False,
                    "via_proxy":  req.use_proxy and proxy_manager.enabled,
                })
                jlog(jid, f"  ✗ {meta['name']}: {err_msg}", "err")

            jobs[jid]["progress"] = int((i + 1) / len(req.locations) * 95)

    health = round(sum(1 for r in results if r["ok"]) / len(results) * 100) if results else 0
    jlog(jid, "="*52, "hdr")
    jlog(jid, f"  MULTI-LOCATION COMPLETE — {health}% accessible", "hdr")

    qa_summary: dict = {}
    if any(r["ok"] for r in results):
        jlog(jid, "Running quick QA check on accessible URL...", "info")
        try:
            import aiohttp as _aio, ssl as _ssl, re as _re
            _ssl_ctx = _ssl.create_default_context()
            _ssl_ctx.check_hostname = False
            _ssl_ctx.verify_mode    = _ssl.CERT_NONE
            _hdrs = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            }
            t0 = time.time()
            async with _aio.ClientSession(headers=_hdrs, timeout=_aio.ClientTimeout(total=20)) as _s:
                async with _s.get(req.url, allow_redirects=True, ssl=_ssl_ctx) as _r:
                    _html   = await _r.text(errors="replace")
                    _status = _r.status
                    _final  = str(_r.url)
                    _rheads = dict(_r.headers)
                    _ms     = round((time.time() - t0) * 1000)

            def _find(pattern, flags=_re.I | _re.S):
                m = _re.search(pattern, _html, flags)
                return m.group(1).strip() if m else ""

            title    = _find(r'<title[^>]*>(.*?)</title>')[:120]
            meta_d   = _find(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']')[:160]
            h1       = _find(r'<h1[^>]*>(.*?)</h1>')[:80]
            viewport = bool(_re.search(r'<meta[^>]+name=["\']viewport["\']', _html, _re.I))
            charset  = bool(_re.search(r'<meta[^>]+charset', _html, _re.I))
            is_https = _final.lower().startswith("https://")

            sec_headers = {
                "hsts":            "strict-transport-security" in (k.lower() for k in _rheads),
                "x_content_type":  "x-content-type-options"   in (k.lower() for k in _rheads),
                "csp":             "content-security-policy"   in (k.lower() for k in _rheads),
                "x_frame":        "x-frame-options"           in (k.lower() for k in _rheads),
            }

            qa_summary = {
                "status":       _status,
                "final_url":    _final,
                "load_ms":      _ms,
                "https":        is_https,
                "title":        title,
                "meta_desc":    meta_d,
                "h1":           h1,
                "has_viewport": viewport,
                "has_charset":  charset,
                "sec_headers":  sec_headers,
                "issues": [
                    *([] if title    else ["Missing <title> tag"]),
                    *([] if meta_d   else ["Missing meta description"]),
                    *([] if h1       else ["Missing <h1> heading"]),
                    *([] if viewport else ["Missing viewport meta tag"]),
                    *([] if is_https else ["Not using HTTPS"]),
                    *([] if sec_headers["hsts"]           else ["Missing HSTS header"]),
                    *([] if sec_headers["x_content_type"] else ["Missing X-Content-Type-Options"]),
                ],
            }
            jlog(jid, f"  QA: title='{title[:40]}', HTTPS={'✓' if is_https else '✗'}, load={_ms}ms", "ok")
        except Exception as _e:
            jlog(jid, f"  Quick QA check failed: {_e}", "warn")

    try:
        ts2 = datetime.now().strftime("%Y%m%d_%H%M%S")
        rp = REPORTS_DIR/f"multi_loc_{ts2}.json"
        res_data = {"results": results, "health": health, "url": req.url, "qa_summary": qa_summary}
        rp.write_text(json.dumps(res_data, indent=2), encoding='utf-8')
        db.save_report(jid, str(rp), "json")
    except Exception as e:
        jlog(jid, f"Warning: multi-location report failed: {e}", "warn")

    jdone(jid, {"results": results, "health": health, "url": req.url, "qa_summary": qa_summary})
