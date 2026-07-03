"""
SiteSentinel — Site / domain health checker (SSL, DNS, headers, uptime, tech).
"""
from __future__ import annotations

import asyncio
import time
from datetime import datetime
from typing import Any, Dict

from config import log
from job_manager import jdone, jlog
from models import SiteHealthRequest


async def _run_site_health(jid: str, req: SiteHealthRequest):
    import urllib.request as _ur, ssl as _ssl, socket as _sock
    from urllib.parse import urlparse

    domain = req.domain
    if not domain.startswith("http"):
        domain = "https://" + domain
    parsed  = urlparse(domain)
    host    = parsed.netloc or parsed.path
    base    = f"https://{host}"

    jlog(jid,"="*52,"hdr")
    jlog(jid,f"  SITE HEALTH  —  {host}","hdr")
    jlog(jid,"="*52,"hdr")

    result: Dict[str, Any] = {"domain":host,"checks":{},"score":0,
                               "timestamp":datetime.now().isoformat()}

    # SSL
    if "ssl" in req.checks:
        jlog(jid,"Checking SSL certificate…","info")
        try:
            ctx=_ssl.create_default_context()
            with _sock.create_connection((host,443),timeout=10) as s:
                with ctx.wrap_socket(s,server_hostname=host) as ss:
                    cert=ss.getpeercert()
                    exp=datetime.strptime(cert["notAfter"],"%b %d %H:%M:%S %Y %Z")
                    days=(exp-datetime.utcnow()).days
                    ok=days>14
                    result["checks"]["ssl"]={"ok":ok,"detail":f"Expires in {days} days ({exp.date()})","days":days}
                    jlog(jid,f"  SSL: {days} days remaining","ok" if ok else "err")
        except Exception as e:
            result["checks"]["ssl"]={"ok":False,"detail":str(e)[:60]}
            jlog(jid,f"  SSL: error — {e}","err")

    # DNS
    if "dns" in req.checks:
        jlog(jid,"Checking DNS resolution…","info")
        try:
            ip=_sock.gethostbyname(host)
            result["checks"]["dns"]={"ok":True,"detail":f"Resolves to {ip}","ip":ip}
            jlog(jid,f"  DNS: {ip}","ok")
        except Exception as e:
            result["checks"]["dns"]={"ok":False,"detail":str(e)[:60]}
            jlog(jid,f"  DNS: error","err")

    # HTTP headers + response
    if "headers" in req.checks:
        jlog(jid,"Checking HTTP security headers…","info")
        try:
            r=_ur.urlopen(_ur.Request(base,method="HEAD",headers={"User-Agent":"SiteSentinel/3"}),timeout=10)
            hdr_keys=[h.lower() for h in r.headers.keys()]
            required={"HSTS":"strict-transport-security","CSP":"content-security-policy",
                      "X-Frame":"x-frame-options","X-Content-Type":"x-content-type-options",
                      "Referrer-Policy":"referrer-policy"}
            hdr_ok={lbl:key in hdr_keys for lbl,key in required.items()}
            result["checks"]["headers"]={"ok":all(hdr_ok.values()),"detail":hdr_ok}
            passed_h=sum(hdr_ok.values())
            jlog(jid,f"  Headers: {passed_h}/{len(hdr_ok)} security headers present",
                 "ok" if passed_h==len(hdr_ok) else "warn")
        except Exception as e:
            result["checks"]["headers"]={"ok":False,"detail":str(e)[:60]}
            jlog(jid,f"  Headers: error","err")

    # Performance (response time)
    if "performance" in req.checks:
        jlog(jid,"Checking response time…","info")
        times=[]
        for _ in range(3):
            try:
                t0=time.time()
                _ur.urlopen(base,timeout=10)
                times.append(round((time.time()-t0)*1000))
            except: times.append(9999)
            await asyncio.sleep(.1)
        avg=round(sum(times)/len(times))
        ok=avg<2000
        result["checks"]["performance"]={"ok":ok,"detail":f"Avg {avg}ms over 3 requests","ms":avg,"samples":times}
        jlog(jid,f"  Response time: {avg}ms avg","ok" if ok else "warn")

    # Uptime (simple check)
    if "uptime" in req.checks:
        jlog(jid,"Checking uptime…","info")
        try:
            r2=_ur.urlopen(base,timeout=10)
            up=r2.status<500
            result["checks"]["uptime"]={"ok":up,"detail":f"HTTP {r2.status}","status":r2.status}
            jlog(jid,f"  Uptime: HTTP {r2.status}","ok" if up else "err")
        except Exception as e:
            result["checks"]["uptime"]={"ok":False,"detail":str(e)[:60]}
            jlog(jid,f"  Uptime: error","err")

    # Robots.txt / sitemap
    if "sitemap" in req.checks:
        for path,name in [("/robots.txt","robots_txt"),("/sitemap.xml","sitemap_xml")]:
            jlog(jid,f"Checking {path}…","info")
            try:
                r3=_ur.urlopen(base+path,timeout=8)
                ok3=r3.status==200
                result["checks"][name]={"ok":ok3,"detail":"Found" if ok3 else "Not found"}
                jlog(jid,f"  {path}: {'✓' if ok3 else '✗'}","ok" if ok3 else "warn")
            except Exception as e:
                result["checks"][name]={"ok":False,"detail":"Not found"}
                jlog(jid,f"  {path}: not found","warn")

    # Technology detection (basic)
    if "technology" in req.checks:
        jlog(jid,"Detecting technologies…","info")
        try:
            body=_ur.urlopen(base,timeout=10).read().decode("utf-8",errors="replace")
            techs=[]
            if "wp-content" in body or "wp-includes" in body: techs.append("WordPress")
            if "shopify" in body.lower(): techs.append("Shopify")
            if "react" in body.lower() or "__next" in body: techs.append("React/Next.js")
            if "angular" in body.lower(): techs.append("Angular")
            if "vue" in body.lower(): techs.append("Vue.js")
            if "jquery" in body.lower(): techs.append("jQuery")
            result["checks"]["technology"]={"ok":True,"detail":f"Detected: {', '.join(techs) or 'Unknown'}","techs":techs}
            jlog(jid,f"  Technologies: {', '.join(techs) or 'None detected'}","info")
        except Exception as e:
            result["checks"]["technology"]={"ok":True,"detail":"Unable to detect"}

    # Score
    checked=[v for v in result["checks"].values() if isinstance(v,dict)]
    passed_c=sum(1 for v in checked if v.get("ok"))
    result["score"]=round(passed_c/len(checked)*100) if checked else 0

    jlog(jid,"="*52,"hdr")
    jlog(jid,f"  SITE HEALTH COMPLETE  Score: {result['score']}/100","hdr")
    jdone(jid,result)
