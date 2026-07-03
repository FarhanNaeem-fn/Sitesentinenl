"""
SiteSentinel — Centralized enterprise report engine.

Provides ReportBuilder (fluent API) + build_master_report() used by every
scanner and the /scan/master-report endpoint.
"""
from __future__ import annotations

import html as _html
import json
from datetime import datetime
from typing import Any, Dict, List, Optional


# ── Shared helpers ────────────────────────────────────────────────────────────

def _esc(v: Any) -> str:
    return _html.escape(str(v or ""))

def _score_col(s) -> str:
    try: s = float(s)
    except Exception: return "#8B949E"
    if s >= 90: return "#22C55E"
    if s >= 75: return "#3B82F6"
    if s >= 50: return "#F59E0B"
    return "#EF4444"

def _grade(s) -> str:
    try: s = int(s)
    except Exception: return "F"
    if s >= 90: return "A"
    if s >= 80: return "B"
    if s >= 70: return "C"
    if s >= 60: return "D"
    return "F"

def _sev_col(sev: str) -> str:
    return {
        "critical": "#EF4444", "high": "#F97316",
        "medium":   "#F59E0B", "low":  "#3B82F6",
        "info":     "#8B949E", "pass": "#22C55E",
    }.get(str(sev).lower(), "#8B949E")

def _sev_bg(sev: str) -> str:
    return {
        "critical": "rgba(239,68,68,.12)",  "high": "rgba(249,115,22,.12)",
        "medium":   "rgba(245,158,11,.12)", "low":  "rgba(59,130,246,.12)",
        "info":     "rgba(139,92,246,.12)", "pass": "rgba(34,197,94,.12)",
    }.get(str(sev).lower(), "rgba(139,92,246,.12)")

def _priority_order(sev: str) -> int:
    return {"critical":0,"high":1,"medium":2,"low":3,"info":4,"pass":5}.get(
        str(sev).lower(), 9)


# ── Enterprise CSS ─────────────────────────────────────────────────────────────

