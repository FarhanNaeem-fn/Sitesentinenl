"""
SiteSentinel — core scan utilities shared across all scanner modules.
"""
from __future__ import annotations

import asyncio
import re
import time
import urllib.parse as _up
import urllib.request as _ureq
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from PIL import Image, ImageDraw

from config import BROWSER_WS, CONFIG, LOCATION_META, SEV, log
from job_manager import jdone, jerr, jlog, jobs
from proxy_manager import proxy_manager


# ── Browser launcher ──────────────────────────────────────────────────────────

async def _open_browser(jid: str, pw):
    if BROWSER_WS:
        jlog(jid, "Connecting to remote browser...", "info")
        try:
            browser = await asyncio.wait_for(
                pw.chromium.connect_over_cdp(BROWSER_WS),
                timeout=10,
            )
            jlog(jid, "✓ Remote browser connected", "ok")
        except asyncio.TimeoutError:
            jlog(jid, "Remote browser connection timeout, falling back to local", "warn")
            browser = await pw.chromium.launch(headless=True)
        except Exception as e:
            jlog(jid, f"Remote browser connection failed ({e}), falling back to local", "warn")
            browser = await pw.chromium.launch(headless=True)
    else:
        jlog(jid, "Launching local Chromium...", "info")
        browser = await pw.chromium.launch(headless=True)
    return browser


# ── Test case builder ─────────────────────────────────────────────────────────

def _tc(tc_id, category, name, result, severity, detail="", expected="", actual=""):
    return {
        "ID": tc_id,
        "Category": category,
        "Test Name": name,
        "Result": result,
        "Severity": severity,
        "Detail": detail,
        "Expected": expected,
        "Actual": actual,
        "fix_hint": "",
        "screenshot": None,
        "screenshot_coords": None,
        "Timestamp": datetime.now().strftime("%H:%M:%S"),
    }


# ── Site health scorer ────────────────────────────────────────────────────────

def calculate_site_health(all_tcs: list, full_report: dict) -> dict:
    score = 100.0
    deductions = []

    def count_fails(cat_substr, severity=None):
        return sum(
            1 for t in all_tcs
            if t.get("Result") == "FAIL"
            and cat_substr.lower() in t.get("Category", "").lower()
            and (severity is None or t.get("Severity") == severity)
        )

    def deduct(label, category, points, count, max_deduct=None):
        nonlocal score
        actual = points * count
        if max_deduct is not None:
            actual = min(actual, max_deduct)
        score -= actual
        if actual > 0:
            deductions.append({
                "category": category,
                "label": label,
                "points": round(actual, 1),
                "count": count,
            })

    deduct("Critical console errors",  "Console",       5.0, count_fails("Console",      "CRITICAL"), max_deduct=20)
    deduct("High console errors",      "Console",       3.0, count_fails("Console",      "HIGH"),     max_deduct=15)
    deduct("Critical security issues", "Security",      8.0, count_fails("Security",     "CRITICAL"), max_deduct=24)
    deduct("High performance issues",  "Performance",   3.0, count_fails("Performance",  "HIGH"),     max_deduct=12)
    deduct("Critical a11y issues",     "Accessibility", 4.0, count_fails("Accessibility","CRITICAL"), max_deduct=16)
    deduct("Broken links",             "Links",         2.0, count_fails("Broken Links"),             max_deduct=8)

    score = max(0.0, min(100.0, round(score)))
    grade = "Excellent" if score >= 90 else ("Good" if score >= 75 else ("Fair" if score >= 60 else "Poor"))
    color = (
        "#16a34a" if score >= 90
        else "#1d4ed8" if score >= 75
        else "#ea580c" if score >= 60
        else "#dc2626"
    )
    return {"score": score, "grade": grade, "color": color, "deductions": deductions}


# ── Screenshot annotator ──────────────────────────────────────────────────────

