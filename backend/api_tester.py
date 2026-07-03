"""
SiteSentinel — API endpoint tester (fast urllib path + browser automation path).
"""
from __future__ import annotations

import json
import time
from datetime import datetime

from config import BROWSER_WS, CONFIG, REPORTS_DIR, log, _run_in_proactor
from job_manager import jdone, jlog, jobs
from models import APITestRequest


def _run_api_test(jid: str, req: APITestRequest):
    import urllib.request as _ur
    jlog(jid,f"{req.method} {req.url}","hdr")
    t0=time.time()

    # If no granular checks, use the fast urllib path
    if not req.checks:
        try:
            data=req.body.encode() if req.body else None
            r=_ur.Request(req.url,data=data,method=req.method,headers=req.headers)
            with _ur.urlopen(r,timeout=30) as resp:
                ms=round((time.time()-t0)*1000); body=resp.read().decode("utf-8",errors="replace")[:4096]
                status=resp.status; hdrs={k.lower(): v for k,v in resp.headers.items()}
                ok=status==req.assert_status; c_ok=req.assert_contains in body if req.assert_contains else True
                jlog(jid,f"HTTP {status}  {ms}ms","ok" if ok else "err")
                jlog(jid,f"Content-Type: {hdrs.get('content-type','—')}","info")
                if not ok: jlog(jid,f"Expected {req.assert_status} got {status}","err")
                if req.assert_contains and not c_ok: jlog(jid,f"Body missing: {req.assert_contains}","err")
                jdone(jid,{"status":status,"ms":ms,"body":body,"headers":hdrs,"asserts_passed":ok and c_ok})
        except Exception as e:
            ms=round((time.time()-t0)*1000)
            jlog(jid,f"Error: {e}","err")
            jdone(jid,{"status":0,"ms":ms,"error":str(e),"asserts_passed":False})
        return

    # Browser Automation Path (Playwright)
    async def _browser_task():
        from playwright.async_api import async_playwright
        # Late import to avoid circular dependency at module load time
        from qa_scanner import QAEngine, _generate_browser_html_report
        async with async_playwright() as p:
            try:
                if BROWSER_WS:
                    browser = await p.chromium.connect_over_cdp(BROWSER_WS)
                else:
                    browser = await p.chromium.launch(headless=True)

                context = await browser.new_context()
                page = await context.new_page()

                console_errors = []
                page.on("console", lambda m: console_errors.append(m.text) if m.type=="error" else None)

                try:
                    nav_timeout = int(CONFIG.get("SCAN_GOTO_TIMEOUT", 60000))
                except Exception:
                    nav_timeout = 60000

                response = await page.goto(req.url, timeout=nav_timeout, wait_until="domcontentloaded")
                ms_load = round((time.time() - t0) * 1000)
                status = response.status if response else 0

                jlog(jid, f"BROWSER LOAD {status} {ms_load}ms", "ok" if status < 400 else "err")

                check_results = []
                for check in req.checks:
                    ok = False; detail = ""
                    if check == "Page load <3s":
                        ok = ms_load < 3000
                        detail = f"{ms_load}ms"
                    elif check == "HTTP 200":
                        ok = status == 200
                        detail = f"Status: {status}"
                    elif check == "No JS errors":
                        res = await QAEngine.build_console_test_cases(console_errors)
                        ok = res["passed"] == res["total"] if res["total"] > 0 else True
                        detail = f"{len(console_errors)} errors"
                    elif check == "Title tag":
                        title = await page.title()
                        ok = len(title) > 0
                        detail = title if ok else "Missing"
                    elif check == "H1 heading":
                        h1 = await page.query_selector("h1")
                        ok = h1 is not None
                        detail = "Found" if ok else "Missing"
                    elif check == "Viewport meta":
                        vp = await page.query_selector('meta[name="viewport"]')
                        ok = vp is not None
                        detail = "Found" if ok else "Missing"
                    elif check == "HTTPS cert":
                        ok = req.url.startswith("https://")
                        detail = "HTTPS" if ok else "HTTP"
                    elif check == "No broken images":
                        images = await page.query_selector_all("img")
                        broken = 0
                        for img in images:
                            nw = await img.evaluate("i => i.naturalWidth")
                            if nw == 0: broken += 1
                        ok = broken == 0
                        detail = f"{broken} broken" if broken > 0 else "All clean"
                    elif check == "Form labels":
                        labels = await page.query_selector_all("label")
                        inputs = await page.query_selector_all("input, select, textarea")
                        ok = len(labels) >= len(inputs) * 0.5
                        detail = f"{len(labels)} labels / {len(inputs)} inputs"
                    elif check == "ARIA landmarks":
                        landmarks = await page.query_selector_all("main, nav, header, footer, [role='main']")
                        ok = len(landmarks) > 0
                        detail = f"{len(landmarks)} landmarks"
                    elif check == "Mobile touch targets":
                        res = await QAEngine.check_responsive(page, context, req.url)
                        ok = res["passed"] > 0
                        jlog(jid, f"Touch Targets: {'OK' if ok else 'FAIL'}", "ok" if ok else "err")
                    elif check == "Cookie Secure flag":
                        cookies = await context.cookies()
                        insecure = [c for c in cookies if not c.get("secure")]
                        ok = len(insecure) == 0
                        jlog(jid, f"Secure Cookies: {'YES' if ok else 'FAIL'} ({len(insecure)} insecure)", "ok" if ok else "err")
                    elif check == "CSP header":
                        hdrs = {k.lower(): v for k,v in response.headers.items()}
                        ok = "content-security-policy" in hdrs
                        jlog(jid, f"CSP Header: {'PRESENT' if ok else 'MISSING'}", "ok" if ok else "err")
                    elif "LCP" in check or "CLS" in check:
                        res = await QAEngine.check_performance(page)
                        if "LCP" in check:
                            lcp = res["metrics"].get("lcp", 0)
                            ok = lcp < 2500
                            jlog(jid, f"LCP <2.5s: {'PASS' if ok else 'FAIL'} ({lcp}ms)", "ok" if ok else "err")
                        else:
                            cls = res["metrics"].get("cls", 0)
                            ok = cls < 0.1
                            jlog(jid, f"CLS <0.1: {'PASS' if ok else 'FAIL'} ({cls})", "ok" if ok else "err")

                    if "Mobile touch targets" not in check and "Cookie Secure flag" not in check and "CSP header" not in check and "LCP" not in check and "CLS" not in check:
                        jlog(jid, f"{check}: {'PASS' if ok else 'FAIL'} ({detail})", "ok" if ok else "err")

                    check_results.append({"name": check, "ok": ok, "detail": detail})

                await browser.close()
                return {"status": status, "ms": ms_load, "checks": check_results, "url": req.url, "timestamp": datetime.now().isoformat()}

            except Exception as eb:
                if 'browser' in locals(): await browser.close()
                raise eb

    try:
        res = _run_in_proactor(_browser_task())

        # Late import to avoid circular dependency at module load time
        from qa_scanner import _generate_browser_html_report

        ts2 = datetime.now().strftime("%Y%m%d_%H%M%S")
        html_content = _generate_browser_html_report(res)
        hp = REPORTS_DIR/f"browser_{ts2}.html"
        hp.write_text(html_content, encoding='utf-8')

        rp = REPORTS_DIR/f"browser_{ts2}.json"
        rp.write_text(json.dumps(res, indent=2), encoding='utf-8')

        res["report_html"] = f"/reports/browser_{ts2}.html"
        res["report_json"] = f"/reports/browser_{ts2}.json"
        res["asserts_passed"] = all(c["ok"] for c in res.get("checks", []))

        jlog(jid, "="*52, "hdr")
        jlog(jid, f"COMPLETE — Report: {res['report_html']}", "hdr")
        jlog(jid, "="*52, "hdr")

        jdone(jid, res)
    except Exception as e:
        jlog(jid, f"Browser Error: {e}", "err")
        jdone(jid, {"status": 0, "error": str(e), "asserts_passed": False})