ENTERPRISE_CSS = """<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');

/* ── Reset & Base ── */
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0D1117;--bg2:#161B22;--bg3:#1C2128;--bg4:#21262D;
  --border:#30363D;--border2:#21262D;
  --text:#C9D1D9;--text2:#8B949E;--text3:#484F58;--white:#F0F6FC;
  --pass:#22C55E;--high:#F97316;--warn:#F59E0B;--fail:#EF4444;
  --info:#3B82F6;--pur:#A855F7;--cyan:#06B6D4;
  --critical:#EF4444;--medium:#F59E0B;--low:#3B82F6;
}
html{scroll-behavior:smooth}
body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);
  line-height:1.6;-webkit-font-smoothing:antialiased;font-size:14px}
a{color:#58A6FF;text-decoration:none}
a:hover{text-decoration:underline}
summary{cursor:pointer;list-style:none}
summary::-webkit-details-marker{display:none}

/* ── Layout ── */
.rpt-wrap{max-width:1240px;margin:0 auto;padding:0 0 60px}
.rpt-inner{padding:0 40px}

/* ── Top Banner ── */
.rpt-banner{
  background:linear-gradient(135deg,#0a0f1a 0%,#0f1523 40%,#131b28 70%,#0d1117 100%);
  border-bottom:1px solid var(--border);padding:40px 40px 32px;position:relative;overflow:hidden
}
.rpt-banner::before{
  content:'';position:absolute;top:-80px;right:-80px;width:360px;height:360px;
  background:radial-gradient(circle,rgba(59,130,246,.08) 0%,transparent 70%);pointer-events:none
}
.rpt-banner-inner{max-width:1240px;margin:0 auto;display:flex;align-items:flex-start;gap:32px}
.rpt-brand{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.rpt-brand-dot{width:8px;height:8px;border-radius:50%;background:var(--pass);
  box-shadow:0 0 8px var(--pass);flex-shrink:0}
.rpt-brand-name{font-size:11px;font-weight:700;letter-spacing:3px;
  text-transform:uppercase;color:var(--text3)}
.rpt-banner h1{font-size:28px;font-weight:900;color:var(--white);line-height:1.2;margin-bottom:8px}
.rpt-banner-meta{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text2);
  display:flex;flex-wrap:wrap;gap:16px;margin-top:10px}
.rpt-banner-meta span{color:var(--text)}
.rpt-banner-right{margin-left:auto;display:flex;gap:20px;align-items:center;flex-shrink:0}

/* ── SVG Score Ring ── */
.score-ring-svg{display:block}
.score-ring-val{font-size:30px;font-weight:900;font-family:'Inter',sans-serif}
.score-ring-sub{font-size:10px;font-family:'Inter',sans-serif;letter-spacing:1px}

/* ── Grade Box ── */
.grade-box{text-align:center;padding:8px 20px;border-radius:12px;
  background:var(--bg2);border:1px solid var(--border)}
.grade-letter{font-size:48px;font-weight:900;line-height:1}
.grade-label{font-size:9px;text-transform:uppercase;letter-spacing:2px;
  color:var(--text3);margin-top:2px}

/* ── Status Bar (KPI strip) ── */
.rpt-kpi-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
  gap:1px;background:var(--border2);border-top:1px solid var(--border2)}
.rpt-kpi{background:var(--bg2);padding:22px 20px 18px;border-top:3px solid transparent;
  transition:background .15s}
.rpt-kpi:hover{background:var(--bg3)}
.rpt-kpi-val{font-size:30px;font-weight:900;color:var(--white);line-height:1;margin-bottom:5px}
.rpt-kpi-label{font-size:10px;font-weight:700;text-transform:uppercase;
  letter-spacing:.07em;color:var(--text2);margin-bottom:2px}
.rpt-kpi-sub{font-size:11px;color:var(--text3)}

/* ── Section containers ── */
.rpt-section{margin:36px 0}
.rpt-section-hdr{display:flex;align-items:center;gap:12px;margin-bottom:20px;
  padding-bottom:14px;border-bottom:1px solid var(--border2)}
.rpt-section-icon{font-size:22px;flex-shrink:0}
.rpt-section-title{font-size:18px;font-weight:800;color:var(--white)}
.rpt-section-sub{font-size:12px;color:var(--text2);margin-top:2px}
.rpt-section-badge{margin-left:auto;font-size:11px;font-weight:700;
  font-family:'JetBrains Mono',monospace}

/* ── Cards ── */
.rpt-card{background:var(--bg2);border:1px solid var(--border);
  border-radius:16px;overflow:hidden;margin-bottom:20px}
.rpt-card-hdr{padding:16px 22px;border-bottom:1px solid var(--border);
  display:flex;align-items:center;gap:10px;background:var(--bg3)}
.rpt-card-hdr-icon{font-size:16px;flex-shrink:0}
.rpt-card-hdr-title{font-size:13px;font-weight:700;color:var(--white);letter-spacing:.02em}
.rpt-card-body{padding:22px}
.rpt-card-body-np{padding:0}

/* ── Score Panel (multi-gauge row) ── */
.rpt-scores-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));
  gap:16px;padding:24px}
.rpt-score-item{text-align:center;padding:20px 12px;background:var(--bg3);
  border-radius:12px;border:1px solid var(--border2)}
.rpt-score-num{font-size:32px;font-weight:900;line-height:1;margin-bottom:4px}
.rpt-score-label{font-size:10px;text-transform:uppercase;letter-spacing:.07em;
  color:var(--text2);font-weight:700}
.rpt-score-bar{height:4px;background:var(--border);border-radius:2px;
  margin-top:8px;overflow:hidden}
.rpt-score-bar-fill{height:100%;border-radius:2px;transition:width .5s}

/* ── Chart containers ── */
.rpt-charts-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));
  gap:20px;padding:24px}
.rpt-chart-box{background:var(--bg3);border-radius:12px;border:1px solid var(--border2);
  padding:20px}
.rpt-chart-title{font-size:12px;font-weight:700;color:var(--text2);
  text-transform:uppercase;letter-spacing:.06em;margin-bottom:16px}
.rpt-chart-wrap{position:relative;height:220px}

/* ── Findings table ── */
.rpt-table-wrap{overflow-x:auto}
.rpt-table{width:100%;border-collapse:collapse;font-size:13px}
.rpt-table th{background:var(--bg);padding:12px 16px;text-align:left;
  font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
  color:var(--text3);border-bottom:1px solid var(--border);white-space:nowrap;
  position:sticky;top:0;z-index:1}
.rpt-table td{padding:12px 16px;border-bottom:1px solid var(--border2);
  vertical-align:top;color:var(--text)}
.rpt-table tr:last-child td{border-bottom:none}
.rpt-table tr:hover td{background:rgba(255,255,255,.015)}
.rpt-table .sev-bar{width:3px;padding:0}
.rpt-td-name{color:var(--white);font-weight:600}
.rpt-td-dim{color:var(--text2);font-size:12px}
.rpt-td-mono{font-family:'JetBrains Mono',monospace;font-size:11px}
.rpt-link{color:#58A6FF;text-decoration:none;word-break:break-all}
.rpt-link:hover{text-decoration:underline}
.rpt-mono{font-family:'JetBrains Mono',monospace;font-size:11px}
.rpt-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;border:1px solid}
.rpt-badge-pass{color:#22C55E;background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.3)}
.rpt-badge-warn{color:#F59E0B;background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.3)}
.rpt-badge-fail{color:#EF4444;background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.3)}

/* ── Badges ── */
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;
  border-radius:6px;font-size:10px;font-weight:700;border:1px solid;white-space:nowrap;
  font-family:'Inter',sans-serif;letter-spacing:.02em}
.badge-pass{color:#22C55E;background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.3)}
.badge-high{color:#F97316;background:rgba(249,115,22,.1);border-color:rgba(249,115,22,.3)}
.badge-warn{color:#F59E0B;background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.3)}
.badge-fail,.badge-critical{color:#EF4444;background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.3)}
.badge-info{color:#3B82F6;background:rgba(59,130,246,.1);border-color:rgba(59,130,246,.3)}
.badge-purple{color:#A855F7;background:rgba(168,85,247,.1);border-color:rgba(168,85,247,.3)}
.badge-low{color:#3B82F6;background:rgba(59,130,246,.1);border-color:rgba(59,130,246,.3)}

/* ── Finding cards (expanded view) ── */
.finding-card{border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:12px}
.finding-card-hdr{padding:14px 18px;display:flex;align-items:center;gap:12px;
  background:var(--bg3);cursor:pointer;user-select:none}
.finding-card[open] .finding-card-hdr{border-bottom:1px solid var(--border)}
.finding-card-title{font-size:13px;font-weight:700;color:var(--white);flex:1}
.finding-card-body{padding:18px 20px;display:grid;gap:16px}
.finding-field label{font-size:10px;font-weight:700;text-transform:uppercase;
  letter-spacing:.07em;color:var(--text3);display:block;margin-bottom:4px}
.finding-field p{font-size:13px;color:var(--text);line-height:1.65}
.finding-field code{font-family:'JetBrains Mono',monospace;font-size:11px;
  background:var(--bg);border:1px solid var(--border2);padding:10px 14px;
  border-radius:6px;display:block;white-space:pre-wrap;color:#79C0FF;margin-top:6px}
.finding-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}

/* ── Rec cards ── */
.rpt-recs-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));
  gap:16px;padding:24px}
.rpt-rec{background:var(--bg3);border:1px solid var(--border2);border-radius:12px;
  padding:18px;border-left:3px solid}
.rpt-rec-title{font-size:13px;font-weight:700;color:var(--white);margin-bottom:6px}
.rpt-rec-body{font-size:12px;color:var(--text2);line-height:1.6}
.rpt-rec-meta{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.rpt-tag{font-size:10px;padding:2px 8px;border-radius:4px;font-weight:600;
  background:var(--bg4);color:var(--text3);border:1px solid var(--border2)}

/* ── Crawler access table ── */
.crawler-allowed{color:var(--pass)}
.crawler-blocked{color:var(--fail)}
.crawler-unspecified{color:var(--text3)}

/* ── Progress bar inline ── */
.inline-bar{height:6px;background:var(--border2);border-radius:3px;
  overflow:hidden;margin-top:4px;min-width:80px}
.inline-bar-fill{height:100%;border-radius:3px}

/* ── Collapsible raw data ── */
.raw-section{background:var(--bg);border:1px solid var(--border2);
  border-radius:8px;padding:16px 20px;margin-top:12px}
.raw-section pre{font-family:'JetBrains Mono',monospace;font-size:11px;
  color:#79C0FF;white-space:pre-wrap;line-height:1.5;max-height:300px;overflow-y:auto}

/* ── Footer ── */
.rpt-footer{text-align:center;font-size:11px;color:var(--text3);
  margin-top:60px;padding:24px 40px;border-top:1px solid var(--border2)}
.rpt-footer a{color:var(--text3)}

/* ── Print ── */
@media print{
  body{background:#fff;color:#000}
  .rpt-banner{background:#f4f6fa;border:1px solid #ddd;border-bottom:2px solid #ccc}
  .rpt-banner h1,.rpt-brand-name,.rpt-section-title,.rpt-card-hdr-title{color:#000}
  .rpt-kpi{background:#f9fafb;border:1px solid #e5e7eb}
  .rpt-card,.finding-card{border:1px solid #ddd}
  .rpt-card-hdr,.rpt-card-body,.finding-card-hdr,.finding-card-body{background:#f9fafb}
  .rpt-table th{background:#f0f0f0;color:#555}
  .rpt-table td{color:#333;border-color:#e0e0e0}
  .rpt-score-item{background:#f4f4f4}
  .rpt-chart-box{border:1px solid #ddd}
  @page{margin:20mm}
}

/* ── Responsive ── */
@media(max-width:900px){
  .rpt-banner-inner{flex-wrap:wrap}
  .rpt-inner{padding:0 20px}
  .rpt-banner{padding:28px 20px 24px}
  .finding-cols{grid-template-columns:1fr}
}
</style>"""


