"""
SiteSentinel — shared configuration, constants, and infrastructure utilities.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

# ── Environment ───────────────────────────────────────────────────────────────

def _resolve_browser_ws() -> str:
    val = os.environ.get("BROWSER_WS_ENDPOINT", "") or os.environ.get("BROWSERLESS_API_KEY", "")
    if not val:
        return ""
    if val.startswith("ws://") or val.startswith("wss://"):
        return val
    return f"wss://production-sfo.browserless.io/chromium?token={val}"

BROWSER_WS: str = _resolve_browser_ws()
IS_VERCEL: bool = os.environ.get("VERCEL") == "1"

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("sitesentinel")

# ── Directories ───────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).parent
REPORTS_DIR = BASE_DIR / "reports"
REPORTS_DIR.mkdir(exist_ok=True)
UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

if IS_VERCEL:
    REPORTS_DIR = Path("/tmp/reports")
    REPORTS_DIR.mkdir(exist_ok=True)
    UPLOADS_DIR = Path("/tmp/uploads")
    UPLOADS_DIR.mkdir(exist_ok=True)

AI_RANKING_DIR = BASE_DIR / "ai_ranking"
AI_RANKING_DIR.mkdir(exist_ok=True)

# ── ProactorEventLoop helper (Windows) ───────────────────────────────────────

def _run_in_proactor(coro):
    """Run *coro* on a fresh ProactorEventLoop in a background thread (Windows)."""
    result = [None]
    exc = [None]

    def _worker():
        try:
            if sys.platform == "win32":
                loop = asyncio.ProactorEventLoop()
                asyncio.set_event_loop(loop)
                try:
                    result[0] = loop.run_until_complete(coro)
                finally:
                    loop.close()
            else:
                result[0] = asyncio.run(coro)
        except Exception as e:
            exc[0] = e

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    t.join()
    if exc[0] is not None:
        raise exc[0]
    return result[0]

# ── Scan constants ────────────────────────────────────────────────────────────

SEV = {
    "CRITICAL": "CRITICAL",
    "HIGH":     "HIGH",
    "MEDIUM":   "MEDIUM",
    "LOW":      "LOW",
    "INFO":     "INFO",
}

CONFIG = {
    "SCAN_GOTO_TIMEOUT": 60000,
    "SCAN_IDLE_TIMEOUT": 5000,
    "MAX_PAGES_DEFAULT": 8,
}

TEST_TYPE_ALIASES = {
    "performance": "load",
    "load":        "load",
    "stress":      "stress",
    "spike":       "spike",
    "breakpoint":  "breakpoint",
    "breakpoints": "breakpoint",
    "rampup":      "rampup",
    "ramp-up":     "rampup",
    "endurance":   "endurance",
    "stability":   "endurance",
}

def _normalize_load_test_type(kind: str) -> str:
    key = str(kind or "load").strip().lower().replace(" ", "").replace("_", "").replace("-", "")
    return TEST_TYPE_ALIASES.get(key, "load")

VIEWPORTS = {
    "desktop": {"width": 1920, "height": 1080, "label": "Desktop (1920×1080) — Chrome"},
    "mac":     {"width": 1440, "height": 900,  "label": "MacBook Pro (1440×900) — Safari"},
    "laptop":  {"width": 1366, "height": 768,  "label": "Generic Laptop (1366×768)"},
    "mobile":  {"width": 390,  "height": 844,  "label": "iPhone 14 Pro (390×844)"},
}

# ── Location metadata ─────────────────────────────────────────────────────────

LOCATION_META: Dict[str, dict] = {
    "anywhere":         {"name": "Anywhere (Default)",      "flag": "🌐", "lat": 0.10, "region": "Global"},
    "us-new-york":      {"name": "New York, US",            "flag": "🇺🇸", "lat": 0.70, "region": "North America"},
    "us-california":    {"name": "California, US",          "flag": "🇺🇸", "lat": 0.75, "region": "North America"},
    "ca-toronto":       {"name": "Toronto, Canada",         "flag": "🇨🇦", "lat": 0.65, "region": "North America"},
    "mx-mexico-city":   {"name": "Mexico City",             "flag": "🇲🇽", "lat": 0.60, "region": "North America"},
    "br-sao-paulo":     {"name": "São Paulo, Brazil",       "flag": "🇧🇷", "lat": 0.55, "region": "South America"},
    "ar-buenos-aires":  {"name": "Buenos Aires",            "flag": "🇦🇷", "lat": 0.50, "region": "South America"},
    "uk-london":        {"name": "London, UK",              "flag": "🇬🇧", "lat": 0.25, "region": "Europe"},
    "de-frankfurt":     {"name": "Frankfurt, Germany",      "flag": "🇩🇪", "lat": 0.20, "region": "Europe"},
    "fr-paris":         {"name": "Paris, France",           "flag": "🇫🇷", "lat": 0.22, "region": "Europe"},
    "nl-amsterdam":     {"name": "Amsterdam, Netherlands",  "flag": "🇳🇱", "lat": 0.20, "region": "Europe"},
    "se-stockholm":     {"name": "Stockholm, Sweden",       "flag": "🇸🇪", "lat": 0.18, "region": "Europe"},
    "pl-warsaw":        {"name": "Warsaw, Poland",          "flag": "🇵🇱", "lat": 0.22, "region": "Europe"},
    "it-milan":         {"name": "Milan, Italy",            "flag": "🇮🇹", "lat": 0.23, "region": "Europe"},
    "es-madrid":        {"name": "Madrid, Spain",           "flag": "🇪🇸", "lat": 0.24, "region": "Europe"},
    "ru-moscow":        {"name": "Moscow, Russia",          "flag": "🇷🇺", "lat": 0.30, "region": "Europe/Asia"},
    "tr-istanbul":      {"name": "Istanbul, Turkey",        "flag": "🇹🇷", "lat": 0.28, "region": "Europe/Asia"},
    "ae-dubai":         {"name": "Dubai, UAE",              "flag": "🇦🇪", "lat": 0.35, "region": "Middle East"},
    "sa-riyadh":        {"name": "Riyadh, Saudi Arabia",    "flag": "🇸🇦", "lat": 0.40, "region": "Middle East"},
    "il-tel-aviv":      {"name": "Tel Aviv, Israel",        "flag": "🇮🇱", "lat": 0.32, "region": "Middle East"},
    "iq-baghdad":       {"name": "Baghdad, Iraq",           "flag": "🇮🇶", "lat": 0.38, "region": "Middle East"},
    "kw-kuwait":        {"name": "Kuwait City",             "flag": "🇰🇼", "lat": 0.37, "region": "Middle East"},
    "om-muscat":        {"name": "Muscat, Oman",            "flag": "🇴🇲", "lat": 0.36, "region": "Middle East"},
    "pk-karachi":       {"name": "Karachi, Pakistan",       "flag": "🇵🇰", "lat": 0.50, "region": "South Asia"},
    "in-mumbai":        {"name": "Mumbai, India",           "flag": "🇮🇳", "lat": 0.45, "region": "South Asia"},
    "in-bangalore":     {"name": "Bangalore, India",        "flag": "🇮🇳", "lat": 0.46, "region": "South Asia"},
    "bd-dhaka":         {"name": "Dhaka, Bangladesh",       "flag": "🇧🇩", "lat": 0.48, "region": "South Asia"},
    "lk-colombo":       {"name": "Colombo, Sri Lanka",      "flag": "🇱🇰", "lat": 0.47, "region": "South Asia"},
    "sg-singapore":     {"name": "Singapore",               "flag": "🇸🇬", "lat": 0.42, "region": "Southeast Asia"},
    "id-jakarta":       {"name": "Jakarta, Indonesia",      "flag": "🇮🇩", "lat": 0.44, "region": "Southeast Asia"},
    "ph-manila":        {"name": "Manila, Philippines",     "flag": "🇵🇭", "lat": 0.46, "region": "Southeast Asia"},
    "my-kuala-lumpur":  {"name": "Kuala Lumpur, Malaysia",  "flag": "🇲🇾", "lat": 0.40, "region": "Southeast Asia"},
    "th-bangkok":       {"name": "Bangkok, Thailand",       "flag": "🇹🇭", "lat": 0.42, "region": "Southeast Asia"},
    "vn-hanoi":         {"name": "Hanoi, Vietnam",          "flag": "🇻🇳", "lat": 0.43, "region": "Southeast Asia"},
    "jp-tokyo":         {"name": "Tokyo, Japan",            "flag": "🇯🇵", "lat": 0.55, "region": "East Asia"},
    "cn-shanghai":      {"name": "Shanghai, China",         "flag": "🇨🇳", "lat": 0.50, "region": "East Asia"},
    "kr-seoul":         {"name": "Seoul, South Korea",      "flag": "🇰🇷", "lat": 0.52, "region": "East Asia"},
    "au-sydney":        {"name": "Sydney, Australia",       "flag": "🇦🇺", "lat": 0.60, "region": "Oceania"},
    "nz-auckland":      {"name": "Auckland, New Zealand",   "flag": "🇳🇿", "lat": 0.62, "region": "Oceania"},
    "za-cape-town":     {"name": "Cape Town, South Africa", "flag": "🇿🇦", "lat": 0.45, "region": "Africa"},
    "ng-lagos":         {"name": "Lagos, Nigeria",          "flag": "🇳🇬", "lat": 0.48, "region": "Africa"},
    "eg-cairo":         {"name": "Cairo, Egypt",            "flag": "🇪🇬", "lat": 0.38, "region": "Africa/MENA"},
    "ke-nairobi":       {"name": "Nairobi, Kenya",          "flag": "🇰🇪", "lat": 0.47, "region": "Africa"},
    "gh-accra":         {"name": "Accra, Ghana",            "flag": "🇬🇭", "lat": 0.46, "region": "Africa"},
}
