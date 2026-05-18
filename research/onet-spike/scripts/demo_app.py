"""
Streamlit demo UI for the O*NET-grounded recruiting agent.

Run from the spike root:
    python -m streamlit run scripts/demo_app.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

# Make sibling imports work when streamlit launches the file directly.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from onet_data import (  # noqa: E402
    MEDIAN_HOURLY_WAGE_USD,
    SOC_RECRUITER,
    recruiter_tasks,
)
from recruit_agent import run_agent  # noqa: E402


SAMPLE_JOB = """Senior Technical Recruiter — Software Engineering

We're hiring a recruiter to own the full lifecycle for software engineering
roles on our platform team. Responsibilities:
- Source candidates via LinkedIn Recruiter, GitHub, referrals
- Conduct technical phone screens and behavioral screens
- Schedule and coordinate onsite interview loops
- Partner with hiring managers on calibration and offer strategy
- Maintain candidate pipeline in Greenhouse ATS
- Ensure EEOC and OFCCP compliance in all hiring decisions

Requirements:
- 4+ years recruiting experience, ideally in tech
- Strong written and verbal communication
- Familiarity with US employment law (EEOC, ADA)
- Bachelor's degree preferred
"""

SAMPLE_RESUME = """Priya Sharma — priya.sharma@example.com — Bangalore, India

EXPERIENCE
Senior Recruiter — TechScale (Series C SaaS startup), 2022 — present
  - Closed 80+ SWE hires in 2024 across India and US offices
  - Owned full lifecycle: sourcing, screening, scheduling, offer negotiation
  - Built sourcing pipelines via LinkedIn Recruiter and GitHub
  - Partnered with engineering leadership on hiring plans and calibration

Recruiter — Infosys, 2019 — 2022
  - Campus and lateral hiring for India delivery centers
  - Trained on EEOC compliance basics

SKILLS
  Tools: LinkedIn Recruiter, Greenhouse ATS, Lever, Boolean search
  Languages: English (fluent), Hindi (native), conversational Tamil

EDUCATION
  Bachelor's in Psychology, University of Delhi, 2019
"""


st.set_page_config(page_title="Fuzebox — O*NET Grounded Recruiter Agent", layout="wide")

st.title("Fuzebox — O*NET-Grounded Recruiter Agent")
st.caption(
    f"Every decision cites a U.S. Department of Labor O*NET Task ID from "
    f"SOC {SOC_RECRUITER} (Human Resources Specialists). "
    f"Effort math uses BLS OES median wage ${MEDIAN_HOURLY_WAGE_USD}/hr."
)

with st.expander(f"View the {len(recruiter_tasks())} O*NET recruiter tasks the agent draws from"):
    import pandas as pd

    st.dataframe(
        pd.DataFrame(recruiter_tasks())[["task_id", "importance", "task_type", "description"]],
        use_container_width=True,
        hide_index=True,
    )

col_l, col_r = st.columns(2)
with col_l:
    st.subheader("Job description")
    job = st.text_area("Job description", value=SAMPLE_JOB, height=300, label_visibility="collapsed")
with col_r:
    st.subheader("Candidate resume")
    resume = st.text_area("Candidate resume", value=SAMPLE_RESUME, height=300, label_visibility="collapsed")

run_btn = st.button("Run Agent", type="primary", use_container_width=True)

if run_btn:
    if not job.strip() or not resume.strip():
        st.error("Both job description and candidate resume are required.")
        st.stop()

    with st.spinner("Agent running — calling O*NET tools + LLM..."):
        result = run_agent(job, resume)

    if result.error:
        st.error(f"Agent error: {result.error}")
        st.stop()

    decision = result.decision or {}
    effort = result.effort or {}

    # Top-line summary
    score = decision.get("overall_fit_score", "—")
    action = decision.get("recommended_action", "—")
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Overall fit", f"{score}/100")
    m2.metric(
        "Recommended action",
        action.replace("_", " ").title() if isinstance(action, str) else "—",
    )
    m3.metric("Recruiter-hours displaced", f"{effort.get('estimated_hours', '—')} hrs")
    dollar = effort.get("estimated_dollar_value")
    m4.metric(
        "Dollar value displaced",
        f"${dollar:,.2f}" if isinstance(dollar, (int, float)) else "—",
    )

    st.divider()
    st.subheader("Candidate summary")
    st.write(decision.get("candidate_summary", "—"))

    col_s, col_g = st.columns(2)
    with col_s:
        st.subheader("Strengths (O*NET-anchored)")
        for s in decision.get("strengths") or []:
            st.markdown(f"- {s}")
    with col_g:
        st.subheader("Gaps (O*NET-anchored)")
        for g in decision.get("gaps") or []:
            st.markdown(f"- {g}")

    st.divider()
    st.subheader("Interview questions — each tagged with an O*NET Task ID")
    task_index = {t["task_id"]: t for t in recruiter_tasks()}
    for q in decision.get("interview_questions") or []:
        tid = q.get("onet_task_id")
        task_desc = task_index.get(tid, {}).get("description", "")
        with st.container(border=True):
            st.markdown(f"**Q.** {q.get('question', '')}")
            st.caption(
                f"Probes O*NET Task {tid} — {task_desc[:120]}{'…' if len(task_desc) > 120 else ''}"
            )
            if q.get("purpose"):
                st.caption(f"Purpose: {q['purpose']}")

    st.divider()
    st.subheader("Rationale")
    st.write(decision.get("rationale", "—"))

    st.divider()
    st.subheader("Effort & dollar-value breakdown")
    st.json(effort)

    st.subheader("O*NET tasks the agent matched")
    matched_ids = decision.get("matched_onet_task_ids") or []
    matched_rows = [task_index[i] for i in matched_ids if i in task_index]
    if matched_rows:
        import pandas as pd

        st.dataframe(
            pd.DataFrame(matched_rows)[["task_id", "importance", "task_type", "description"]],
            use_container_width=True,
            hide_index=True,
        )

    with st.expander("Full agent trace (tool calls)"):
        for step in result.trace:
            st.markdown(f"**Turn {step.get('turn')}** — `{step.get('kind')}` `{step.get('name', '')}`")
            if step.get("args"):
                st.code(str(step["args"]), language="json")
            if step.get("result_preview"):
                st.code(step["result_preview"], language="json")
            if step.get("content"):
                st.write(step["content"])

else:
    st.info("Edit the job + resume above (or use the baked-in samples), then click **Run Agent**.")