class ScreenshotMarker:
    CAT_COLOURS = {
        "seo":      (49, 130, 206),
        "a11y":     (221, 107, 32),
        "perf":     (229, 62, 62),
        "links":    (197, 48, 48),
        "security": (229, 62, 62),
        "console":  (197, 48, 48),
    }

    @classmethod
    def annotate(cls, img_path: Path, all_issues: dict, viewport_label: str):
        try:
            img = Image.open(img_path).convert("RGB")
            draw = ImageDraw.Draw(img)
            W, H = img.size
            panel_h = 60
            draw.rectangle([0, 0, W, panel_h], fill=(27, 42, 59, 230))
            img.convert("RGB").save(img_path)
        except Exception as e:
            log.warning(f"ScreenshotMarker error: {e}")


# ── URL resolution + pre-flight ───────────────────────────────────────────────

async def _resolve_url(url: str) -> tuple[bool, str, int]:
    import aiohttp
    import ssl as _ssl
    ssl_ctx = _ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = _ssl.CERT_NONE
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    try:
        async with aiohttp.ClientSession(
            headers=headers, timeout=aiohttp.ClientTimeout(total=15)
        ) as s:
            async with s.get(url, allow_redirects=True, ssl=ssl_ctx) as r:
                return 200 <= r.status < 400, str(r.url), r.status
    except Exception:
        return False, url, 0


async def _url_preflight(jid: str, url: str) -> bool:
    from urllib.parse import urlparse as _ulp
    parsed = _ulp(url)
    if parsed.scheme not in ("http", "https"):
        msg = "Invalid URL format — URL must start with http:// or https://"
        jlog(jid, f"✗ {msg}", "err")
        jdone(jid, {"error": msg, "url_check_failed": True, "url": url})
        return False
    if not parsed.netloc or "." not in parsed.netloc:
        msg = f"Invalid URL — missing or incomplete domain name in: {url}"
        jlog(jid, f"✗ {msg}", "err")
        jdone(jid, {"error": msg, "url_check_failed": True, "url": url})
        return False
    jlog(jid, f"Checking website reachability: {parsed.netloc} …", "info")
    ok, _final, status = await _resolve_url(url)
    if not ok:
        if status == 0:
            msg = f"Website is not reachable — {parsed.netloc} did not respond"
            jlog(jid, f"✗ {msg}", "err")
            jlog(jid, "  Possible causes: domain does not exist, server is down, DNS failure, or connection timed out", "warn")
        elif status >= 500:
            msg = f"Website returned server error HTTP {status} — cannot proceed with scan"
            jlog(jid, f"✗ {msg}", "err")
        else:
            msg = f"Website returned HTTP {status} — page not found or access denied"
            jlog(jid, f"✗ {msg}", "err")
        jdone(jid, {"error": msg, "url_check_failed": True, "url": url})
        return False
    jlog(jid, f"✓ Website reachable — HTTP {status}", "ok")
    return True


# ── BFS site crawler ──────────────────────────────────────────────────────────

