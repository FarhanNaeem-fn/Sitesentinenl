"""
SiteSentinel — all Pydantic request/response models.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class QAScanRequest(BaseModel):
    url: str
    viewport: str = "desktop"
    max_pages: int = 5
    figma_url: str = ""
    checks: List[str] = [
        "seo", "accessibility", "performance", "broken_links",
        "security", "mixed_content", "responsive", "console",
        "content", "health_score",
    ]
    locations: List[str] = []
    use_proxy: bool = False
    proxy_session_type: str = "rotating"
    proxy_protocol: str = "http"


class LoadTestRequest(BaseModel):
    url: str
    test_type: str = "load"
    test_types: Optional[List[str]] = None
    virtual_users: int = 100
    duration_min: int = 2
    ramp_up_sec: int = 30
    think_time_ms: int = 500
    timeout_sec: int = 30


class UnicornRequest(BaseModel):
    url: str
    scenario: str = "login_browse_checkout"
    headers: Dict[str, str] = {}
    virtual_users: int = 50
    duration_min: int = 2


class PaginationRequest(BaseModel):
    url: str
    total_records: int = 500
    per_page: int = 20
    id_field: str = "id"
    sort_field: str = "created_at"
    sort_dir: str = "ASC"


class IntlRequest(BaseModel):
    url: str
    locales: List[str] = ["en-GB", "en-US", "ar-AE"]


class UserBaselineRequest(BaseModel):
    url: str
    modes: List[str] = ["normal", "ai"]


class LighthouseRequest(BaseModel):
    url: str
    device: str = "desktop"
    categories: List[str] = ["performance", "accessibility", "best-practices", "seo"]
    browser_mode: str = "headless"


class MobileTestRequest(BaseModel):
    platform: str = "android"
    build_path: str = ""
    device: str = ""
    os_version: str = ""
    appium_url: str = "http://127.0.0.1:4723"
    test_type: str = "full"
    browser_mode: str = "headless"
    checks: List[str] = [
        "launch", "ui_render", "touch", "nav", "network", "memory",
        "crash_det", "perms", "a11y_chk", "sec_chk",
    ]


class APITestRequest(BaseModel):
    url: str
    method: str = "GET"
    headers: Dict[str, str] = {}
    body: str = ""
    assert_status: int = 200
    assert_contains: str = ""
    checks: List[str] = []


class MultiLocationRequest(BaseModel):
    url: str
    locations: List[str] = ["ae-dubai", "pk-karachi", "sa-riyadh"]
    use_proxy: bool = False
    proxy_session_type: str = "rotating"
    proxy_protocol: str = "http"


class TestCasesRunRequest(BaseModel):
    url: str
    test_cases: List[Any]
    viewport: str = "desktop"
    login_username: str = ""
    login_password: str = ""


class LoginCredentialsRequest(BaseModel):
    username: str
    password: str


class SiteHealthRequest(BaseModel):
    domain: str
    checks: List[str] = [
        "ssl", "dns", "whois", "headers", "performance", "uptime",
        "blacklist", "technology", "social", "sitemap",
    ]


class AIFeaturesConfig(BaseModel):
    enabled_modules: List[str] = []


class AIAnalysisRequest(BaseModel):
    url: str = ""
    health_score: Optional[int] = None
    total_issues: Optional[int] = None
    pages_scanned: Optional[int] = None
    details: Optional[Dict[str, Any]] = None
    image_issues: Optional[List] = None
    link_issues: Optional[List] = None
    test_cases: Optional[List] = None


class AIRankingRequest(BaseModel):
    url: str
    competitor_urls: List[str] = []
    use_llm: bool = False
    llm_api_key: str = ""
    checks: List[str] = ["robots", "technical", "content", "trust", "structured_data", "competitors"]


class SuperLighthouseRequest(BaseModel):
    url: str
    compare_url: str = ""
    devices: List[str] = ["desktop", "mobile"]
    categories: List[str] = ["performance", "accessibility", "best-practices", "seo"]
    modules: List[str] = [
        "security", "third_party", "spa", "multi_device",
        "crux", "accessibility_deep", "network",
    ]
    browser_mode: str = "headless"
