"""
SiteSentinel — in-memory job store and job lifecycle helpers.
"""
from __future__ import annotations

import csv
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from config import REPORTS_DIR, log
from supabase_client import db


# Global in-memory job store
jobs: Dict[str, Dict] = {}


# ── Job lifecycle ─────────────────────────────────────────────────────────────

def new_job(kind: str, url: str = None) -> str:
    jid = db.create_scan(kind, url) if db.is_enabled() else str(uuid.uuid4())[:12]
    jobs[jid] = {
        "id": jid,
        "kind": kind,
        "status": "running",
        "logs": [],
        "result": None,
        "created": datetime.now().isoformat(),
        "progress": 0,
        "url": url,
    }
    return jid


def jlog(jid: str, msg: str, level: str = "info"):
    ts = datetime.now().strftime("%H:%M:%S")
    if jid in jobs:
        jobs[jid]["logs"].append({"ts": ts, "level": level, "msg": msg})
    db.log(jid, level, msg)


def jdone(jid: str, result: Any):
    if jid in jobs:
        jobs[jid].update({"status": "done", "result": result, "progress": 100})
    db.complete_scan(jid, result)


def jerr(jid: str, err: str):
    jlog(jid, f"ERROR: {err}", "err")
    if jid in jobs:
        jobs[jid].update({"status": "error", "result": {"error": err}})
    db.complete_scan(jid, {"error": err}, status="failed")


# ── Summary helpers ───────────────────────────────────────────────────────────

def _safe_get_job_summary(jid: str, j: Dict) -> Dict:
    return {
        "job_id": jid,
        "type": j.get("type"),
        "status": j.get("status"),
        "progress": j.get("progress"),
        "started": j.get("started"),
        "report_html": (
            j.get("result", {}).get("report_html")
            if isinstance(j.get("result"), dict)
            else j.get("report_html")
        ),
        "report_json": (
            j.get("result", {}).get("report_json")
            if isinstance(j.get("result"), dict)
            else j.get("report_json")
        ),
    }


def _generate_all_scans_csv(jobs_map: Dict[str, Dict]) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = REPORTS_DIR / f"all_scans_{ts}.csv"
    rows = []
    headers = [
        "job_id", "type", "status", "progress", "url",
        "report_html", "report_json", "test_case", "category",
        "result", "severity", "detail",
    ]
    for jid, j in jobs_map.items():
        base = {
            "job_id": jid,
            "type": j.get("type"),
            "status": j.get("status"),
            "progress": j.get("progress", 0),
            "report_html": j.get("report_html"),
            "report_json": j.get("report_json"),
        }
        res = j.get("result") or {}
        url = res.get("url") if isinstance(res, dict) else None
        if isinstance(res, dict) and res.get("all_test_cases"):
            for tc in res.get("all_test_cases", []):
                rows.append([
                    base["job_id"], base["type"], base["status"], base["progress"], url,
                    base["report_html"], base["report_json"],
                    tc.get("Test Name") or tc.get("Test Case"),
                    tc.get("Category"), tc.get("Result"),
                    tc.get("Severity"), tc.get("Detail"),
                ])
        elif isinstance(res, dict) and (res.get("normal_results") or res.get("ai_results")):
            for nr in res.get("normal_results", []):
                rows.append([
                    base["job_id"], base["type"], base["status"], base["progress"], url,
                    base["report_html"], base["report_json"],
                    nr.get("check"), "Normal", nr.get("status"), "", nr.get("criterion"),
                ])
            for ar in res.get("ai_results", []):
                rows.append([
                    base["job_id"], base["type"], base["status"], base["progress"], url,
                    base["report_html"], base["report_json"],
                    ar.get("module"), "AI", ar.get("status"), "", ar.get("detail"),
                ])
        else:
            rows.append([
                base["job_id"], base["type"], base["status"], base["progress"], url,
                base["report_html"], base["report_json"],
                "-", "-", "-", "-", "-",
            ])

    with out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for r in rows:
            writer.writerow(r)
    return out


