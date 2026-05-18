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

# Allow sibling imports (onet_data, cost_calculator).
sys.path.insert(0, str(Path(__file__).resolve().parent))

from cost_calculator import CalculatorInputs, calculate  # noqa: E402
from onet_data import MEDIAN_HOURLY_WAGE_USD, SOC_RECRUITER, active_source  # noqa: E402


CAPABILITY_COLORS = {
    "auto": "#1f9d55",       # green
    "assist": "#d49b3a",     # amber
    "human_only": "#6b7280", # grey
}

CAPABILITY_LABELS = {
    "auto": "Auto — AI handles end-to-end",
    "assist": "Assist — AI prepares, human reviews",
    "human_only": "Human-only — judgment/sensitive",
}


st.set_page_config(
    page_title="Recruitment Effort Calculator — O*NET-Grounded",
    layout="wide",
    initial_sidebar_state="collapsed",
)


# -----------------------------------------------------------------------------
# Header
# -----------------------------------------------------------------------------
st.title("Recruitment Effort Calculator")
src = active_source()
badge = (
    "🟢 **API LIVE** (api-v2.onetcenter.org)"
    if src == "api"
    else "🟡 **Excel fallback** (v30.2 local dump)"
)
st.markdown(
    f"O*NET-grounded effort & cost model for SOC "
    f"[**{SOC_RECRUITER}** — Human Resources Specialists]"
    f"(https://www.onetonline.org/link/summary/{SOC_RECRUITER}). "
    f"Data source: {badge}"
)

with st.expander("Why SOC 13-1071.00?", expanded=False):
    st.markdown(
        "**SOC 13-1071.00 — Human Resources Specialists** is the U.S. Bureau "
        "of Labor Statistics occupation code that covers the bulk of recruitment "
        "work. Earlier O*NET releases had a separate `13-1071.01` *Recruiters* "
        "code; in O*NET v30.2 that role was rolled into `13-1071.00`, which now "
        "spans the full recruiting + HR-specialist task set. We pick it because:\n\n"
        "- It has the **densest task coverage** for recruiting work — 26 distinct tasks.\n"
        "- It has **wage data** in BLS Occupational Employment Statistics, "
        "which we use for cost math.\n"
        "- Andy's brief said *\"HR recruitment as demo tasks\"* — this SOC "
        "is the official taxonomy match.\n\n"
        "Later we can extend the model to other SOCs (software engineering = "
        "`15-1252.00`, sales = `41-3091.00`, etc.) by changing one constant "
        "in `onet_data.py`."
    )


# -----------------------------------------------------------------------------
# Volume inputs — on the main page, not the sidebar
# -----------------------------------------------------------------------------
st.markdown("### Your team's volume")
st.caption(
    "Defaults below are illustrative sample numbers. Replace each one with "
    "your team's real figures (or your customer's) — every value below the "
    "fold recomputes instantly."
)

i1, i2, i3, i4, i5 = st.columns(5)
with i1:
    open_reqs = st.slider("Open requisitions", 1, 50, 15)
with i2:
    applications_per_week = st.slider("Applications per week", 10, 2000, 200, step=10)
with i3:
    phone_screens_per_week = st.slider("Phone screens per week", 1, 200, 50)
with i4:
    hires_per_month = st.slider("Hires per month", 1, 50, 5)
with i5:
    wage_hourly_usd = st.number_input(
        "Median hourly wage (USD)",
        min_value=10.0,
        max_value=200.0,
        value=float(MEDIAN_HOURLY_WAGE_USD),
        step=0.50,
    )
    st.caption(
        "Default $32.27/hr — "
        "[BLS OES May 2024, SOC 13-1071]"
        "(https://www.bls.gov/oes/current/oes131071.htm)"
    )

inputs = CalculatorInputs(
    applications_per_week=applications_per_week,
    phone_screens_per_week=phone_screens_per_week,
    hires_per_month=hires_per_month,
    open_reqs=open_reqs,
    wage_hourly_usd=wage_hourly_usd,
)
result = calculate(inputs)