async def _crawl_site_for_assets(jid: str, page, base_url: str, max_pages: int) -> dict:
    def _page_name(url: str, title: str = "") -> str:
        if title and title.strip():
            return title.strip()[:60]
        path = _up.urlparse(url).path.rstrip("/")
        if not path or path == "/":
            return "Home"
        parts = [p for p in path.split("/") if p]
        return parts[-1].replace("-", " ").replace("_", " ").title()[:60] if parts else "Home"

    parsed_base = _up.urlparse(base_url)
    base_domain = parsed_base.netloc
    visited: set = {base_url}
    queue: list = []
    image_issues: List[dict] = []
    link_issues: List[dict] = []
    pages_crawled: List[dict] = []
    collected_links: List[dict] = []
    total_images = 0

    async def _scan_current_page(pg_url: str):
        nonlocal total_images
        try:
            title = await page.title()
        except Exception:
            title = ""
        pg_name = _page_name(pg_url, title)

        try:
            imgs = await page.evaluate("""() => Array.from(document.querySelectorAll('img')).map(img => ({
                src:    img.currentSrc || img.src || img.getAttribute('src') || '',
                hasAlt: img.hasAttribute('alt'),
                alt:    img.getAttribute('alt') ?? '',
                role:   (img.getAttribute('role') || '').toLowerCase(),
            }))""")
            total_images += len(imgs)
            seen_img_keys: set = set()
            for img in imgs:
                src = img.get("src", "").strip()
                has_alt = img.get("hasAlt", False)
                alt = img.get("alt", "")
                role = img.get("role", "")
                if not src:
                    continue
                img_key = (pg_url, src)
                if img_key in seen_img_keys:
                    continue
                seen_img_keys.add(img_key)
                if not has_alt:
                    image_issues.append({
                        "page_name": pg_name, "page_url": pg_url, "image_url": src,
                        "issue": "Missing alt attribute",
                        "description": "The <img> element has no alt attribute. Screen readers cannot describe this image.",
                        "fix": "Add alt=\"Description of image\" to the <img> tag.",
                    })
                elif alt == "" and role not in ("presentation", "none"):
                    image_issues.append({
                        "page_name": pg_name, "page_url": pg_url, "image_url": src,
                        "issue": "Empty alt text (not marked decorative)",
                        "description": "alt=\"\" is present but the image is not marked as decorative (role='presentation').",
                        "fix": "Add a meaningful description, or add role='presentation' if purely decorative.",
                    })
        except Exception as e:
            jlog(jid, f"  Image scan error ({pg_url[:40]}): {str(e)[:50]}", "warn")

        try:
            links = await page.evaluate("""() => Array.from(document.querySelectorAll('a[href]')).map(a => ({
                href: a.href || '',
                text: (a.innerText || a.textContent || '').trim().replace(/\\s+/g,' ').slice(0,80),
            })).filter(l => l.href.startsWith('http'))""")
            for lnk in links:
                href = lnk.get("href", "").split("#")[0].strip()
                if href:
                    collected_links.append({
                        "page_name": pg_name, "page_url": pg_url,
                        "link_url": href, "link_text": lnk.get("text", "") or href[:60],
                    })
        except Exception as e:
            jlog(jid, f"  Link collect error ({pg_url[:40]}): {str(e)[:50]}", "warn")

        try:
            hrefs = await page.evaluate("""() => Array.from(document.querySelectorAll('a[href]'))
                .map(a => a.href || '').filter(h => h.startsWith('http'))""")
            for href in hrefs:
                clean = href.split("#")[0].split("?")[0]
                if _up.urlparse(clean).netloc == base_domain and clean not in visited:
                    queue.append(clean)
                    visited.add(clean)
        except Exception:
            pass

        pages_crawled.append({"url": pg_url, "page_name": pg_name})

    jlog(jid, f"  [1/{max_pages}] Scanning base: {base_url}", "info")
    await _scan_current_page(base_url)

    crawled = 1
    while queue and crawled < max_pages:
        if jobs.get(jid, {}).get("cancel"):
            break
        next_url = queue.pop(0)
        try:
            await page.goto(next_url, timeout=15000, wait_until="domcontentloaded")
            jlog(jid, f"  [{crawled+1}/{max_pages}] Scanning: {next_url}", "info")
            await _scan_current_page(next_url)
            crawled += 1
        except Exception as e:
            jlog(jid, f"  Skip {next_url[:50]}: {str(e)[:50]}", "warn")

    seen_urls: set = set()
    unique_links: List[dict] = []
    for lnk in collected_links:
        k = lnk["link_url"]
        if k not in seen_urls:
            seen_urls.add(k)
            unique_links.append(lnk)

    total_links = len(unique_links)
    cap = min(total_links, 80)
    if unique_links:
        jlog(jid, f"  HTTP-checking {cap} unique links...", "info")
        for lnk in unique_links[:cap]:
            if jobs.get(jid, {}).get("cancel"):
                break
            try:
                req_obj = _ureq.Request(
                    lnk["link_url"], method="HEAD",
                    headers={"User-Agent": "SiteSentinel/4.0"},
                )
                with _ureq.urlopen(req_obj, timeout=7) as r:
                    if r.status >= 400:
                        codes = {
                            404: "Not Found", 403: "Forbidden", 410: "Gone",
                            500: "Internal Server Error", 503: "Service Unavailable",
                        }
                        label = codes.get(r.status, f"HTTP Error {r.status}")
                        link_issues.append({
                            "page_name": lnk["page_name"], "page_url": lnk["page_url"],
                            "link_url": lnk["link_url"], "link_text": lnk["link_text"],
                            "status": str(r.status), "issue": f"HTTP {r.status} — {label}",
                            "description": f"This link returns HTTP {r.status}. Visitors clicking it will see an error page.",
                            "fix": "Update the link to point to a live URL, or remove it.",
                        })
            except Exception as e:
                link_issues.append({
                    "page_name": lnk["page_name"], "page_url": lnk["page_url"],
                    "link_url": lnk["link_url"], "link_text": lnk["link_text"],
                    "status": "ERR", "issue": "Connection failed",
                    "description": str(e)[:100],
                    "fix": "Verify the URL is correct and the server is reachable.",
                })

    return {
        "image_issues": image_issues,
        "link_issues": link_issues,
        "pages_crawled": pages_crawled,
        "total_images_checked": total_images,
        "total_links_checked": total_links,
    }


