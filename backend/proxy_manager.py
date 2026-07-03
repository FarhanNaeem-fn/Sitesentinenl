"""
SiteSentinel Backend Proxy Manager
====================================
Manages proxy connections for geographic site testing.

Two fundamentally different proxy patterns are supported:

  1. FORWARD PROXY (residential providers)
     aiohttp uses proxy= / proxy_auth= kwargs.
     Traffic tunnels through an exit node in the target city.
     Providers: Bright Data, Oxylabs, DataImpulse, IPRoyal, Decodo

  2. REVERSE PROXY (Cloudflare Worker)
     No proxy tunnel — instead the request URL is rewritten to point
     at the CF Worker, which fetches the target from Cloudflare's edge.
     Pattern: GET https://worker.workers.dev/?url={target}&secret={key}
     Returns CF geographic metadata in response headers.
     Free up to 100k req/day.  No city-level targeting (uses Smart
     Placement — routes to the CF PoP nearest the target origin).

Provider selection:  ACTIVE_PROXY_PROVIDER in .env
  "cloudflare"   → CF Worker (free, no credentials apart from CF secret)
  "brightdata"   → Bright Data residential proxy
  "oxylabs"      → Oxylabs residential proxy
  "dataimpulse"  → DataImpulse residential proxy
  "iproyal"      → IPRoyal residential proxy
  "decodo"       → Decodo residential proxy
"""

from __future__ import annotations

import os
import time
import uuid
import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse, urlencode

log = logging.getLogger("sitesentinel.proxy")

# ── Geographic targeting map ──────────────────────────────────────────────────
# Maps location IDs (used by the frontend) to provider-agnostic geo params.
LOCATION_MAP: Dict[str, Dict[str, str]] = {
    # Middle East — primary targets
    "ae-dubai":        {"country": "AE", "city": "dubai",         "region": "Middle East"},
    "sa-riyadh":       {"country": "SA", "city": "riyadh",        "region": "Middle East"},
    "sa-jeddah":       {"country": "SA", "city": "jeddah",        "region": "Middle East"},
    "kw-kuwait":       {"country": "KW", "city": "kuwait",        "region": "Middle East"},
    "om-muscat":       {"country": "OM", "city": "muscat",        "region": "Middle East"},
    "iq-baghdad":      {"country": "IQ", "city": "baghdad",       "region": "Middle East"},
    # South Asia
    "pk-karachi":      {"country": "PK", "city": "karachi",       "region": "South Asia"},
    "in-mumbai":       {"country": "IN", "city": "mumbai",        "region": "South Asia"},
    "in-bangalore":    {"country": "IN", "city": "bangalore",     "region": "South Asia"},
    # Europe
    "uk-london":       {"country": "GB", "city": "london",        "region": "Europe"},
    "de-frankfurt":    {"country": "DE", "city": "frankfurt",     "region": "Europe"},
    "fr-paris":        {"country": "FR", "city": "paris",         "region": "Europe"},
    "nl-amsterdam":    {"country": "NL", "city": "amsterdam",     "region": "Europe"},
    # North America
    "us-new-york":     {"country": "US", "city": "new+york",      "region": "North America"},
    "us-california":   {"country": "US", "city": "los+angeles",   "region": "North America"},
    "ca-toronto":      {"country": "CA", "city": "toronto",       "region": "North America"},
    # Asia-Pacific
    "sg-singapore":    {"country": "SG", "city": "singapore",     "region": "Southeast Asia"},
    "jp-tokyo":        {"country": "JP", "city": "tokyo",         "region": "East Asia"},
    "au-sydney":       {"country": "AU", "city": "sydney",        "region": "Oceania"},
}


# ── Health tracking ───────────────────────────────────────────────────────────

