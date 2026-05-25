"""
Streamlit UI for the O*NET-grounded Recruitment Cost Calculator (Option A).

Run from the spike root:
    python -m streamlit run scripts/calculator_app.py --server.port 8502
"""

from __future__ import annotations

import sys
from pathlib import Path

import altair as alt
import pandas as pd
import streamlit as st

sys.path.insert(0, str(Path(__file__).resolve().parent))

from classify_tasks import classify_soc  # noqa: E402
from cost_calculator import (  # noqa: E402
    CalculatorInputs,
    ProfilesMissing,
    calculate,
    has_profiles,
)
from onet_data import (  # noqa: E402
    MEDIAN_HOURLY_WAGE_USD,
    SOC_RECRUITER,
    active_source,
    list_occupations,
    occupation_meta,
    search_titles,
    wage_for,
    wage_info_for,
)


# A handful of pre-baked starter SOCs surfaced in the dropdown for quick demo.
FEATURED_SOCS = [
    "13-1071.00",  # Human Resources Specialists (default)
    "15-1252.00",  # Software Developers
    "11-2022.00",  # Sales Managers
    "29-1141.00",  # Registered Nurses
    "13-2011.00",  # Accountants and Auditors
    "43-4051.00",  # Customer Service Representatives
    "25-2021.00",  # Elementary School Teachers
    "41-3091.00",  # Sales Representatives, Services
]


# ---------------------------------------------------------------------------
# Visual vocabulary — three sources of data on this page.
# Every section header carries one of these chips so the reader can trace
# any number back to its origin.
# ---------------------------------------------------------------------------
SRC = {
    "onet": ("#1f6feb", "O*NET (gov)"),         # blue
    "ai": ("#d97706", "AI estimate"),           # amber
    "calc": ("#16a34a", "Calculated"),          # green
    "wage": ("#7c3aed", "BLS wages"),           # purple
}


def chip(kind: str) -> str:
    color, label = SRC[kind]
    return (
        f"<span style='display:inline-block;padding:2px 10px;border-radius:999px;"
        f"background:{color}20;color:{color};font-size:0.8em;font-weight:600;"
        f"border:1px solid {color}40;margin-left:8px;vertical-align:middle;'>"
        f"{label}</span>"
    )


CAPABILITY_COLORS = {
    "auto": "#16a34a",
    "assist": "#d97706",
    "human_only": "#475569",
}

# Plain-English replacements for jargon.
CAPABILITY_PLAIN = {
    "auto": "AI does it alone",
    "assist": "AI helps a person",
    "human_only": "Person must do it",
}

DRIVER_PLAIN = {
    "per_application": "every application received",
    "per_phone_screen": "every phone screen",
    "per_hire": "every hire made",
    "per_week": "ongoing weekly work",
    "per_open_req": "every open job posting",
}