# ── Location reachability check (used by QA scan) ────────────────────────────

async def _check_locations_for_qa(
    jid: str,
    url: str,
    locations: List[str],
    use_proxy: bool = False,
    proxy_session_type: str = "rotating",
    proxy_protocol: str = "http",
) -> List[dict]:
    import aiohttp
    import ssl as _ssl
    HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Connection": "keep-alive",
    }
    ssl_ctx = _ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = _ssl.CERT_NONE
    timeout = aiohttp.ClientTimeout(total=25, connect=8)
    results: List[dict] = []

    using_proxy = use_proxy and proxy_manager.enabled

    if use_proxy and proxy_manager.enabled:
        jlog(jid, f"  Proxy mode: ON ({proxy_manager.provider} / {proxy_session_type})", "info")
    elif use_proxy:
        jlog(jid, "  ⚠ Proxy requested but ACTIVE_PROXY_PROVIDER not configured — going direct", "warn")

    async with aiohttp.ClientSession(headers=HEADERS, timeout=timeout) as session:
        for loc_id in locations:
            if jobs.get(jid, {}).get("cancel"):
                break
            meta = LOCATION_META.get(
                loc_id, {"name": loc_id, "flag": "📍", "lat": 0.2, "region": "Unknown"}
            )
            jlog(jid, f"  {meta['flag']} Checking {meta['name']}...", "info")

            if not using_proxy:
                await asyncio.sleep(meta.get("lat", 0.2))

            t0 = time.time()
            try:
                if using_proxy and proxy_manager.is_cloudflare:
                    jlog(jid, f"  → via Cloudflare Worker [{loc_id}]", "info")
                    try:
                        _resp, _meta = await proxy_manager.fetch_with_retry(
                            session, url, loc_id, ssl_ctx=ssl_ctx
                        )
                        ms = _meta["ms"]
                        status = _meta["status"]
                        ok = 200 <= status < 400
                        results.append({
                            "location": loc_id, "name": meta["name"], "flag": meta["flag"],
                            "region": meta.get("region", ""), "status": status, "ms": ms, "ok": ok,
                            "via_proxy": True, "proxy_type": "cloudflare",
                            "cf_colo": _meta.get("colo", ""),
                            "cf_city": _meta.get("city", ""),
                            "cf_country": _meta.get("country", ""),
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
                            "region": meta.get("region", ""), "error": err_msg,
                            "status": 0, "ms": ms, "ok": False,
                            "via_proxy": True, "proxy_type": "cloudflare",
                        })
                        jlog(jid, f"  ✗ {meta['name']}: {err_msg}", "err")

                elif using_proxy:
                    jlog(jid, f"  → via {proxy_manager.provider} proxy [{loc_id}]", "info")
                    req_kwargs: dict = {"allow_redirects": True, "ssl": ssl_ctx, "max_redirects": 5}
                    proxy_kwargs = proxy_manager.aiohttp_kwargs(
                        loc_id, session_type=proxy_session_type, protocol=proxy_protocol
                    )
                    req_kwargs.update(proxy_kwargs)
                    async with session.get(url, **req_kwargs) as resp:
                        ms = round((time.time() - t0) * 1000)
                        status = resp.status
                        ok = 200 <= status < 400
                        proxy_manager.mark_success(loc_id, response_ms=float(ms))
                    results.append({
                        "location": loc_id, "name": meta["name"], "flag": meta["flag"],
                        "region": meta.get("region", ""), "status": status, "ms": ms, "ok": ok,
                        "via_proxy": True, "proxy_type": proxy_manager.provider,
                    })
                    icon = "✓" if ok else "✗"
                    jlog(jid, f"  {icon} {meta['name']}: HTTP {status} in {ms}ms",
                         "ok" if ok else "warn")

                else:
                    async with session.get(url, allow_redirects=True, ssl=ssl_ctx, max_redirects=5) as resp:
                        ms = round((time.time() - t0) * 1000)
                        status = resp.status
                        ok = 200 <= status < 400
                    results.append({
                        "location": loc_id, "name": meta["name"], "flag": meta["flag"],
                        "region": meta.get("region", ""), "status": status, "ms": ms, "ok": ok,
                        "via_proxy": False,
                    })
                    icon = "✓" if ok else "✗"
                    jlog(jid, f"  {icon} {meta['name']}: HTTP {status} — {ms}ms",
                         "ok" if ok else "warn")

            except Exception as exc:
                ms = round((time.time() - t0) * 1000)
                err_msg = str(exc)[:80]
                if using_proxy:
                    proxy_manager.mark_failure(loc_id, err_msg)
                results.append({
                    "location": loc_id, "name": meta["name"], "flag": meta["flag"],
                    "region": meta.get("region", ""), "status": 0, "ms": ms, "ok": False,
                    "error": err_msg, "via_proxy": using_proxy,
                })
                jlog(jid, f"  ✗ {meta['name']}: {err_msg}", "err")

    return results


