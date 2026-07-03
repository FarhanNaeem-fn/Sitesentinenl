// src/config/userGuides.ts
// All User Guide content for every tab — rendered in the side-panel modal

export const UG_QA_SCAN = {
  title:   'QA Scan Engine',
  icon:    '🔍',
  color:   '#0080FF',
  tagline: 'Full-page automated website quality audit — 12 check categories',
  sections: [
    {
      title: 'What It Does',
      items: [
        'Launches a real Chromium browser and visits your URL.',
        'Runs up to 12 check categories: SEO, Accessibility, Performance, Security, Broken Links, Mixed Content, Responsive, Console Errors, Content Verification, and Site Health.',
        'Streams results live to the Output Log.',
        'Calculates a Site Health Score (0–100) based on pass/fail ratio.',
        'Saves a JSON report to the reports/ folder for download.',
      ],
    },
    {
      title: 'Step-by-Step',
      items: [
        'Enter the full URL (https://...) in the Target URL field.',
        'Choose a viewport: Desktop (1920×1080), Mac (1440×900), Laptop (1366×768), Mobile (430×932).',
        'Set Max Pages to crawl (1–50).',
        'Optionally add a Figma reference URL for design comparison.',
        'Toggle the check categories you want to run.',
        'Click ▶ Run QA Scan — the scan takes 20–90 seconds.',
        'Watch the Output Log for live results.',
        'Download the JSON report when complete.',
      ],
    },
    {
      title: 'Understanding the Health Score',
      items: [
        '90–100 = Excellent: site is production-ready.',
        '70–89 = Good: minor issues to address.',
        '50–69 = Needs Attention: significant issues found.',
        '0–49 = Critical: major problems affecting users.',
        'The score is calculated as (checks passed) ÷ (total checks) × 100.',
      ],
    },
  ],
}

export const UG_LOAD = {
  title:   'Load Testing',
  icon:    '⚡',
  color:   '#1565C0',
  tagline: 'Simulate concurrent users and measure performance under load',
  sections: [
    {
      title: 'Test Types',
      items: [
        'Load — normal production load at expected user count.',
        'Stress — push beyond capacity to find the breaking point.',
        'Endurance / Soak — sustained load to detect memory leaks.',
        'Spike — sudden 10× surge to test auto-scaling.',
        'Breakpoint — slow ramp until the system breaks.',
        'Ramp-Up — gradual increase to validate growth handling.',
      ],
    },
    {
      title: 'Unicorn Suite',
      items: [
        'Tests complete user journeys, not just a single endpoint.',
        'Scenarios: Login→Browse→Checkout, Search→Filter→View, API Auth→CRUD, Homepage→Nav→Form.',
        'Adds custom HTTP headers (e.g. Authorization tokens).',
        'Reports per-step pass/fail and response time.',
      ],
    },
    {
      title: 'Step-by-Step',
      items: [
        'Select a test type by clicking one of the 6 strategy cards.',
        'Enter the Target URL.',
        'Set Virtual Users, Duration, Ramp-Up time, and Think Time.',
        'Click ⚡ Run Load Test.',
        'Watch the Live Metrics panel and RPS/Latency chart update in real time.',
        'For Unicorn Suite: select a scenario, add headers if needed, click 🦄 Run.',
      ],
    },
    {
      title: 'Key Metrics',
      items: [
        'RPS — Requests per second. Higher = more throughput.',
        'P50 — 50% of requests complete under this time.',
        'P95 — 95% of requests complete under this time (SLA target).',
        'P99 — 99% of requests. Spikes here indicate tail latency.',
        'Error% — percentage of requests returning 4xx/5xx.',
      ],
    },
  ],
}

export const UG_PAGINATION = {
  title:   'Pagination Tester',
  icon:    '📄',
  color:   '#006644',
  tagline: 'Validate API pagination — no duplicates, no missing records',
  sections: [
    {
      title: 'What It Tests',
      items: [
        'Walks through every page of a paginated API and collects all record IDs.',
        'Detects duplicate IDs across pages.',
        'Detects missing records (total expected vs total found).',
        'Validates sort order consistency across pages.',
        'Supports {page} and {size} URL template variables.',
      ],
    },
    {
      title: 'Step-by-Step',
      items: [
        'Enter the API URL pattern — use {page} and {size} placeholders, or leave them out and pagination params will be appended automatically.',
        'Set Total Records Expected (e.g. 500).',
        'Set Records Per Page (e.g. 20).',
        'Set the ID Field name (default: id).',
        'Click ▶ Run Pagination Test.',
        'Review the page-by-page results table for duplicates and errors.',
      ],
    },
  ],
}