st.markdown("---")


# -----------------------------------------------------------------------------
# Top metric cards
# -----------------------------------------------------------------------------
m1, m2, m3, m4 = st.columns(4)
m1.metric(
    "Recruiter-hours / week",
    f"{result.weekly_human_hours:,.1f} hrs",
    help="Total weekly hours your recruiting team spends on the 26 O*NET tasks.",
)
m2.metric(
    "Recruiter cost / week",
    f"${result.weekly_human_cost_usd:,.0f}",
    help="Total weekly recruiter cost at the wage you set.",
)
m3.metric(
    "AI-saveable hours / week",
    f"{result.weekly_savings_hours:,.1f} hrs",
    delta=f"{result.automation_percent}% automation",
    delta_color="normal",
    help="Hours that AI agents could automate or assist away from a human.",
)
m4.metric(
    "AI savings ($)",
    f"${result.weekly_savings_usd:,.0f}/wk",
    delta=f"${result.annual_savings_usd:,.0f} annualized",
    delta_color="normal",
    help="Weekly + annual dollar savings if AI handles its share of tasks.",
)

st.markdown("---")


# -----------------------------------------------------------------------------
# Cost by AI capability — full-width row of 3 metric cards
# -----------------------------------------------------------------------------
st.subheader("Cost by AI capability")
cap_cols = st.columns(3)
for col, cap in zip(cap_cols, ("auto", "assist", "human_only")):
    v = result.by_capability[cap]
    color = CAPABILITY_COLORS[cap]
    label = CAPABILITY_LABELS[cap]
    with col:
        st.markdown(
            f"<div style='border-left:6px solid {color};padding:8px 12px;"
            f"background:rgba(255,255,255,0.04);border-radius:4px;'>"
            f"<div style='font-size:0.9em;opacity:0.85'>{label}</div>"
            f"<div style='font-size:1.6em;font-weight:600;margin-top:4px;'>"
            f"${v.human_cost_per_week:,.0f}/wk</div>"
            f"<div style='font-size:0.95em;color:#1f9d55;margin-top:2px;'>"
            f"Saves ${v.savings_per_week:,.0f}/wk &nbsp;·&nbsp; "
            f"{v.task_count} tasks &nbsp;·&nbsp; {v.savings_hours_per_week:.1f} hrs/wk</div>"
            f"</div>",
            unsafe_allow_html=True,
        )

st.markdown("")

# -----------------------------------------------------------------------------
# Weekly hours per O*NET task — full-width Altair chart with wrapped labels
# -----------------------------------------------------------------------------
st.subheader("Weekly hours per O*NET task")

df_tasks = pd.DataFrame([t.__dict__ for t in result.per_task])

# Build long-form data: one row per (task, hour-kind) for stacked / grouped bars.
def _short(desc: str, n: int = 90) -> str:
    return desc if len(desc) <= n else desc[: n - 1] + "…"

df_chart_long = pd.concat(
    [
        df_tasks.assign(
            kind="Human hours/wk",
            hours=df_tasks["human_hours_per_week"],
        ),
        df_tasks.assign(
            kind="AI-assisted hours/wk",
            hours=df_tasks["ai_hours_per_week"],
        ),
    ],
    ignore_index=True,
)
df_chart_long["label"] = df_chart_long["task_id"].apply(lambda tid: f"[{tid}]")
df_chart_long["capability_pretty"] = df_chart_long["ai_capability"].map(
    {k: v.split(" — ")[0] for k, v in CAPABILITY_LABELS.items()}
)

