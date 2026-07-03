"""
SiteSentinel — shared CSS and badge utilities used by all HTML report generators.
"""
from __future__ import annotations


_REPORT_CSS = """
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:'Inter',sans-serif;background:#0D1117;color:#C9D1D9;-webkit-font-smoothing:antialiased}
  a{color:#58A6FF;text-decoration:none}a:hover{text-decoration:underline}
  .wrap{max-width:1100px;margin:0 auto;padding:32px 24px}
  .banner{background:linear-gradient(135deg,#161B22 60%,#1C2128);border:1px solid #30363D;border-radius:20px;padding:32px 36px;margin-bottom:28px;display:flex;align-items:center;gap:32px}
  .banner-logo{font-size:40px;flex-shrink:0}
  .banner-title{font-size:26px;font-weight:800;color:#fff;margin:0 0 4px}
  .banner-sub{font-size:13px;color:#8B949E;margin:0}
  .score-ring-wrap{margin-left:auto;text-align:center;flex-shrink:0}
  .score-val{font-size:48px;font-weight:900;line-height:1}
  .score-lbl{font-size:11px;color:#8B949E;margin-top:4px;text-transform:uppercase;letter-spacing:.06em}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:28px}
  .kpi{background:#161B22;border:1px solid #30363D;border-radius:14px;padding:20px;border-top-width:3px}
  .kpi-val{font-size:28px;font-weight:800;color:#fff;line-height:1;margin-bottom:6px}
  .kpi-lbl{font-size:11px;color:#8B949E;text-transform:uppercase;letter-spacing:.05em}
  .kpi-sub{font-size:11px;color:#484F58;margin-top:3px}
  .card{background:#161B22;border:1px solid #30363D;border-radius:16px;margin-bottom:24px;overflow:hidden}
  .card-hdr{padding:16px 20px;border-bottom:1px solid #30363D;display:flex;align-items:center;gap:10px}
  .card-hdr-icon{font-size:18px}
  .card-hdr-title{font-size:14px;font-weight:700;color:#F0F6FC;letter-spacing:.02em}
  .card-body{padding:20px}
  table{width:100%;border-collapse:collapse}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#484F58;font-weight:700;padding:10px 14px;text-align:left;border-bottom:1px solid #21262D;background:#0D1117}
  td{font-size:12px;padding:10px 14px;border-bottom:1px solid #21262D;color:#8B949E;vertical-align:top}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:rgba(255,255,255,.02)}
  .td-name{color:#E6EDF3;font-weight:600}
  .badge{display:inline-block;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;border:1px solid}
  .badge-pass{color:#22C55E;background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.3)}
  .badge-fail{color:#EF4444;background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.3)}
  .badge-warn{color:#F59E0B;background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.3)}
  .badge-info{color:#3B82F6;background:rgba(59,130,246,.1);border-color:rgba(59,130,246,.3)}
  .badge-purple{color:#A855F7;background:rgba(168,85,247,.1);border-color:rgba(168,85,247,.3)}
  .score-bar-wrap{height:8px;background:#21262D;border-radius:4px;overflow:hidden;margin-top:6px}
  .score-bar{height:100%;border-radius:4px;transition:width .4s}
  footer{text-align:center;color:#3A3A3A;font-size:11px;margin-top:40px;padding-top:20px;border-top:1px solid #21262D}
</style>
"""


def _report_badge(value: str, kind: str = "info") -> str:
    cls = {
        "pass":   "badge-pass",
        "fail":   "badge-fail",
        "warn":   "badge-warn",
        "info":   "badge-info",
        "purple": "badge-purple",
    }.get(kind, "badge-info")
    return f'<span class="badge {cls}">{value}</span>'


def _score_color(s) -> str:
    try:
        s = float(s)
    except Exception:
        return "#8B949E"
    if s >= 90:
        return "#22C55E"
    if s >= 50:
        return "#F59E0B"
    return "#EF4444"