export const UG_INTL = {
  title:   'International QA',
  icon:    '🌐',
  color:   '#6A1B9A',
  tagline: 'Multi-locale testing — hreflang, charset, RTL/LTR, date/number formats',
  sections: [
    {
      title: 'What It Checks Per Region',
      items: [
        'hreflang tag — is the correct locale declared in the HTML?',
        'Charset — is the page served as UTF-8?',
        'Text direction — does RTL content (Arabic, Urdu, Persian) have dir="rtl"?',
        'Accept-Language header — does the server respond correctly?',
        'Page renders without layout breaks in that locale.',
      ],
    },
    {
      title: 'Supported Regions',
      items: [
        '16 regions: UK, US, Germany, France, Japan, China, UAE (RTL), Pakistan (RTL), Iran (RTL), India, Brazil, Spain, South Korea, Russia, Turkey, Netherlands.',
        'RTL regions (ar-AE, ur-PK, fa-IR) are highlighted with a purple badge.',
        'Select All / Clear All buttons for quick region management.',
      ],
    },
    {
      title: 'Step-by-Step',
      items: [
        'Enter the target URL.',
        'Select the regions to test by clicking their cards.',
        'Click 🌐 Run International QA.',
        'Review the results table — check hreflang, charset, and dir columns.',
        'Pass = hreflang present + UTF-8 charset. Warn = missing hreflang.',
      ],
    },
  ],
}

export const UG_LIGHTHOUSE = {
  title:   'Lighthouse Audit',
  icon:    '💡',
  color:   '#F59E0B',
  tagline: "Google Lighthouse — Performance, Accessibility, SEO, Best Practices & PWA",
  sections: [
    {
      title: 'Prerequisites',
      items: [
        'Node.js v18+ must be installed: https://nodejs.org',
        'Install Lighthouse CLI: npm install -g lighthouse',
        'Verify: lighthouse --version (should show 11.x or newer).',
        'Google Chrome must be installed on this machine.',
        'Without Lighthouse installed, the tool runs in simulation mode.',
      ],
    },
    {
      title: 'Step-by-Step',
      items: [
        'Enter the target URL.',
        'Choose Device Mode: Desktop (1920×1080) or Mobile (Moto G4 emulation).',
        'Choose Browser Mode: Headless (fastest, no window) or Visible (Chrome window opens for debugging).',
        'Select audit categories — toggle the 5 pills.',
        'Click 💡 Run Lighthouse Audit — takes 30–90 seconds.',
        'Read the Score Gauges — one per category, color-coded.',
        'Read Core Web Vitals: LCP, FID/INP, CLS, FCP, Speed Index, TBT, TTFB.',
        'Browse Audit Findings for specific issues and fix recommendations.',
      ],
    },
    {
      title: 'Score Scale',
      items: [
        '90–100 = Good (green) — production ready.',
        '50–89 = Needs Improvement (amber) — real users are affected.',
        '0–49 = Poor (red) — significant performance or accessibility problems.',
        'Performance score is most affected by network throttling (Lighthouse uses Slow 4G).',
      ],
    },
    {
      title: 'Browser Modes',
      items: [
        'Headless — Chrome runs in the background, no window, fastest. Best for CI/CD.',
        'Visible — A real Chrome window opens and you can watch the audit. Best for debugging.',
        'Both modes produce identical results — only the UI visibility differs.',
      ],
    },
  ],
}