chart = (
    alt.Chart(df_chart_long)
    .mark_bar()
    .encode(
        x=alt.X("hours:Q", title="Hours per week"),
        y=alt.Y(
            "label:N",
            title="O*NET Task ID",
            sort=alt.SortField(field="human_hours_per_week", order="descending"),
            axis=alt.Axis(labelFontSize=12),
        ),
        color=alt.Color(
            "kind:N",
            title="",
            scale=alt.Scale(
                domain=["Human hours/wk", "AI-assisted hours/wk"],
                range=["#3b82f6", "#9ca3af"],
            ),
            legend=alt.Legend(orient="bottom"),
        ),
        yOffset="kind:N",
        tooltip=[
            alt.Tooltip("task_id:N", title="Task ID"),
            alt.Tooltip("description:N", title="Task"),
            alt.Tooltip("ai_capability:N", title="AI capability"),
            alt.Tooltip("driver:N", title="Driver"),
            alt.Tooltip("kind:N", title="Series"),
            alt.Tooltip("hours:Q", title="Hours/wk", format=".2f"),
        ],
    )
    .properties(height=560)
    .configure_axis(labelColor="#cbd5e1", titleColor="#cbd5e1")
    .configure_legend(labelColor="#cbd5e1", titleColor="#cbd5e1")
    .configure_view(strokeWidth=0)
)
st.altair_chart(chart, use_container_width=True)

# Legend below the chart (color swatches for AI capability per task — informational).
st.markdown("**AI capability legend**")
legend_cols = st.columns(3)
for col, cap in zip(legend_cols, ("auto", "assist", "human_only")):
    col.markdown(
        f"<span style='display:inline-block;width:14px;height:14px;"
        f"background:{CAPABILITY_COLORS[cap]};border-radius:3px;"
        f"margin-right:8px;vertical-align:middle;'></span>"
        f"**{cap.replace('_', ' ').title()}** — "
        f"{CAPABILITY_LABELS[cap].split(' — ')[1]}",
        unsafe_allow_html=True,
    )

st.markdown("---")


# -----------------------------------------------------------------------------
# Top savings opportunities
# -----------------------------------------------------------------------------
st.subheader("Top 5 AI savings opportunities")
top = sorted(result.per_task, key=lambda t: t.savings_per_week, reverse=True)[:5]
for t in top:
    with st.container(border=True):
        cols = st.columns([6, 2, 2, 2])
        cols[0].markdown(f"**[{t.task_id}]** {t.description}")
        cols[0].caption(f"_{t.rationale}_")
        cols[1].metric("Driver", t.driver.replace("_", " "))
        cols[2].metric("AI capability", t.ai_capability.replace("_", " ").title())
        cols[3].metric(
            "Savings",
            f"${t.savings_per_week:,.0f}/wk",
            delta=f"{t.savings_hours_per_week:.1f} hrs/wk",
            delta_color="normal",
        )


# -----------------------------------------------------------------------------
# Full per-task breakdown (collapsible)
# -----------------------------------------------------------------------------
with st.expander("Full per-task breakdown (all 26 O*NET tasks)", expanded=False):
    df_full = pd.DataFrame([t.__dict__ for t in result.per_task]).sort_values(
        "savings_per_week", ascending=False
    )
    df_full = df_full[
        [
            "task_id",
            "description",
            "importance",
            "ai_capability",
            "driver",
            "units_per_week",
            "human_hours_per_week",
            "ai_hours_per_week",
            "savings_hours_per_week",
            "human_cost_per_week",
            "savings_per_week",
            "rationale",
        ]
    ]
    df_full.columns = [
        "Task ID",
        "O*NET Task",
        "Importance",
        "AI capability",
        "Driver",
        "Units/wk",
        "Human hrs/wk",
        "AI hrs/wk",
        "Saved hrs/wk",
        "Cost/wk ($)",
        "Savings/wk ($)",
        "LLM rationale",
    ]
    st.dataframe(df_full, hide_index=True, width="stretch", height=540)


# -----------------------------------------------------------------------------
# Provenance footer
# -----------------------------------------------------------------------------
st.markdown("---")
st.caption(
    "**Provenance.** "
    f"Occupational tasks: O*NET v30.2 (source: {src.upper()}). "
    "Wages: U.S. BLS Occupational Employment & Wage Statistics, May 2024. "
    "AI-capability & time-per-task estimates: GPT-4.1-nano classifier "
    "(`scripts/classify_tasks.py`), cached in `artifacts/task-profiles.json`. "
    "Re-run the classifier to regenerate."
)