def _generate_all_scans_html(jobs_map: Dict[str, Dict]) -> Path:
    from report_engine import ReportBuilder, _score_col, _esc, _grade

    ts_str  = datetime.now().strftime("%Y-%m-%d %H:%M UTC")
    ts_file = datetime.now().strftime("%Y%m%d_%H%M%S")
    out     = REPORTS_DIR / f"all_scans_{ts_file}.html"

    job_ids, scores, types, statuses = [], [], [], []
    for jid, j in jobs_map.items():
        r     = j.get("result") or {}
        score = 0
        if isinstance(r, dict):
            score = r.get("health_score") or r.get("combined_score") or r.get("normal_score") or r.get("ai_score") or 0
        job_ids.append(jid[:12])
        scores.append(int(score) if isinstance(score, (int, float)) else 0)
        types.append(j.get("type", "unknown"))
        statuses.append(j.get("status", "unknown"))

    total    = len(jobs_map)
    done_n   = sum(1 for s in statuses if s == "done")
    run_n    = sum(1 for s in statuses if s == "running")
    err_n    = sum(1 for s in statuses if s == "error")
    avg_sc   = round(sum(scores) / total, 1) if total else 0

    type_counts: Dict[str, int] = {}
    for t in types:
        type_counts[t] = type_counts.get(t, 0) + 1

    rb = ReportBuilder("All Scans Dashboard", "All Jobs", "Master Dashboard", ts_str)
    rb.set_score(int(avg_sc), "Avg Score")
    rb.add_kpi("Total Scans",    str(total),   "jobs in this session",       "#3B82F6")
    rb.add_kpi("Completed",      str(done_n),  f"{round(done_n/max(total,1)*100)}% done", "#22C55E")
    rb.add_kpi("Running",        str(run_n),   "in progress",                "#F59E0B")
    rb.add_kpi("Errors",         str(err_n),   "failed jobs",                "#EF4444" if err_n else "#22C55E")
    rb.add_kpi("Avg Score",      str(avg_sc),  f"Grade {_grade(avg_sc)}",    _score_col(avg_sc))

    rb.add_charts([
        {"id":"dash_scores","title":"Score by Job","type":"bar",
         "labels":job_ids,"values":scores,"label":"Score","color":"#22C55E"},
        {"id":"dash_types","title":"Scan Types","type":"donut",
         "labels":list(type_counts.keys()),
         "values":list(type_counts.values()),
         "colors":["#3B82F6","#A855F7","#EC4899","#F59E0B","#10B981","#06B6D4","#EF4444"]},
        {"id":"dash_status","title":"Status Distribution","type":"donut",
         "labels":["Done","Running","Error"],
         "values":[done_n, run_n, err_n],
         "colors":["#22C55E","#F59E0B","#EF4444"]},
    ])

    rows = ""
    for jid, j in jobs_map.items():
        r        = j.get("result") or {}
        typ      = j.get("type","—")
        status   = j.get("status","—")
        score    = 0
        if isinstance(r, dict):
            score = r.get("health_score") or r.get("combined_score") or r.get("normal_score") or r.get("ai_score") or 0
        score    = int(score) if isinstance(score, (int, float)) else 0
        st_col   = "#22C55E" if status=="done" else "#F59E0B" if status=="running" else "#EF4444"
        rpt_html = j.get("report_html") or (r.get("report_html") if isinstance(r, dict) else None)
        link     = f'<a class="rpt-link" href="{_esc(rpt_html)}" target="_blank">View Report</a>' if rpt_html else "—"
        rows += f"""<tr>
  <td class="rpt-mono rpt-td-dim" style="font-size:11px">{_esc(jid[:16])}</td>
  <td class="rpt-td-name">{_esc(typ)}</td>
  <td style="color:{st_col};font-weight:700">{_esc(status)}</td>
  <td style="color:{_score_col(score)};font-weight:800">{score}</td>
  <td>{link}</td>
</tr>"""

    rb.add_section("All Jobs", "\U0001f4cb",
        f"""<div class="rpt-card"><div class="rpt-card-body-np rpt-table-wrap">
  <table class="rpt-table"><thead><tr>
    <th>Job ID</th><th>Type</th><th>Status</th><th>Score</th><th>Report</th>
  </tr></thead><tbody>{rows}</tbody></table>
</div></div>""")

    out.write_text(rb.build(), encoding="utf-8")
    return out

    return out