st.set_page_config(
    page_title="Recruitment Effort Calculator — O*NET-Grounded",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# Light-themed CSS polish — works whether the user has light or dark
# preference in browser; the .streamlit/config.toml also forces light.
st.markdown(
    """
    <style>
      .main .block-container {padding-top: 1.5rem;}
      h2, h3 {margin-top: 1.2rem;}
      .src-card {
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 14px 16px;
        background: #ffffff;
      }
      .src-card-emphasis {
        border-left: 6px solid var(--accent, #16a34a);
      }
    </style>
    """,
    unsafe_allow_html=True,
)


# ---------------------------------------------------------------------------
# Header + one-line "what is this"
# ---------------------------------------------------------------------------
st.title("Workforce Effort Calculator")
src = active_source()
badge = (
    "🟢 **Live from O*NET API**"
    if src == "api"
    else "🟡 **Using local O*NET download (v30.2)**"
)
st.markdown(
    f"**What this is:** A calculator that tells you how many hours your team "
    f"spends on each task of a given U.S. occupation — and how much of that "
    f"work an AI agent could take off their plate.\n\n"
    f"**Today's data source:** {badge} "
    f"(covers all 1,016 U.S. occupations in the O*NET database)"
)

st.markdown(
    f"<div style='display:flex;gap:18px;flex-wrap:wrap;margin-top:10px;font-size:0.92em;'>"
    f"<div>{chip('onet').replace('margin-left:8px;', '')} = numbers from the U.S. government job database</div>"
    f"<div>{chip('ai').replace('margin-left:8px;', '')} = labels and time estimates from GPT-4.1-nano</div>"
    f"<div>{chip('calc').replace('margin-left:8px;', '')} = math we calculate from the two above</div>"
    f"<div>{chip('wage').replace('margin-left:8px;', '')} = pay rate from U.S. Bureau of Labor Statistics</div>"
    f"</div>",
    unsafe_allow_html=True,
)

st.markdown("---")


# ---------------------------------------------------------------------------
# Occupation picker — one primary search input, featured occupations as
# quick-pick pills below. Single visual element, no "two boxes" confusion.
# ---------------------------------------------------------------------------
st.markdown(f"### Step 1 — Pick a role to analyze {chip('onet')}", unsafe_allow_html=True)
st.caption(
    "Type any job title — official, alternate, or how it's known in industry. "
    "We'll match it against all 1,016 U.S. occupations in O*NET. "
    "Or click a featured role below to load it instantly."
)

# Persist the chosen SOC across reruns.
if "selected_soc" not in st.session_state:
    st.session_state["selected_soc"] = SOC_RECRUITER

query = st.text_input(
    "Search for an occupation",
    value="",
    label_visibility="collapsed",
    placeholder="🔍  e.g. 'senior recruiter', 'backend engineer', 'registered nurse', 'accountant'…",
)
if query and len(query) >= 2:
    hits = search_titles(query, limit=8)
    if not hits:
        st.warning(f"No O*NET match found for '{query}'. Try a shorter or more common phrase.")
    else:
        st.caption(f"Found {len(hits)} match(es) — click one to load it:")
        for h in hits:
            badge_color = {"official": "#1f6feb", "alternate": "#0891b2", "reported": "#0d9488"}.get(
                h["kind"], "#475569"
            )
            label_html = (
                f"<span style='background:{badge_color}20;color:{badge_color};"
                f"padding:1px 6px;border-radius:4px;font-size:0.75em;font-weight:600;"
                f"margin-right:6px;'>{h['kind']}</span>"
                f"<strong>{h['matched_title']}</strong>  →  {h['title']} "
                f"<span style='color:#94a3b8;'>(SOC {h['soc']})</span>"
            )
            cols = st.columns([1, 12])
            with cols[0]:
                clicked = st.button("Load", key=f"pick_{h['soc']}_{h['matched_title']}")
            with cols[1]:
                st.markdown(label_html, unsafe_allow_html=True)
            if clicked:
                st.session_state["selected_soc"] = h["soc"]
                st.rerun()

# Featured role chips — fast quick-jump for the demo.
st.markdown(
    "<div style='font-size:0.85em;color:#475569;margin-top:14px;margin-bottom:6px;'>"
    "<strong>Featured roles</strong> (instant — already AI-classified):</div>",
    unsafe_allow_html=True,
)
featured_meta = [(s, occupation_meta(s)["title"]) for s in FEATURED_SOCS]
chip_cols = st.columns(4)
for idx, (s_code, s_title) in enumerate(featured_meta):
    col = chip_cols[idx % 4]
    with col:
        is_current = s_code == st.session_state["selected_soc"]
        button_label = ("✓ " if is_current else "") + s_title
        if st.button(button_label, key=f"feat_{s_code}", width="stretch", type=("primary" if is_current else "secondary")):
            if not is_current:
                st.session_state["selected_soc"] = s_code
                st.rerun()

soc = st.session_state["selected_soc"]
meta = occupation_meta(soc)

# Show the active occupation prominently.
st.markdown(
    f"<div class='src-card' style='border-left:6px solid #1f6feb;margin-top:10px;'>"
    f"<div style='font-size:0.85em;color:#475569;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;'>"
    f"Currently analyzing</div>"
    f"<div style='font-size:1.25em;font-weight:700;color:#0f172a;margin-top:4px;'>"
    f"{meta['title']} "
    f"<a href='https://www.onetonline.org/link/summary/{soc}' "
    f"style='font-size:0.75em;text-decoration:none;color:#1f6feb;'>"
    f"(SOC {soc}) ↗</a></div>"
    f"<div style='font-size:0.95em;color:#475569;margin-top:6px;'>"
    f"{meta['description'][:240]}{'…' if len(meta['description']) > 240 else ''}</div>"
    f"</div>",
    unsafe_allow_html=True,
)

# If we don't yet have AI estimates for this SOC, classify it now.
if not has_profiles(soc):
    st.markdown("")
    st.warning(
        f"🧠 First time analyzing **{meta['title']}** — running the AI classifier "
        f"now to estimate AI capability + time for each of its O*NET tasks. "
        f"This usually takes 10-30 seconds. Subsequent loads are instant."
    )
    with st.spinner(f"GPT-4.1-nano classifying tasks for {meta['title']}…"):
        try:
            classify_soc(soc)
        except Exception as e:
            st.error(f"Classifier failed: {e}")
            st.stop()
    st.success(f"Done. AI estimates for {meta['title']} are now cached.")
    st.rerun()

st.markdown("---")


# ---------------------------------------------------------------------------
# Volume inputs — 5 generalized drivers that map to any occupation.
# (Labels stay recruiter-flavored but apply to any role: see captions.)
# ---------------------------------------------------------------------------
st.markdown(f"### Step 2 — Tell me about your team's volume {chip('calc')}", unsafe_allow_html=True)
is_recruiter = soc == SOC_RECRUITER
st.caption(
    "Move the sliders to match your real numbers. Defaults are illustrative. "
    + (
        "For Human Resources Specialists, the slider labels are literal."
        if is_recruiter
        else f"Labels are recruiter-flavored — for {meta['title']}, "
        f"interpret them as the equivalent units of work for this role "
        f"(e.g. 'resumes per week' ≈ 'incoming work items per week'). "
        f"The AI classifier already adapted the *time per unit* to {meta['title']}."
    )
)

i1, i2, i3, i4, i5 = st.columns(5)
with i1:
    open_reqs = st.slider("Open job postings / active projects", 1, 50, 15)
with i2:
    applications_per_week = st.slider("Incoming work items per week", 10, 2000, 200, step=10)
with i3:
    phone_screens_per_week = st.slider("Direct human interactions per week", 1, 200, 50)
with i4:
    hires_per_month = st.slider("Completed outcomes per month", 1, 50, 5)
with i5:
    # Live wage — fetched from onetonline.org (cached 30 days on disk).
    # Falls back to a hardcoded BLS snapshot only if the live fetch fails.
    wage_info = wage_info_for(soc)
    if wage_info is None:
        soc_wage = float(MEDIAN_HOURLY_WAGE_USD)
        wage_source_text = (
            f"Default <strong>${soc_wage:.2f}/hr</strong> {chip('wage')} — "
            f"could not fetch live wage for SOC {soc}; using HR-specialist "
            f"fallback. Look up the right number on "
            f"[U.S. BLS OES](https://www.bls.gov/oes/) and override above."
        )
    else:
        soc_wage = float(wage_info["hourly"])
        fallback = wage_info.get("fallback", False)
        stale = wage_info.get("stale", False)
        year = wage_info.get("year", "?")
        src_url = wage_info.get("source_url", "")
        if fallback:
            wage_source_text = (
                f"Default <strong>${soc_wage:.2f}/hr</strong> {chip('wage')} "
                f"— live O*NET fetch failed; using hardcoded BLS OES "
                f"{year} snapshot for [SOC {soc}]({src_url})."
            )
        elif stale:
            wage_source_text = (
                f"Default <strong>${soc_wage:.2f}/hr</strong> {chip('wage')} "
                f"— cached from [O*NET Online ({year} BLS data)]({src_url}); "
                f"re-fetch failed today, using stored value."
            )
        else:
            wage_source_text = (
                f"Default <strong>${soc_wage:.2f}/hr</strong> {chip('wage')} "
                f"— live from [O*NET Online ({year} BLS data)]({src_url})."
            )

    # Reset the wage when the user picks a new role.
    if st.session_state.get("_wage_for_soc") != soc:
        st.session_state["wage_input"] = soc_wage
        st.session_state["_wage_for_soc"] = soc

    wage_hourly_usd = st.number_input(
        f"Pay per hour for a {meta['title'].rstrip('s')} (USD)",
        min_value=10.0,
        max_value=300.0,
        step=0.50,
        key="wage_input",
    )
    st.markdown(
        f"<div style='font-size:0.85em;color:#475569;'>{wage_source_text}</div>",
        unsafe_allow_html=True,
    )

inputs = CalculatorInputs(
    applications_per_week=applications_per_week,
    phone_screens_per_week=phone_screens_per_week,
    hires_per_month=hires_per_month,
    open_reqs=open_reqs,
    wage_hourly_usd=wage_hourly_usd,
    soc=soc,
)
result = calculate(inputs)

st.markdown("---")


# ---------------------------------------------------------------------------
# Headline KPIs — 4 simple cards.
# ---------------------------------------------------------------------------
st.markdown(f"### What this costs you per week {chip('calc')}", unsafe_allow_html=True)
role_word = meta["title"].lower().rstrip("s")

# Map each driver to the slider's human-readable label so the breakdown
# inside the hours box can say "from your X slider" instead of "per_application".
DRIVER_TO_SLIDER_LABEL = {
    "per_application": "Incoming work items per wk",
    "per_phone_screen": "Direct interactions per wk",
    "per_hire": "Completed outcomes per month",
    "per_week": "Ongoing weekly load (no slider)",
    "per_open_req": "Open job postings / active projects",
}


def _breakdown_html(hours_field: str) -> str:
    """Build a small per-driver breakdown listing inside the hours box.

    `hours_field` is one of "human_hours_per_week" or "savings_hours_per_week".
    Each line: hours, label, task count, % of total — sorted by hours desc.
    Drivers contributing zero hours are skipped.
    """
    totals: dict[str, dict] = {}
    for t in result.per_task:
        d = t.driver
        h = getattr(t, hours_field, 0.0) or 0.0
        if d not in totals:
            totals[d] = {"hours": 0.0, "tasks": 0}
        totals[d]["hours"] += h
        totals[d]["tasks"] += 1
    grand = sum(v["hours"] for v in totals.values()) or 1.0
    rows = sorted(totals.items(), key=lambda kv: kv[1]["hours"], reverse=True)
    lines = []
    for drv, v in rows:
        if v["hours"] <= 0.05:
            continue
        label = DRIVER_TO_SLIDER_LABEL.get(drv, drv)
        pct = 100.0 * v["hours"] / grand
        lines.append(
            f"<li style='margin:3px 0;'>"
            f"<strong>{v['hours']:.0f} hrs</strong> &nbsp;"
            f"<span style='color:#475569;'>from</span> "
            f"<em>{label}</em> "
            f"<span style='color:#94a3b8;'>({v['tasks']} task"
            f"{'s' if v['tasks'] != 1 else ''} · {pct:.0f}%)</span></li>"
        )
    if not lines:
        return ""
    return (
        "<div style='margin-top:10px;border-top:1px dashed #c7d2fe;"
        "padding-top:8px;text-align:left;font-size:0.78em;color:#0f172a;'>"
        "<div style='font-size:0.95em;color:#3730a3;font-weight:700;"
        "margin-bottom:4px;'>where these hours come from</div>"
        "<ul style='margin:0;padding-left:18px;list-style:disc;'>"
        + "".join(lines)
        + "</ul></div>"
    )


# Two equation rows: [hours+breakdown] × [wage] = [dollars]. Each row IS the KPI
# display (no separate metric cards), so the reader sees both the values, the
# multiplication relationship, and the per-slider attribution in one place.

def _flow_row(left_label: str, left_value: str,
              left_breakdown: str,
              right_label: str, right_value: str,
              right_subtitle: str,
              accent: str,
              left_badge: str = "") -> str:
    """Render one [hours+breakdown] × [wage] = [dollars+subtitle] equation row."""
    badge_html = (
        f"<div style='display:inline-block;background:#3730a3;color:#ffffff;"
        f"font-size:0.7em;font-weight:700;padding:2px 8px;border-radius:10px;"
        f"margin-top:6px;'>{left_badge}</div>"
        if left_badge else ""
    )
    left_box = (
        f"<div style='flex:1 1 260px;background:#eef2ff;border:1px solid #6366f1;"
        f"border-radius:8px;padding:14px 20px;text-align:center;min-width:240px;'>"
        f"<div style='font-size:0.72em;color:#3730a3;font-weight:700;"
        f"text-transform:uppercase;letter-spacing:0.4px;'>{left_label}</div>"
        f"<div style='font-size:1.7em;font-weight:800;color:#0f172a;margin-top:4px;'>"
        f"{left_value}</div>"
        + badge_html
        + left_breakdown
        + "</div>"
    )
    wage_box = (
        f"<div style='flex:0 0 auto;background:#f3e8ff;border:1px solid #c084fc;"
        f"border-radius:8px;padding:14px 20px;text-align:center;min-width:140px;"
        f"align-self:flex-start;'>"
        f"<div style='font-size:0.72em;color:#6b21a8;font-weight:700;"
        f"text-transform:uppercase;letter-spacing:0.4px;'>Wage / hr</div>"
        f"<div style='font-size:1.7em;font-weight:800;color:#0f172a;margin-top:4px;'>"
        f"${result.wage_hourly_usd:.2f}</div></div>"
    )
    right_box = (
        f"<div style='flex:1 1 200px;background:{accent}14;border:2px solid {accent};"
        f"border-radius:8px;padding:14px 20px;text-align:center;min-width:200px;"
        f"align-self:flex-start;'>"
        f"<div style='font-size:0.72em;color:{accent};font-weight:800;"
        f"text-transform:uppercase;letter-spacing:0.4px;'>{right_label}</div>"
        f"<div style='font-size:2.1em;font-weight:800;color:#0f172a;margin-top:4px;"
        f"line-height:1.1;'>{right_value}</div>"
        + (
            f"<div style='font-size:0.85em;color:{accent};font-weight:600;"
            f"margin-top:4px;'>{right_subtitle}</div>"
            if right_subtitle else ""
        )
        + "</div>"
    )
    op = (
        "<div style='font-size:2em;font-weight:700;color:#94a3b8;"
        "padding:0 8px;align-self:flex-start;padding-top:30px;'>{}</div>"
    )
    return (
        "<div style='display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;"
        "margin:10px 0 18px 0;'>"
        + left_box + op.format("×") + wage_box + op.format("=") + right_box
        + "</div>"
    )

_task_count = len(result.per_task)
_tasks_badge = f"{_task_count} O*NET tasks for this role"

st.markdown(
    _flow_row(
        f"Hours of {role_word} work / wk",
        f"{result.weekly_human_hours:,.0f} hrs",
        _breakdown_html("human_hours_per_week"),
        "Cost / wk",
        f"${result.weekly_human_cost_usd:,.0f}",
        "",
        "#1f6feb",
        left_badge=_tasks_badge,
    ),
    unsafe_allow_html=True,
)
st.markdown(
    _flow_row(
        "Hours AI can save / wk",
        f"{result.weekly_savings_hours:,.0f} hrs",
        _breakdown_html("savings_hours_per_week"),
        "Money AI can save / wk",
        f"${result.weekly_savings_usd:,.0f}",
        f"↑ {result.automation_percent:.0f}% of the work &nbsp;·&nbsp; "
        f"${result.annual_savings_usd:,.0f} per year",
        "#16a34a",
        left_badge=_tasks_badge,
    ),
    unsafe_allow_html=True,
)
st.caption(
    "The hours themselves come from O*NET tasks × per-task time estimates × "
    "your volume sliders above. See the per-task breakdown at the bottom of "
    "the page for every row of the math."
)

st.markdown("---")


# ---------------------------------------------------------------------------
# Who does what — 3 capability cards
# ---------------------------------------------------------------------------
st.markdown(f"### Who does what {chip('ai')}", unsafe_allow_html=True)
total_tasks = len(result.per_task)
st.markdown(
    f"<div style='color:#334155;'>"
    f"<strong>How to read this:</strong> The U.S. Department of Labor's O*NET "
    f"database says a {meta['title'].rstrip('s')} does <strong>{total_tasks} distinct "
    f"work tasks</strong>. For each one, GPT-4.1-nano looked at the task wording "
    f"and made a judgment call: "
    f"<span style='color:#16a34a;font-weight:600;'>can an AI do it alone?</span>, "
    f"<span style='color:#d97706;font-weight:600;'>does AI just help a person?</span>, "
    f"or <span style='color:#475569;font-weight:600;'>must a person do it?</span> "
    f"The three cards below show the three groups. "
    f"<em>Click a card</em> to see exactly which tasks landed in that bucket and why."
    f"</div>",
    unsafe_allow_html=True,
)

cap_cols = st.columns(3)
for col, cap_key in zip(cap_cols, ("auto", "assist", "human_only")):
    v = result.by_capability[cap_key]
    color = CAPABILITY_COLORS[cap_key]
    title = CAPABILITY_PLAIN[cap_key]
    with col:
        st.markdown(
            f"""
            <div style="border-left:6px solid {color};border-radius:8px;
                        background:#f8fafc;padding:14px 16px;">
              <div style="font-weight:600;font-size:1.05em;color:{color};">{title}</div>
              <div style="font-size:0.85em;color:#475569;margin-top:2px;">
                {v.task_count} of {total_tasks} tasks
              </div>
              <div style="font-size:1.5em;font-weight:600;margin-top:10px;color:#0f172a;">
                ${v.human_cost_per_week:,.0f}<span style="font-size:0.55em;color:#475569;"> /wk total</span>
              </div>
              <div style="font-size:1em;color:{color};margin-top:6px;">
                AI saves <strong>${v.savings_per_week:,.0f}/wk</strong>
                ({v.savings_hours_per_week:.0f} hrs/wk)
              </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        # Click-to-expand list of the actual tasks in this bucket.
        with st.popover(
            f"📋 View {v.task_count} tasks in this bucket",
            width="stretch",
        ):
            bucket_tasks = [t for t in result.per_task if t.ai_capability == cap_key]
            bucket_tasks.sort(key=lambda t: t.savings_per_week, reverse=True)
            st.markdown(
                f"<div style='font-size:0.95em;color:#0f172a;'>"
                f"<strong>{title}</strong> &nbsp;·&nbsp; "
                f"{v.task_count} O*NET tasks for {meta['title']}"
                f"</div>",
                unsafe_allow_html=True,
            )
            for bt in bucket_tasks:
                drv = DRIVER_PLAIN.get(bt.driver, bt.driver)
                pct_saved = (
                    100.0 * (bt.human_minutes - bt.ai_minutes) / bt.human_minutes
                    if bt.human_minutes > 0 else 0.0
                )
                st.markdown(
                    f"<div style='border:1px solid #e5e7eb;border-left:5px solid {color};"
                    f"border-radius:6px;padding:10px 12px;margin:8px 0;background:#ffffff;'>"
                    f"<div style='font-weight:600;color:#0f172a;font-size:0.95em;'>"
                    f"[{bt.task_id}] {bt.description}</div>"
                    f"<div style='color:#475569;font-size:0.85em;margin-top:4px;font-style:italic;'>"
                    f"{bt.rationale}</div>"
                    f"<div style='font-size:0.8em;color:#64748b;margin-top:6px;'>"
                    f"Triggered by <strong>{drv}</strong>"
                    f"<br/>Per event: <strong>{bt.human_minutes:.0f} min</strong> person "
                    f"→ <strong style='color:{color};'>{bt.ai_minutes:.0f} min</strong> "
                    f"with AI ({pct_saved:.0f}% time saved)"
                    f"<br/>This week: person would spend "
                    f"<strong>{bt.human_hours_per_week:.1f} hrs</strong>"
                    + (f" &nbsp;·&nbsp; AI saves "
                       f"<strong style='color:#15803d;'>${bt.savings_per_week:,.0f}/wk</strong>"
                       if bt.savings_per_week > 0
                       else " &nbsp;·&nbsp; <span style='color:#475569;'>no AI savings</span>")
                    + "</div>"
                    f"</div>",
                    unsafe_allow_html=True,
                )

st.markdown("---")


# ---------------------------------------------------------------------------
# Top 5 — actionable list, plain language
# ---------------------------------------------------------------------------
st.markdown(f"### Top 5 things AI can take off your plate {chip('ai')}", unsafe_allow_html=True)
st.caption("Sorted by weekly dollar savings, biggest first.")

top = sorted(result.per_task, key=lambda t: t.savings_per_week, reverse=True)[:5]
for i, t in enumerate(top, 1):
    color = CAPABILITY_COLORS[t.ai_capability]
    cap_label = CAPABILITY_PLAIN[t.ai_capability]
    driver_label = DRIVER_PLAIN.get(t.driver, t.driver)
    minutes_pct_saved = (
        100.0 * (t.human_minutes - t.ai_minutes) / t.human_minutes
        if t.human_minutes > 0
        else 0.0
    )
    st.markdown(
        f"""
        <div style="border:1px solid #e5e7eb;border-left:6px solid {color};
                    border-radius:8px;background:#ffffff;padding:14px 16px;
                    margin-bottom:10px;">
          <div style="font-size:1.05em;font-weight:600;color:#0f172a;">
            {i}. {t.description}
          </div>
          <div style="font-size:0.88em;color:#475569;margin-top:4px;font-style:italic;">
            {t.rationale}
          </div>
          <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:10px;font-size:0.9em;">
            <div><strong style="color:{color};">{cap_label}</strong></div>
            <div>Happens with <strong>{driver_label}</strong></div>
            <div>Per event: <strong>{t.human_minutes:.0f} min</strong> person
                 →  <strong style="color:{color};">{t.ai_minutes:.0f} min</strong>
                 with AI ({minutes_pct_saved:.0f}% time saved)</div>
            <div>Saves <strong>${t.savings_per_week:,.0f}/wk</strong>
              ({t.savings_hours_per_week:.1f} hrs)</div>
            <div style="color:#94a3b8;">O*NET Task ID: {t.task_id}</div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


# ---------------------------------------------------------------------------
# Bar chart — smaller, simpler labels, full text on hover
# ---------------------------------------------------------------------------
st.markdown("---")
st.markdown(
    f"### How weekly hours split across the {total_tasks} tasks {chip('calc')}",
    unsafe_allow_html=True,
)
st.caption(
    "Each row is one O*NET task. Blue bar = hours a human would spend. "
    "Grey bar = hours still needed after AI helps. Hover any bar for the "
    "full task description."
)

df_tasks = pd.DataFrame([t.__dict__ for t in result.per_task])
df_chart_long = pd.concat(
    [
        df_tasks.assign(kind="Human hours", hours=df_tasks["human_hours_per_week"]),
        df_tasks.assign(kind="After AI helps", hours=df_tasks["ai_hours_per_week"]),
    ],
    ignore_index=True,
)
df_chart_long["label"] = df_chart_long["task_id"].apply(lambda tid: f"[{tid}]")

chart = (
    alt.Chart(df_chart_long)
    .mark_bar()
    .encode(
        x=alt.X("hours:Q", title="Hours per week"),
        y=alt.Y(
            "label:N",
            title="O*NET Task ID (hover for description)",
            sort=alt.SortField(field="human_hours_per_week", order="descending"),
            axis=alt.Axis(labelFontSize=11),
        ),
        color=alt.Color(
            "kind:N",
            title="",
            scale=alt.Scale(
                domain=["Human hours", "After AI helps"],
                range=["#1f6feb", "#9ca3af"],
            ),
            legend=alt.Legend(orient="bottom"),
        ),
        yOffset="kind:N",
        tooltip=[
            alt.Tooltip("task_id:N", title="Task ID"),
            alt.Tooltip("description:N", title="Task"),
            alt.Tooltip("ai_capability:N", title="AI capability"),
            alt.Tooltip("driver:N", title="Scales with"),
            alt.Tooltip("kind:N", title="Series"),
            alt.Tooltip("hours:Q", title="Hours/wk", format=".2f"),
        ],
    )
    .properties(height=480)
)
st.altair_chart(chart, use_container_width=True)


# ---------------------------------------------------------------------------
# Full per-task breakdown (collapsible, kept for audit)
# ---------------------------------------------------------------------------
with st.expander(f"See the full breakdown of all {total_tasks} tasks", expanded=False):
    df_full = pd.DataFrame([t.__dict__ for t in result.per_task]).sort_values(
        "savings_per_week", ascending=False
    )
    df_full["ai_capability"] = df_full["ai_capability"].map(CAPABILITY_PLAIN)
    df_full["driver"] = df_full["driver"].map(DRIVER_PLAIN)
    df_full = df_full[
        [
            "task_id",
            "description",
            "ai_capability",
            "driver",
            "units_per_week",
            "human_hours_per_week",
            "ai_hours_per_week",
            "human_cost_per_week",
            "savings_per_week",
            "rationale",
        ]
    ]
    df_full.columns = [
        "Task ID",
        "O*NET Task",
        "AI capability",
        "Scales with",
        "Units/wk",
        "Human hrs/wk",
        "AI hrs/wk",
        "Cost/wk ($)",
        "Savings/wk ($)",
        "Why this label",
    ]
    st.dataframe(df_full, hide_index=True, width="stretch", height=520)


# ---------------------------------------------------------------------------
# Where each number comes from — explicit data lineage at the bottom
# ---------------------------------------------------------------------------
st.markdown("---")
st.markdown(f"### Where each number comes from")

lineage = [
    (
        "onet",
        f"The {total_tasks} tasks and their official names",
        f"U.S. O*NET database v30.2, occupation code {soc} ({meta['title']}) "
        f"— currently reading from {src.upper()}",
    ),
    (
        "onet",
        "How important each task is (1–5 score)",
        "O*NET Task Ratings, scale ID = 'IM' (Importance), averaged across "
        "survey respondents",
    ),
    (
        "ai",
        "Whether AI can do it alone, help, or not help",
        f"GPT-4.1-nano classifier — sees each O*NET task description for "
        f"{meta['title']} and assigns one of three labels. Cached in "
        f"artifacts/profiles/{soc}.json",
    ),
    (
        "ai",
        "How many minutes each task takes",
        "GPT-4.1-nano estimate — uses industry-typical numbers (SHRM, "
        "LinkedIn Talent Solutions, professional bodies). Override any row "
        "in the JSON to use your own measured numbers.",
    ),
    (
        "ai",
        "What scales the task (per application / per hire / etc.)",
        "GPT-4.1-nano classifier — same source as the AI capability label",
    ),
    (
        "wage",
        "Pay rate (default $32.27/hr)",
        "Default is U.S. BLS Occupational Employment Statistics, May 2024, "
        f"SOC 13-1071 (Human Resources Specialists). For {meta['title']}, "
        "look up the correct median wage on [BLS OES]"
        "(https://www.bls.gov/oes/) and override the slider above.",
    ),
    (
        "calc",
        "Total hours, costs, savings on this page",
        "Math: minutes-per-task × units-per-week × your sliders. Run "
        f"`python scripts/cost_calculator.py {soc}` to see the math directly",
    ),
]

for kind, what, where in lineage:
    color = SRC[kind][0]
    st.markdown(
        f"<div style='display:flex;gap:14px;align-items:flex-start;"
        f"margin:6px 0;padding:8px 12px;background:#f8fafc;border-radius:6px;"
        f"border-left:4px solid {color};'>"
        f"<div style='min-width:260px;font-weight:600;color:#0f172a;'>{what}</div>"
        f"<div style='color:#334155;'>{where}</div>"
        f"</div>",
        unsafe_allow_html=True,
    )