@dataclass
class ProxyStats:
    location_id: str
    success_count: int = 0
    failure_count: int = 0
    consecutive_failures: int = 0
    last_ip: Optional[str] = None
    _response_ms_sum: float = 0.0
    _response_ms_count: int = 0
    last_used_ts: float = field(default_factory=time.time)

    @property
    def avg_response_ms(self) -> float:
        return self._response_ms_sum / self._response_ms_count if self._response_ms_count else 0.0

    @property
    def success_rate(self) -> float:
        total = self.success_count + self.failure_count
        return (self.success_count / total * 100.0) if total > 0 else 100.0

    @property
    def is_healthy(self) -> bool:
        return self.consecutive_failures < 3 and (
            self.success_count + self.failure_count == 0 or self.success_rate >= 30.0
        )

    def record_success(self, response_ms: float = 0.0, exit_ip: Optional[str] = None) -> None:
        self.success_count += 1
        self.consecutive_failures = 0
        self.last_used_ts = time.time()
        if exit_ip:
            self.last_ip = exit_ip
        if response_ms > 0:
            self._response_ms_sum += response_ms
            self._response_ms_count += 1

    def record_failure(self) -> None:
        self.failure_count += 1
        self.consecutive_failures += 1
        self.last_used_ts = time.time()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "location_id": self.location_id,
            "success_count": self.success_count,
            "failure_count": self.failure_count,
            "success_rate": round(self.success_rate, 1),
            "consecutive_failures": self.consecutive_failures,
            "is_healthy": self.is_healthy,
            "last_ip": self.last_ip,
            "avg_response_ms": round(self.avg_response_ms),
        }


# ── Rate limiter ──────────────────────────────────────────────────────────────

class _TokenBucket:
    """Simple token-bucket rate limiter for proxy requests."""

    def __init__(self, max_per_minute: int) -> None:
        self._max = max_per_minute
        self._tokens = float(max_per_minute)
        self._last_ts = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_ts
            self._tokens = min(self._max, self._tokens + elapsed * (self._max / 60.0))
            self._last_ts = now
            if self._tokens < 1.0:
                wait_s = (1.0 - self._tokens) / (self._max / 60.0)
                await asyncio.sleep(wait_s)
                self._tokens = 0.0
            else:
                self._tokens -= 1.0


# ── Core ProxyManager ─────────────────────────────────────────────────────────