export const UG_MOBILE = {
  title:   'Mobile App Testing',
  icon:    '📱',
  color:   '#3DDC84',
  tagline: 'Android APK + iOS IPA automated testing via ADB and Appium',
  sections: [
    {
      title: 'Android Prerequisites',
      items: [
        'Install Android Studio (includes ADB): https://developer.android.com/studio',
        'Install Java JDK 17+: https://openjdk.org and set JAVA_HOME.',
        'Install Appium: npm install -g appium',
        'Install UiAutomator2 driver: appium driver install uiautomator2',
        'Start emulator in Android Studio or connect USB device with debugging enabled.',
        'Verify: adb devices (should list your device).',
      ],
    },
    {
      title: 'iOS Prerequisites (macOS only)',
      items: [
        'macOS is required — iOS testing cannot run on Windows or Linux.',
        'Install Xcode 15+ from the Mac App Store.',
        'Install XCUITest driver: appium driver install xcuitest',
        'Boot an iOS Simulator: Xcode → Devices & Simulators.',
        'Verify: xcrun simctl list devices booted',
      ],
    },
    {
      title: 'Step-by-Step',
      items: [
        'Select Platform: Android (APK) or iOS (IPA).',
        'Upload your build file using the file picker — metadata is auto-read.',
        'Enter Device Name (e.g. Pixel_6_API_34) or UDID for real device.',
        'Set OS Version (e.g. 14.0) — leave blank for auto-detect.',
        'Choose Browser/Driver Mode: Headless (no emulator window) or Visible (shows emulator).',
        'Set Appium URL — start Appium first: appium (default: http://127.0.0.1:4723).',
        'Click Install on Device to push the APK/IPA.',
        'Select test checks and click 📱 Run Mobile Tests.',
        'Download the JSON or HTML report when complete.',
      ],
    },
    {
      title: 'Test Checks Explained',
      items: [
        'App Launch — starts app via ADB am start, verifies process is running.',
        'Crash Detection — scans ADB logcat for FATAL EXCEPTION / ANR.',
        'Memory — uses dumpsys meminfo, fails if app uses > 250 MB.',
        'Network — pings 8.8.8.8 from the device.',
        'Accessibility — counts Appium elements with content-desc attributes.',
        'Security — checks allowBackup, debuggable, network security config.',
      ],
    },
  ],
}

export const UG_BASELINE = {
  title:   'User Baseline Testing',
  icon:    '👤',
  color:   '#6554C0',
  tagline: 'Normal User (30 checks) + AI Board (10 modules) — full comparative baseline',
  sections: [
    {
      title: 'Normal User Baseline (30 checks)',
      items: [
        'Evaluates the site from the perspective of a real user.',
        'Checks: first impressions, navigation clarity, content readability, CTA visibility, mobile usability, load speed perception, error messages, form usability, search functionality, accessibility basics, and 20 more.',
        'Score: (checks passed) ÷ 30 × 100.',
        'Uses live Playwright checks where possible (font size, nav presence, image alt, etc.).',
      ],
    },
    {
      title: 'AI Board Baseline (10 modules)',
      items: [
        'Evaluates 10 strategic modules: Security Posture, SEO Score, Performance Budget, Content Strategy, UX Audit, Technical Debt, Accessibility Score, Analytics Readiness, API Health, Mobile Readiness.',
        'Each module returns a score (0–100) and a diagnostic detail.',
        'Score: average across all 10 modules.',
        'Uses real data where available (HTTPS, title, meta, TTFB, alt text, viewport, etc.).',
      ],
    },
    {
      title: 'Step-by-Step',
      items: [
        'Enter the target URL.',
        'Select one or both baseline modes.',
        'Click 👤 Run Baseline — takes 30–90 seconds.',
        'Read the score rings: Normal User, AI Board, Combined.',
        'Expand the detailed results tabs to see per-check results.',
        'Download the JSON report for stakeholder sharing.',
      ],
    },
  ],
}

export const UG_SITE_HEALTH = {
  title:   'Site Health & Domain Analysis',
  icon:    '🏥',
  color:   '#006644',
  tagline: 'SSL, DNS, uptime, headers, performance, and technology detection',
  sections: [
    {
      title: 'What It Checks',
      items: [
        'SSL — verifies the certificate is valid and shows days until expiry.',
        'DNS — confirms the domain resolves to an IP address.',
        'HTTP Security Headers — checks for HSTS, CSP, X-Frame-Options, X-Content-Type, Referrer-Policy.',
        'Response Time — 3 requests averaged, fails if > 2000ms.',
        'Uptime — checks the server returns HTTP < 500.',
        'Robots.txt — confirms /robots.txt is present.',
        'Sitemap.xml — confirms /sitemap.xml is present.',
        'Technology Detection — WordPress, Shopify, React/Next.js, Angular, Vue, jQuery.',
      ],
    },
    {
      title: 'Step-by-Step',
      items: [
        'Enter the domain (with or without https://).',
        'Toggle the specific checks you want to run.',
        'Click 🏥 Run Site Health Check.',
        'Read the check cards — green = pass, red = fail.',
        'The overall score is (passed checks) ÷ (total checks) × 100.',
      ],
    },
  ],
}