# ── Chart.js helper ───────────────────────────────────────────────────────────

CHARTJS_HEAD = '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>'

CHARTJS_DEFAULTS = """<script>
Chart.defaults.color='#8B949E';
Chart.defaults.borderColor='#21262D';
Chart.defaults.font.family="'Inter',system-ui,sans-serif";
</script>"""


def _donut_chart(canvas_id: str, labels: list, values: list,
                 colors: list | None = None) -> str:
    default_colors = ["#EF4444","#F97316","#F59E0B","#3B82F6","#22C55E","#A855F7","#06B6D4"]
    cols = colors or default_colors[:len(labels)]
    return f"""<script>
(function(){{
  var ctx=document.getElementById({json.dumps(canvas_id)}).getContext('2d');
  new Chart(ctx,{{type:'doughnut',data:{{
    labels:{json.dumps(labels)},
    datasets:[{{data:{json.dumps(values)},backgroundColor:{json.dumps(cols)},
      borderWidth:2,borderColor:'#161B22',hoverBorderColor:'#30363D'}}]
  }},options:{{responsive:true,maintainAspectRatio:false,
    cutout:'65%',
    plugins:{{legend:{{position:'right',labels:{{boxWidth:10,padding:12,color:'#8B949E',font:{{size:11}}}}}},
      tooltip:{{callbacks:{{label:c=>c.label+': '+c.parsed}}}}}}
  }}}});
}})();
</script>"""