class ProxyManager:
    """
    Resolves proxy config for geographic locations and tracks health.

    Usage — forward proxy (residential):
        kwargs = pm.aiohttp_kwargs("ae-dubai", session_type="rotating")
        async with session.get(url, **kwargs) as resp: ...

    Usage — reverse proxy (Cloudflare Worker):
        worker_url = pm.cf_worker_url(target_url)
        async with session.get(worker_url) as resp:
            colo = resp.headers.get('X-CF-Colo')

    Usage — unified (picks the right pattern automatically):
        result = await pm.fetch_with_retry(session, url, "ae-dubai")
    """

    def __init__(self) -> None:
        self.provider: str = os.getenv("ACTIVE_PROXY_PROVIDER", "").lower().strip()
        self._stats:   Dict[str, ProxyStats]   = {}
        self._sessions: Dict[str, str]         = {}   # location_id → sticky session_id
        self._rate_limiter = _TokenBucket(
            int(os.getenv("PROXY_RATE_LIMIT_RPM", "60"))
        )
        self._timeout_sec  = int(os.getenv("PROXY_TIMEOUT_SEC", "25"))
        self._max_retries  = int(os.getenv("PROXY_MAX_RETRIES", "3"))
        self._max_consec   = int(os.getenv("PROXY_MAX_CONSECUTIVE_FAILURES", "3"))

        # Cloudflare Worker config (loaded once)
        self._cf_worker_url    = os.getenv("CF_WORKER_URL", "").rstrip("/")
        self._cf_worker_secret = os.getenv("CF_WORKER_SECRET", "")

        if self.provider:
            log.info(f"ProxyManager initialised — provider: {self.provider}")
        else:
            log.info("ProxyManager: no provider configured, proxy features disabled")

    # ── Public API ───────────────────────────────────────────────────────────

    @property
    def enabled(self) -> bool:
        return bool(self.provider)

    @property
    def is_cloudflare(self) -> bool:
        return self.provider == "cloudflare"

    # ── Cloudflare Worker (reverse proxy) ────────────────────────────────────

    @property
    def cf_configured(self) -> bool:
        return bool(self._cf_worker_url)

    def cf_worker_url(self, target_url: str) -> str:
        """
        Build the Cloudflare Worker URL for a given target.
        The Worker fetches target_url from Cloudflare's edge and returns
        the response body plus X-CF-* geographic metadata headers.

        Raises RuntimeError if CF_WORKER_URL is not configured.
        """
        if not self._cf_worker_url:
            raise RuntimeError(
                "CF_WORKER_URL not set — deploy the worker and add CF_WORKER_URL to .env"
            )
        params: Dict[str, str] = {"url": target_url}
        if self._cf_worker_secret:
            params["secret"] = self._cf_worker_secret
        return f"{self._cf_worker_url}?{urlencode(params)}"

    async def cf_fetch(
        self,
        session: Any,
        target_url: str,
        *,
        ssl_ctx: Any = None,
    ) -> Tuple[Any, Dict[str, str]]:
        """
        Fetch target_url through the Cloudflare Worker.
        Returns (aiohttp response, cf_meta dict).

        cf_meta keys: colo, country, city, region, lat, lon,
                      response_ms, exit_ip, final_url
        """
        worker_url = self.cf_worker_url(target_url)
        req_kwargs: Dict[str, Any] = {}
        if ssl_ctx:
            req_kwargs["ssl"] = ssl_ctx

        resp = await session.get(worker_url, **req_kwargs)

        cf_meta = {
            "colo":        resp.headers.get("X-CF-Colo", ""),
            "country":     resp.headers.get("X-CF-Country", ""),
            "city":        resp.headers.get("X-CF-City", ""),
            "region":      resp.headers.get("X-CF-Region", ""),
            "lat":         resp.headers.get("X-CF-Lat", ""),
            "lon":         resp.headers.get("X-CF-Lon", ""),
            "response_ms": resp.headers.get("X-Proxy-Response-Ms", ""),
            "exit_ip":     resp.headers.get("X-Proxy-Exit-Ip", ""),
            "final_url":   resp.headers.get("X-Proxy-Final-Url", target_url),
        }
        log.debug(
            f"CF Worker [{cf_meta['colo']}] {target_url[:50]} → "
            f"HTTP {resp.status} in {cf_meta['response_ms']}ms"
        )
        return resp, cf_meta

    def get_proxy_url(
        self,
        location_id: str,
        *,
        session_type: str = "rotating",
        protocol: str = "http",
    ) -> Optional[str]:
        """
        Build and return the full proxy URL for a location.
        Returns None when proxy is not configured or location is unknown.
        """
        if not self.enabled:
            return None

        geo = LOCATION_MAP.get(location_id)
        if geo is None:
            log.warning(f"Unknown proxy location '{location_id}' — going direct")
            return None

        sticky = session_type == "sticky"
        session_id = self._get_or_create_session(location_id) if sticky else None

        # CF Worker uses URL rewriting, not a forward proxy — no proxy URL needed
        if self.provider == "cloudflare":
            return None

        builders = {
            "brightdata":  self._brightdata_url,
            "oxylabs":     self._oxylabs_url,
            "dataimpulse": self._dataimpulse_url,
            "iproyal":     self._iproyal_url,
            "decodo":      self._decodo_url,
        }
        builder = builders.get(self.provider)
        if builder is None:
            log.error(f"Unknown proxy provider '{self.provider}'")
            return None

        try:
            url = builder(geo["country"], geo["city"], session_id, protocol)
            log.debug(f"Proxy URL [{location_id}]: {self._redact(url)}")
            return url
        except KeyError as e:
            log.error(f"Missing env var for provider '{self.provider}': {e}")
            return None
        except Exception as e:
            log.error(f"Failed to build proxy URL for '{location_id}': {e}")
            return None

    def aiohttp_kwargs(
        self,
        location_id: str,
        *,
        session_type: str = "rotating",
        protocol: str = "http",
    ) -> Dict[str, Any]:
        """
        Return kwargs dict to spread into aiohttp session.get() / .post() etc.

        Example:
            kwargs = pm.aiohttp_kwargs("ae-dubai")
            async with session.get(url, **kwargs) as r:
                ...
        """
        proxy_url = self.get_proxy_url(
            location_id, session_type=session_type, protocol=protocol
        )
        if not proxy_url:
            return {}

        parsed = urlparse(proxy_url)
        if parsed.username and parsed.password:
            import aiohttp
            auth = aiohttp.BasicAuth(parsed.username, parsed.password)
            # Strip credentials from URL — aiohttp needs them separate
            clean = proxy_url.replace(f"{parsed.username}:{parsed.password}@", "")
            return {"proxy": clean, "proxy_auth": auth}

        return {"proxy": proxy_url}

    def playwright_proxy(
        self,
        location_id: str,
        *,
        session_type: str = "rotating",
    ) -> Optional[Dict[str, str]]:
        """
        Return a Playwright proxy dict for browser.new_context(proxy=...).

        Example:
            ctx = await browser.new_context(proxy=pm.playwright_proxy("ae-dubai"))
        """
        proxy_url = self.get_proxy_url(location_id, session_type=session_type)
        if not proxy_url:
            return None

        parsed = urlparse(proxy_url)
        cfg: Dict[str, str] = {
            "server": f"{parsed.scheme}://{parsed.hostname}:{parsed.port}",
        }
        if parsed.username:
            cfg["username"] = parsed.username
        if parsed.password:
            cfg["password"] = parsed.password
        return cfg

    async def fetch_with_retry(
        self,
        session: Any,         # aiohttp.ClientSession
        url: str,
        location_id: str,
        *,
        session_type: str = "rotating",
        retries: Optional[int] = None,
        ssl_ctx: Any = None,
    ) -> Tuple[Any, Dict[str, Any]]:
        """
        Unified fetch that automatically picks the correct proxy pattern:
          • "cloudflare" provider → reverse proxy via CF Worker URL rewrite
          • all other providers   → forward proxy via aiohttp proxy= kwarg

        Returns (aiohttp_response, metadata_dict).
        metadata_dict always contains:  status, ms, exit_ip, provider
        CF Worker also adds:            colo, city, country, region
        """
        import aiohttp

        max_tries = (retries if retries is not None else self._max_retries) + 1
        last_exc: Exception = RuntimeError("No retries attempted")

        for attempt in range(max_tries):
            await self._rate_limiter.acquire()
            t0 = time.perf_counter()

            try:
                # ── Cloudflare Worker (reverse proxy) ─────────────────────
                if self.is_cloudflare:
                    resp, cf_meta = await self.cf_fetch(session, url, ssl_ctx=ssl_ctx)
                    ms = (time.perf_counter() - t0) * 1000
                    self.mark_success(
                        location_id,
                        response_ms=float(cf_meta.get("response_ms") or ms),
                        exit_ip=cf_meta.get("exit_ip"),
                    )
                    meta = {
                        "status":   resp.status,
                        "ms":       round(ms),
                        "exit_ip":  cf_meta.get("exit_ip", ""),
                        "provider": "cloudflare",
                        "colo":     cf_meta.get("colo", ""),
                        "city":     cf_meta.get("city", ""),
                        "country":  cf_meta.get("country", ""),
                        "region":   cf_meta.get("region", ""),
                    }
                    return resp, meta

                # ── Residential forward proxy ──────────────────────────────
                proxy_kwargs = self.aiohttp_kwargs(location_id, session_type=session_type)
                if ssl_ctx:
                    proxy_kwargs["ssl"] = ssl_ctx

                resp = await session.get(url, allow_redirects=True, **proxy_kwargs)
                ms = (time.perf_counter() - t0) * 1000
                self.mark_success(location_id, response_ms=ms)
                meta = {
                    "status":   resp.status,
                    "ms":       round(ms),
                    "exit_ip":  "",
                    "provider": self.provider,
                }
                return resp, meta

            except (aiohttp.ClientProxyConnectionError,
                    aiohttp.ClientConnectorError,
                    aiohttp.ServerTimeoutError,
                    asyncio.TimeoutError) as exc:
                last_exc = exc
                self.mark_failure(location_id, str(exc))
                log.warning(
                    f"Proxy attempt {attempt+1}/{max_tries} [{location_id}] failed: "
                    f"{type(exc).__name__} — {str(exc)[:60]}"
                )
                if attempt < max_tries - 1:
                    await asyncio.sleep(2 ** attempt)   # 1s, 2s, 4s …

        raise last_exc

    # ── Health tracking ──────────────────────────────────────────────────────

    def mark_success(
        self,
        location_id: str,
        response_ms: float = 0.0,
        exit_ip: Optional[str] = None,
    ) -> None:
        self._stats_for(location_id).record_success(response_ms, exit_ip)

    def mark_failure(self, location_id: str, error: str = "") -> None:
        stats = self._stats_for(location_id)
        stats.record_failure()
        if stats.consecutive_failures >= self._max_consec:
            log.warning(
                f"[{location_id}] {stats.consecutive_failures} consecutive failures — "
                "rotating sticky session"
            )
            self.rotate_session(location_id)

    def rotate_session(self, location_id: str) -> str:
        """Force a new sticky session ID for this location."""
        sid = uuid.uuid4().hex[:12]
        self._sessions[location_id] = sid
        log.info(f"New session [{location_id}]: {sid}")
        return sid

    def get_health(self) -> List[Dict[str, Any]]:
        return [s.to_dict() for s in self._stats.values()]

    def get_location_health(self, location_id: str) -> Optional[Dict[str, Any]]:
        stats = self._stats.get(location_id)
        return stats.to_dict() if stats else None

    # ── Provider URL builders ────────────────────────────────────────────────

    def _brightdata_url(
        self, country: str, city: str, session_id: Optional[str], protocol: str
    ) -> str:
        """
        Bright Data residential / ISP proxy
        Docs: https://docs.brightdata.com/api-reference/proxy-manager
        Format: brd-customer-{CUST}-zone-{ZONE}-country-{cc}-city-{city}[-session-{id}]
        """
        customer = os.environ["BRIGHTDATA_CUSTOMER_ID"]
        zone     = os.environ["BRIGHTDATA_ZONE"]
        password = os.environ["BRIGHTDATA_PASSWORD"]
        port     = 22228 if protocol == "socks5" else int(
            os.getenv("BRIGHTDATA_HTTP_PORT", "22225")
        )
        user_parts = [
            f"brd-customer-{customer}-zone-{zone}",
            f"country-{country.lower()}",
            f"city-{city.lower()}",
        ]
        if session_id:
            user_parts.append(f"session-{session_id}")
        username = "-".join(user_parts)
        scheme = "socks5" if protocol == "socks5" else "http"
        return f"{scheme}://{username}:{password}@brd.superproxy.io:{port}"

    def _oxylabs_url(
        self, country: str, city: str, session_id: Optional[str], protocol: str
    ) -> str:
        """
        Oxylabs residential proxy
        Docs: https://developers.oxylabs.io/proxies/residential-proxies
        Format: customer-{USER}-cc-{CC}-city-{City}[-sessid-{id}]
        """
        user     = os.environ["OXYLABS_USERNAME"]
        password = os.environ["OXYLABS_PASSWORD"]
        port     = int(os.getenv("OXYLABS_PORT", "7777"))
        city_fmt = city.replace("+", "_").title()
        parts    = [f"customer-{user}-cc-{country}-city-{city_fmt}"]
        if session_id:
            parts.append(f"sessid-{session_id}")
        return f"http://{'-'.join(parts)}:{password}@pr.oxylabs.io:{port}"

    def _dataimpulse_url(
        self, country: str, city: str, session_id: Optional[str], protocol: str
    ) -> str:
        """
        DataImpulse residential proxy
        Docs: https://dataimpulse.com/docs
        Format: {user};country={CC};city={City}[;session={id}]
        """
        user     = os.environ["DATAIMPULSE_USERNAME"]
        password = os.environ["DATAIMPULSE_PASSWORD"]
        host     = os.getenv("DATAIMPULSE_HOST", "proxy.dataimpulse.com")
        port     = int(os.getenv("DATAIMPULSE_PORT", "823"))
        city_fmt = city.replace("+", " ")
        username = f"{user};country={country};city={city_fmt}"
        if session_id:
            username += f";session={session_id}"
        return f"http://{username}:{password}@{host}:{port}"

    def _iproyal_url(
        self, country: str, city: str, session_id: Optional[str], protocol: str
    ) -> str:
        """
        IPRoyal residential proxy
        Docs: https://iproyal.com/docs/residential
        Format: {user}_country-{CC}_city-{city}[_session-{id}_lifetime-30m]
        """
        user     = os.environ["IPROYAL_USERNAME"]
        password = os.environ["IPROYAL_PASSWORD"]
        port     = int(os.getenv("IPROYAL_PORT", "12321"))
        city_fmt = city.replace("+", "_")
        username = f"{user}_country-{country}_city-{city_fmt}"
        if session_id:
            username += f"_session-{session_id}_lifetime-30m"
        return f"http://{username}:{password}@geo.iproyal.com:{port}"

    def _decodo_url(
        self, country: str, city: str, session_id: Optional[str], protocol: str
    ) -> str:
        """
        Decodo (formerly Smartproxy) residential proxy
        Docs: https://help.decodo.com/docs/residential-proxies
        Format: user-{USER}-country-{cc}-city-{city}[-session-{id}]
        """
        user     = os.environ["DECODO_USERNAME"]
        password = os.environ["DECODO_PASSWORD"]
        port     = int(
            os.getenv("DECODO_SOCKS5_PORT", "7001")
            if protocol == "socks5"
            else os.getenv("DECODO_HTTP_PORT", "7000")
        )
        city_fmt = city.replace("+", "-")
        parts    = [f"user-{user}-country-{country.lower()}-city-{city_fmt}"]
        if session_id:
            parts.append(f"session-{session_id}")
        scheme = "socks5" if protocol == "socks5" else "http"
        return f"{scheme}://{'-'.join(parts)}:{password}@gate.decodo.com:{port}"

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _get_or_create_session(self, location_id: str) -> str:
        if location_id not in self._sessions:
            self._sessions[location_id] = uuid.uuid4().hex[:12]
        return self._sessions[location_id]

    def _stats_for(self, location_id: str) -> ProxyStats:
        if location_id not in self._stats:
            self._stats[location_id] = ProxyStats(location_id=location_id)
        return self._stats[location_id]

    @staticmethod
    def _redact(url: str) -> str:
        """Remove password from URL for safe logging."""
        try:
            p = urlparse(url)
            if p.password:
                return url.replace(p.password, "***")
        except Exception:
            pass
        return url


# ── Module-level singleton ────────────────────────────────────────────────────
# Import this in main.py:  from proxy_manager import proxy_manager
proxy_manager = ProxyManager()