# ── Console error parser ──────────────────────────────────────────────────────

def _describe_console_message(raw_msg: str) -> dict:
    msg = raw_msg.strip()
    upper = msg.upper()
    result = {
        "level": "ERROR" if "[ERROR]" in upper else "WARNING",
        "short_title": msg[:80],
        "detail": msg,
        "severity": SEV["HIGH"],
        "category": "Console Error",
        "fix_hint": "Review the browser console for full stack trace.",
    }
    net_match = re.search(r"(GET|POST|PUT|DELETE|PATCH|HEAD)\s+(https?://\S+)\s+(\d{3})", msg, re.I)
    if net_match or re.search(r"failed to (load|fetch|retrieve)", msg, re.I):
        url_m = re.search(r"https?://[^\s\"']+", msg)
        url = url_m.group(0) if url_m else "(unknown URL)"
        code_m = re.search(r"\b(4\d{2}|5\d{2})\b", msg)
        code = code_m.group(0) if code_m else "unknown"
        method = net_match.group(1).upper() if net_match else "Resource"
        if code.startswith("4"):
            desc = f"{method} request to '{url}' returned HTTP {code}. The resource does not exist or access is forbidden."
            fix = f"Verify the URL '{url}' is correct and the server returns 200."
            sev = SEV["HIGH"] if code == "404" else SEV["CRITICAL"]
        elif code.startswith("5"):
            desc = f"{method} request to '{url}' returned HTTP {code}. The server encountered an internal error."
            fix = "Check server-side logs. HTTP 5xx indicates a backend problem."
            sev = SEV["CRITICAL"]
        else:
            desc = f"Network request to '{url}' failed to load."
            fix = "Check if the resource URL is reachable."
            sev = SEV["HIGH"]
        result.update({
            "category": "Network Error",
            "short_title": f"[{code}] {url[:60]}",
            "detail": desc,
            "severity": sev,
            "fix_hint": fix,
        })
        return result
    if re.search(r"cors|cross.origin|access.control", msg, re.I):
        url_m = re.search(r"https?://[^\s\"']+", msg)
        url = url_m.group(0) if url_m else "(unknown origin)"
        result.update({
            "category": "CORS Error",
            "short_title": f"CORS blocked: {url[:55]}",
            "detail": f"CORS error for '{url}'.",
            "severity": SEV["CRITICAL"],
            "fix_hint": "Check CORS headers.",
        })
        return result
    return result