def _radar_chart(canvas_id: str, labels: list, values: list, color="#3B82F6") -> str:
    return f"""<script>
(function(){{
  var ctx=document.getElementById({json.dumps(canvas_id)}).getContext('2d');
  new Chart(ctx,{{type:'radar',data:{{
    labels:{json.dumps(labels)},
    datasets:[{{label:'Score',data:{json.dumps(values)},
      backgroundColor:'{color}22',borderColor:'{color}',
      pointBackgroundColor:'{color}',pointRadius:4,borderWidth:2}}]
  }},options:{{responsive:true,maintainAspectRatio:false,
    scales:{{r:{{min:0,max:100,ticks:{{stepSize:25,color:'#484F58',font:{{size:10}}}},
      grid:{{color:'#21262D'}},angleLines:{{color:'#21262D'}},
      pointLabels:{{color:'#8B949E',font:{{size:11}}}}
    }}}},plugins:{{legend:{{display:false}}}}
  }}}});
}})();
</script>"""


def _bar_chart(canvas_id: str, labels: list, values: list,
               label="Score", color="#3B82F6", horizontal=False) -> str:
    chart_type = "bar"
    axis_cfg = (
        f"x:{{ticks:{{color:'#8B949E',font:{{size:10}}}},grid:{{color:'#21262D'}},"
        f"max:100}},y:{{ticks:{{color:'#8B949E',font:{{size:10}}}},grid:{{display:false}}}}"
        if horizontal else
        f"y:{{beginAtZero:true,max:100,ticks:{{color:'#8B949E',font:{{size:10}}}},"
        f"grid:{{color:'#21262D'}}}},x:{{ticks:{{color:'#8B949E',font:{{size:10}}}},"
        f"grid:{{display:false}}}}"
    )
    idx_axis = "indexAxis:'y'," if horizontal else ""
    return f"""<script>
(function(){{
  var ctx=document.getElementById({json.dumps(canvas_id)}).getContext('2d');
  new Chart(ctx,{{type:'{chart_type}',data:{{
    labels:{json.dumps(labels)},
    datasets:[{{label:{json.dumps(label)},data:{json.dumps(values)},
      backgroundColor:'{color}99',borderColor:'{color}',
      borderWidth:1,borderRadius:4}}]
  }},options:{{responsive:true,maintainAspectRatio:false,{idx_axis}
    plugins:{{legend:{{display:false}},
      tooltip:{{callbacks:{{label:c=>c.parsed.y!==undefined?c.parsed.y+'%':c.parsed.x+'%'}}}}}},
    scales:{{{axis_cfg}}}
  }}}});
}})();
</script>"""


def _line_chart(canvas_id: str, labels: list, datasets: list) -> str:
    ds_json = json.dumps([{
        "label": d.get("label",""),
        "data": d.get("data",[]),
        "borderColor": d.get("color","#3B82F6"),
        "backgroundColor": d.get("color","#3B82F6") + "22",
        "borderWidth": 2,
        "pointRadius": 3,
        "tension": 0.35,
        "fill": d.get("fill", False),
    } for d in datasets])
    return f"""<script>
(function(){{
  var ctx=document.getElementById({json.dumps(canvas_id)}).getContext('2d');
  new Chart(ctx,{{type:'line',data:{{
    labels:{json.dumps(labels)},datasets:{ds_json}
  }},options:{{responsive:true,maintainAspectRatio:false,
    interaction:{{mode:'index',intersect:false}},
    plugins:{{legend:{{labels:{{color:'#8B949E',font:{{size:11}},boxWidth:12}}}}}},
    scales:{{
      y:{{beginAtZero:true,ticks:{{color:'#8B949E',font:{{size:10}}}},
        grid:{{color:'#21262D'}}}},
      x:{{ticks:{{color:'#8B949E',font:{{size:10}},maxRotation:0,autoSkip:true,maxTicksLimit:12}},
        grid:{{display:false}}}}
    }}
  }}}});
}})();
</script>"""


# ── SVG score ring ─────────────────────────────────────────────────────────────

def _score_ring_svg(score: int, size: int = 130, label: str = "Score") -> str:
    r = 50; cx = cy = size // 2
    circ = 2 * 3.14159 * r
    offset = circ - (circ * max(0, min(100, score)) / 100)
    col = _score_col(score)
    grade = _grade(score)
    return f"""<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}" class="score-ring-svg">
  <circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#21262D" stroke-width="10"/>
  <circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{col}" stroke-width="10"
    stroke-linecap="round" stroke-dasharray="{circ:.2f}"
    stroke-dashoffset="{offset:.2f}" transform="rotate(-90 {cx} {cy})"/>
  <text x="{cx}" y="{cy-5}" text-anchor="middle" class="score-ring-val"
    fill="{col}" font-family="Inter,sans-serif" font-weight="900" font-size="28">{score}</text>
  <text x="{cx}" y="{cy+14}" text-anchor="middle" class="score-ring-sub"
    fill="#8B949E" font-family="Inter,sans-serif" font-size="10" letter-spacing="1">{_esc(label)}</text>
  <text x="{cx}" y="{cy+28}" text-anchor="middle"
    fill="{col}" font-family="Inter,sans-serif" font-weight="800" font-size="13">Grade {grade}</text>
</svg>"""


# ── Shared badge renderer ─────────────────────────────────────────────────────

def _badge(text: str, kind: str = "info") -> str:
    cls = {
        "pass":"badge-pass","ok":"badge-pass","fail":"badge-fail","error":"badge-fail",
        "critical":"badge-critical","high":"badge-high","warn":"badge-warn",
        "warning":"badge-warn","medium":"badge-warn","info":"badge-info",
        "low":"badge-low","purple":"badge-purple",
    }.get(str(kind).lower(), "badge-info")
    return f'<span class="badge {cls}">{_esc(text)}</span>'


def _sev_badge(sev: str) -> str:
    sev = str(sev or "info").lower()
    label = sev.upper()
    return _badge(label, sev if sev in ("critical","high","medium","low","info","pass","warn") else "info")


# ── ReportBuilder ─────────────────────────────────────────────────────────────

class ReportBuilder:
    """Fluent builder — construct sections then call .build() for full HTML."""

    def __init__(self, title: str, url: str, scan_type: str,
                 timestamp: str | None = None):
        self._title = title
        self._url = url
        self._scan_type = scan_type
        self._ts = timestamp or datetime.now().strftime("%Y-%m-%d %H:%M UTC")
        self._score: int = 0
        self._grade: str = "—"
        self._kpis: list[dict] = []
        self._sections: list[str] = []
        self._scripts: list[str] = []
        self._banner_extra: str = ""

    # ── Banner ────────────────────────────────────────────────────────────────

    def set_score(self, score: int, label: str = "Score") -> "ReportBuilder":
        self._score = score
        self._grade = _grade(score)
        self._banner_extra = _score_ring_svg(score, 130, label)
        return self

    def set_banner_extra(self, html: str) -> "ReportBuilder":
        self._banner_extra = html
        return self

    # ── KPI strip ─────────────────────────────────────────────────────────────

    def add_kpi(self, label: str, value: str, sub: str = "",
                color: str = "#3B82F6") -> "ReportBuilder":
        self._kpis.append({"label": label, "value": value, "sub": sub, "color": color})
        return self

    # ── Generic section ───────────────────────────────────────────────────────

    def add_section(self, title: str, icon: str, content_html: str,
                    subtitle: str = "", badge: str = "") -> "ReportBuilder":
        badge_html = (f'<span class="rpt-section-badge badge badge-info">{_esc(badge)}</span>'
                      if badge else "")
        sub_html = f'<div class="rpt-section-sub">{_esc(subtitle)}</div>' if subtitle else ""
        self._sections.append(f"""
<div class="rpt-section">
  <div class="rpt-section-hdr">
    <span class="rpt-section-icon">{icon}</span>
    <div>
      <div class="rpt-section-title">{_esc(title)}</div>
      {sub_html}
    </div>
    {badge_html}
  </div>
  {content_html}
</div>""")
        return self

    # ── Score dashboard ───────────────────────────────────────────────────────

    def add_score_panel(self, scores: Dict[str, int],
                        radar_id: str | None = None) -> "ReportBuilder":
        items = ""
        for label, val in scores.items():
            col = _score_col(val)
            items += f"""<div class="rpt-score-item">
  <div class="rpt-score-num" style="color:{col}">{val}</div>
  <div class="rpt-score-label">{_esc(label)}</div>
  <div class="rpt-score-bar"><div class="rpt-score-bar-fill"
    style="width:{val}%;background:{col}"></div></div>
</div>"""

        chart_html = ""
        if radar_id and scores:
            chart_html = f"""
<div style="padding:0 24px 24px">
  <div class="rpt-chart-box" style="max-width:420px">
    <div class="rpt-chart-title">Score Radar</div>
    <div class="rpt-chart-wrap"><canvas id="{radar_id}"></canvas></div>
  </div>
</div>"""
            self._scripts.append(
                _radar_chart(radar_id, list(scores.keys()), list(scores.values()))
            )

        body = f'<div class="rpt-scores-grid">{items}</div>{chart_html}'
        self.add_section("Score Breakdown", "📊", body,
                         subtitle="Dimensional quality scores across all evaluated areas")
        return self

    # ── Findings table ────────────────────────────────────────────────────────

    def add_findings_table(self, findings: list[dict],
                           title: str = "Findings",
                           icon: str = "🔍") -> "ReportBuilder":
        if not findings:
            self.add_section(title, icon,
                             '<div class="rpt-card"><div class="rpt-card-body">'
                             '<span style="color:var(--pass)">✓</span> No issues found.</div></div>')
            return self

        sev_counts: Dict[str, int] = {}
        for f in findings:
            sev = str(f.get("severity", "info")).lower()
            sev_counts[sev] = sev_counts.get(sev, 0) + 1

        sorted_f = sorted(findings, key=lambda f: _priority_order(f.get("severity","info")))

        rows = ""
        for f in sorted_f:
            sev = str(f.get("severity", "info")).lower()
            col = _sev_col(sev)
            fix = f.get("fix") or f.get("fix_hint") or ""
            impact = f.get("impact") or f.get("why") or ""
            rows += f"""<tr>
  <td class="sev-bar" style="background:{col};width:3px;padding:0"></td>
  <td class="rpt-td-name">{_esc(f.get('title') or f.get('name') or f.get('Test Name',''))}</td>
  <td>{_badge(f.get('category',''),'purple')}</td>
  <td>{_sev_badge(sev)}</td>
  <td class="rpt-td-dim">{_esc(str(f.get('detail') or f.get('description',''))[:120])}</td>
  <td class="rpt-td-dim" style="color:#58A6FF">{_esc(fix[:100])}</td>
</tr>"""

        # severity mini-summary
        sev_pills = " ".join(
            f'<span class="badge badge-{s if s in ("critical","high","warn","info","pass","low") else "info"}">'
            f'{c} {s}</span>'
            for s, c in sorted(sev_counts.items(), key=lambda x: _priority_order(x[0]))
        )

        html = f"""<div class="rpt-card">
  <div class="rpt-card-hdr">
    <span class="rpt-card-hdr-icon">📋</span>
    <span class="rpt-card-hdr-title">{_esc(title)} ({len(findings)} items)</span>
    <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">{sev_pills}</div>
  </div>
  <div class="rpt-card-body-np rpt-table-wrap">
    <table class="rpt-table">
      <thead><tr>
        <th style="width:3px;padding:0"></th>
        <th>Finding</th><th>Category</th><th>Severity</th>
        <th>Detail</th><th>Recommended Fix</th>
      </tr></thead>
      <tbody>{rows}</tbody>
    </table>
  </div>
</div>"""
        self.add_section(title, icon, html,
                         subtitle=f"{len(findings)} items · {sev_pills}")
        return self

    # ── Expanded finding cards (with root cause, impact, code) ───────────────

    def add_finding_cards(self, findings: list[dict],
                          title: str = "Detailed Findings",
                          icon: str = "🔬") -> "ReportBuilder":
        if not findings:
            return self
        cards = ""
        for i, f in enumerate(sorted(findings,
                key=lambda x: _priority_order(x.get("severity","info")))):
            sev = str(f.get("severity","info")).lower()
            col = _sev_col(sev)
            root = f.get("root_cause") or f.get("why") or ""
            impact = f.get("impact") or ""
            fix = f.get("fix") or f.get("fix_hint") or ""
            code_before = f.get("code_before") or ""
            code_after = f.get("code_after") or ""
            effort = f.get("effort") or ""
            pages = ", ".join(f.get("pages") or [])

            detail_cols = ""
            if root:
                detail_cols += f'<div class="finding-field"><label>Root Cause</label><p>{_esc(root)}</p></div>'
            if impact:
                detail_cols += f'<div class="finding-field"><label>Impact</label><p>{_esc(impact)}</p></div>'
            if fix:
                detail_cols += f'<div class="finding-field"><label>Recommended Fix</label><p>{_esc(fix)}</p></div>'
            if pages:
                detail_cols += f'<div class="finding-field"><label>Affected Pages</label><p class="rpt-td-mono">{_esc(pages[:200])}</p></div>'
            code_section = ""
            if code_before or code_after:
                code_section = f"""<div class="finding-field">
  <label>Code Example</label>
  {"<div style='margin-bottom:6px'><div style='font-size:10px;color:var(--fail);margin-bottom:3px'>❌ Before</div><code>"+_esc(code_before)+"</code></div>" if code_before else ""}
  {"<div><div style='font-size:10px;color:var(--pass);margin-bottom:3px'>✓ After</div><code>"+_esc(code_after)+"</code></div>" if code_after else ""}
</div>"""
            meta_row = ""
            if effort:
                meta_row += f'<span class="rpt-tag">Effort: {_esc(effort)}</span>'
            if f.get("priority"):
                meta_row += f'<span class="rpt-tag">Priority: {_esc(str(f["priority"]))}</span>'

            cards += f"""<details class="finding-card">
  <summary class="finding-card-hdr">
    <span style="width:10px;height:10px;border-radius:50%;
      background:{col};flex-shrink:0;display:inline-block"></span>
    <span class="finding-card-title">{_esc(f.get("title") or f.get("name","Finding"))}</span>
    {_sev_badge(sev)}
    {_badge(f.get("category",""),"purple") if f.get("category") else ""}
    <span style="color:var(--text3);font-size:12px;margin-left:8px">▼</span>
  </summary>
  <div class="finding-card-body">
    <div class="finding-field">
      <label>Description</label>
      <p>{_esc(f.get("description") or f.get("detail",""))}</p>
    </div>
    <div class="finding-cols">{detail_cols}</div>
    {code_section}
    {"<div class='rpt-rec-meta'>" + meta_row + "</div>" if meta_row else ""}
  </div>
</details>"""

        self.add_section(title, icon, cards)
        return self

    # ── Recommendations ───────────────────────────────────────────────────────

    def add_recommendations(self, recs: list[dict],
                            title: str = "AI Recommendations",
                            icon: str = "💡") -> "ReportBuilder":
        if not recs:
            return self
        priority_groups = {"quick_win": [], "medium": [], "longterm": []}
        for r in recs:
            p = str(r.get("priority","medium")).lower().replace(" ","_").replace("-","_")
            group = "quick_win" if "quick" in p else ("longterm" if "long" in p else "medium")
            priority_groups[group].append(r)

        group_labels = {
            "quick_win": ("⚡ Quick Wins", "#22C55E"),
            "medium": ("🔧 Medium Effort", "#F59E0B"),
            "longterm": ("🏗 Long-term", "#3B82F6"),
        }
        html = ""
        for key, (label, col) in group_labels.items():
            items = priority_groups[key]
            if not items:
                continue
            cards = ""
            for r in items:
                effort = r.get("effort") or r.get("difficulty") or ""
                impact = r.get("impact") or r.get("expected_improvement") or ""
                cards += f"""<div class="rpt-rec" style="border-left-color:{col}">
  <div class="rpt-rec-title">{_esc(r.get("title",""))}</div>
  <div class="rpt-rec-body">{_esc(r.get("description") or r.get("body",""))}</div>
  <div class="rpt-rec-meta">
    {"<span class='rpt-tag'>Effort: "+_esc(effort)+"</span>" if effort else ""}
    {"<span class='rpt-tag'>Impact: "+_esc(impact)+"</span>" if impact else ""}
  </div>
</div>"""

            html += f"""<div style="margin-bottom:24px">
  <div style="font-size:12px;font-weight:700;color:{col};
    text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">{label}</div>
  <div class="rpt-recs-grid" style="padding:0">{cards}</div>
</div>"""

        self.add_section(title, icon,
                         f'<div style="padding:24px 0">{html}</div>',
                         subtitle="Prioritized action plan — quick wins first")
        return self

    # ── Dual chart row ────────────────────────────────────────────────────────

    def add_charts(self, charts: list[dict]) -> "ReportBuilder":
        """charts: [{id, title, type, labels, values/datasets, color?}]"""
        boxes = ""
        for c in charts:
            cid = c["id"]
            boxes += f"""<div class="rpt-chart-box">
  <div class="rpt-chart-title">{_esc(c.get("title",""))}</div>
  <div class="rpt-chart-wrap"><canvas id="{cid}"></canvas></div>
</div>"""
            t = c.get("type","donut")
            if t == "donut":
                self._scripts.append(
                    _donut_chart(cid, c.get("labels",[]), c.get("values",[]),
                                 c.get("colors")))
            elif t == "bar":
                self._scripts.append(
                    _bar_chart(cid, c.get("labels",[]), c.get("values",[]),
                               label=c.get("label",""), color=c.get("color","#3B82F6"),
                               horizontal=c.get("horizontal", False)))
            elif t == "line":
                self._scripts.append(
                    _line_chart(cid, c.get("labels",[]), c.get("datasets",[])))
            elif t == "radar":
                self._scripts.append(
                    _radar_chart(cid, c.get("labels",[]), c.get("values",[]),
                                 c.get("color","#3B82F6")))

        html = f'<div class="rpt-charts-grid">{boxes}</div>'
        self.add_section("Data Visualizations", "📈", html)
        return self

    # ── Raw JSON collapse ─────────────────────────────────────────────────────

    def add_raw_data(self, data: dict, title: str = "Raw Scan Data") -> "ReportBuilder":
        truncated = json.dumps(data, indent=2, default=str)[:8000]
        self._sections.append(f"""
<div class="rpt-section">
  <details>
    <summary class="rpt-section-hdr" style="cursor:pointer">
      <span class="rpt-section-icon">🗂</span>
      <div>
        <div class="rpt-section-title">{_esc(title)}</div>
        <div class="rpt-section-sub">Click to expand — JSON payload</div>
      </div>
    </summary>
    <div class="raw-section"><pre>{_esc(truncated)}</pre></div>
  </details>
</div>""")
        return self

    # ── Build ─────────────────────────────────────────────────────────────────

    def build(self, include_chartjs: bool = True) -> str:
        kpi_html = ""
        for k in self._kpis:
            kpi_html += f"""<div class="rpt-kpi" style="border-top-color:{k['color']}">
  <div class="rpt-kpi-val" style="color:{k['color']}">{_esc(k['value'])}</div>
  <div class="rpt-kpi-label">{_esc(k['label'])}</div>
  <div class="rpt-kpi-sub">{_esc(k['sub'])}</div>
</div>"""

        sections_html = "\n".join(self._sections)
        scripts_html = "\n".join(self._scripts)
        chartjs = (CHARTJS_HEAD + "\n" + CHARTJS_DEFAULTS) if include_chartjs else ""

        return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_esc(self._title)}</title>
{chartjs}
{ENTERPRISE_CSS}
</head>
<body>
<div class="rpt-wrap">

<!-- BANNER -->
<div class="rpt-banner">
  <div class="rpt-banner-inner">
    <div style="flex:1;min-width:0">
      <div class="rpt-brand">
        <div class="rpt-brand-dot"></div>
        <div class="rpt-brand-name">SiteSentinel &nbsp;·&nbsp; {_esc(self._scan_type)}</div>
      </div>
      <h1>{_esc(self._title)}</h1>
      <div class="rpt-banner-meta">
        <span>Target: <span>{_esc(self._url)}</span></span>
        <span>Generated: <span>{_esc(self._ts)}</span></span>
      </div>
    </div>
    <div class="rpt-banner-right">{self._banner_extra}</div>
  </div>
</div>

<!-- KPI STRIP -->
{"<div class='rpt-kpi-strip'>" + kpi_html + "</div>" if kpi_html else ""}

<!-- CONTENT -->
<div class="rpt-inner">
{sections_html}
</div>

<!-- FOOTER -->
<div class="rpt-footer">
  SiteSentinel Matrix Pro &nbsp;·&nbsp; {_esc(self._scan_type)} Report &nbsp;·&nbsp;
  {_esc(self._url)} &nbsp;·&nbsp; {_esc(self._ts)}
</div>

</div><!-- /rpt-wrap -->

{scripts_html}
</body>
</html>"""


# ── Master Report ─────────────────────────────────────────────────────────────

def build_master_report(jobs_map: dict) -> str:
    """Generate a consolidated master report from all jobs in the in-memory store."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M UTC")
    done_jobs = {jid: j for jid, j in jobs_map.items()
                 if j.get("status") == "done" and j.get("result")}

    # Aggregate scores
    all_scores = []
    type_counts: Dict[str, int] = {}
    sev_counts  = {"critical":0,"high":0,"medium":0,"low":0}
    scan_rows   = ""

    for jid, j in done_jobs.items():
        r = j.get("result") or {}
        t = j.get("type", "scan")
        type_counts[t] = type_counts.get(t, 0) + 1
        score = (r.get("overall_score") or r.get("health_score") or
                 r.get("combined_score") or r.get("normal_score") or
                 r.get("score") or 0)
        if isinstance(score, (int, float)) and score > 0:
            all_scores.append(int(score))

        col = _score_col(score)
        stat = j.get("status","—")
        stat_col = "#22C55E" if stat=="done" else "#F59E0B" if stat=="running" else "#EF4444"
        rpt_link = ""
        if r.get("report_html"):
            rpt_link = f'<a href="{_esc(r["report_html"])}" target="_blank">View →</a>'

        scan_rows += f"""<tr>
  <td class="rpt-td-mono" style="color:var(--text3)">{_esc(jid[:14])}</td>
  <td>{_badge(t,"purple")}</td>
  <td class="rpt-td-dim">{_esc(str(j.get("url",""))[:60])}</td>
  <td style="color:{col};font-weight:800;font-family:'JetBrains Mono',monospace">{score}</td>
  <td><span style="color:{stat_col};font-weight:700">{_esc(stat)}</span></td>
  <td>{rpt_link}</td>
</tr>"""

    overall = round(sum(all_scores) / len(all_scores)) if all_scores else 0
    total   = len(jobs_map)
    done_c  = sum(1 for j in jobs_map.values() if j.get("status")=="done")
    err_c   = sum(1 for j in jobs_map.values() if j.get("status")=="error")

    rb = ReportBuilder("Master Dashboard Report", "All Scans", "Master Report", ts)
    rb.set_score(overall, "Avg Score")
    rb.add_kpi("Total Scans", str(total), "across all modules", "#3B82F6")
    rb.add_kpi("Completed", str(done_c), f"{round(done_c/max(total,1)*100)}% success rate",
               "#22C55E")
    rb.add_kpi("Errors", str(err_c), "scans with failures",
               "#EF4444" if err_c else "#22C55E")
    rb.add_kpi("Average Score", str(overall), f"Grade {_grade(overall)}",
               _score_col(overall))

    # Scan type chart
    rb.add_charts([
        {"id":"master_types","title":"Scans by Type","type":"donut",
         "labels": list(type_counts.keys()), "values": list(type_counts.values())},
        {"id":"master_scores","title":"Score Distribution","type":"bar",
         "labels": [jid[:10] for jid in list(done_jobs.keys())[:20]],
         "values": [int((done_jobs[j].get("result") or {}).get("overall_score") or
                       (done_jobs[j].get("result") or {}).get("health_score") or
                       (done_jobs[j].get("result") or {}).get("combined_score") or 0)
                    for j in list(done_jobs.keys())[:20]],
         "color":"#3B82F6","label":"Score"},
    ])

    rb.add_section("All Scans", "📋",
        f"""<div class="rpt-card">
  <div class="rpt-card-body-np rpt-table-wrap">
    <table class="rpt-table">
      <thead><tr><th>Job ID</th><th>Type</th><th>URL</th>
        <th>Score</th><th>Status</th><th>Report</th></tr></thead>
      <tbody>{scan_rows or "<tr><td colspan='6' style='text-align:center;color:var(--text3);padding:32px'>No completed scans yet</td></tr>"}</tbody>
    </table>
  </div>
</div>""",
        subtitle=f"{total} total scans across all modules")

    return rb.build()
