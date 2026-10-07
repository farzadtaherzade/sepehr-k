"""EVM Analytics Agent - Text-to-SQL over the project data platform.

How it works:
  1. The user asks a question in plain language ("which projects have CPI below 0.9?").
  2. Claude is given two tools: introspect the schema, and run a read-only SQL query.
  3. Claude writes SQL, the tool executes it against the `analytics_readonly` role,
     and the numeric rows go back to Claude.
  4. Claude returns an analytical explanation - the reasoning, not just the number.

No embeddings and no vector store: every question is answered from structured data.
If narrative documents (contracts, meeting minutes) are added later, enable
pgvector on this same database and add a retrieval tool alongside these.

Model note: defaults to claude-opus-5. Override with EVM_AGENT_MODEL.
"""

from __future__ import annotations

import json
import os
from typing import Any

import anthropic
from anthropic import beta_tool

import db

DEFAULT_MODEL = os.environ.get("EVM_AGENT_MODEL", "claude-opus-5")

SYSTEM_PROMPT = """You are an Earned Value Management (EVM) analyst for a construction \
contracting company. You answer questions about project performance by querying a \
PostgreSQL database through the read-only tools provided.

The data model (all tables are in the `public` schema):
  dim_project                      one row per project (name, contract_start_date)
  dim_contractor_category          trades/disciplines (title slug, title_fa Persian label, aliases)
  contract_revision                contract amount & duration per revision_no (0,1,2,3)
  contract_extension               approved time extensions per project
  project_snapshot                 one row per project per report_date - the EVM facts
  snapshot_revision_progress       per-REV progress & EV/PV for a snapshot
  snapshot_contractor_headcount    average manpower per trade, per snapshot

Key columns in project_snapshot:
  progress_physical_actual / _planned   physical progress, stored as a FRACTION (0.45 = 45%)
  progress_rial_actual / _planned       monetary progress, same fraction convention
  time_elapsed_days, time_progress_pct  schedule position (pct also a fraction)
  pv (Planned Value), ev (Earned Value), actual_cost (AC)   -- amounts in Rial
  spi (EV/PV), cpi (EV/AC)              performance indices (1.0 = on plan)
  gross_payment, net_payment            amounts paid by the client (Rial)
  revenue, production, commitments      Rial
  overhead_cost, equipment_cost         Rial
  last_progress_statement               مجموع صورت وضعیت تایید شده
  last_adjustment_statement             صورت وضعیت تعدیل تایید شده
  revenue_to_cost_ratio                 درآمد / هزینه
  overhead_to_production_ratio          بالاسری / تولید
  equipment_to_production_ratio         تجهیز / تولید
  commitments_to_production_ratio       تعهدات / تولید
  collection_rate                       درصد وصول مطالبات (fraction)
  avg_monthly_headcount                 متوسط نیروی انسانی in the month

IMPORTANT about units:
  - All progress/ratio columns are FRACTIONS, not percentages: 0.45 means 45%.
    Multiply by 100 when presenting them to the user as percentages.
  - Monetary columns are in Iranian Rial and are very large (billions/trillions).
  - snapshot_contractor_headcount.headcount is an AVERAGE for the period and is
    fractional (e.g. 17.37 people), not a rounded headcount.
  - cpi is often NULL: it is only populated once actual cost is recorded, which
    happens late in a project. Do not treat a NULL CPI as a zero or a failure.
  - SPI can exceed 1.0 substantially and can be 0 early in a project.

There are four convenience views:
  v_project_latest_snapshot     most recent snapshot per project, with sv/cv computed
  v_evm_distress_alerts         latest snapshot with a health_status label
  v_snapshot_total_headcount    total headcount per snapshot
  v_project_revision_progress   per-REV progress/EV/PV with revision_spi

Method:
  - Call get_database_schema first if you are unsure about column names.
  - Write ONE SELECT statement per call. Never attempt to modify data - it is blocked.
  - Prefer the views for "latest status" questions; query project_snapshot directly
    when you need a time series.
  - Interpret the numbers afterwards: SPI < 1 means behind schedule, CPI < 1 means
    over budget. Explain the likely cause using the supporting columns you retrieved
    (e.g. a falling CPI alongside rising overhead_cost), and state what you would
    check next. Do not just restate the numbers.
  - If the data is insufficient to answer, say so and name the query that would.

Answer in the language the user asked in (Persian or English)."""


@beta_tool
def get_database_schema() -> str:
    """Return the live database schema: every table/view with its column names and types.
    Call this before writing SQL if you are unsure which columns exist."""
    try:
        return db.get_schema_ddl()
    except Exception as exc:  # surfaced to the model so it can adapt
        return f"ERROR retrieving schema: {exc}"


@beta_tool
def run_sql_query(sql: str) -> str:
    """Execute a read-only SELECT query and return the result rows.

    Args:
        sql: A single SELECT (or WITH ... SELECT) statement. No semicolons,
            no multiple statements, no data modification - those are rejected.
    """
    try:
        result = db.run_sql(sql)
    except db.SqlRejected as exc:
        return (
            f"QUERY REJECTED: {exc}\n"
            "Only a single read-only SELECT statement is permitted. Rewrite the query."
        )
    except Exception as exc:
        return f"QUERY ERROR: {exc}\nInspect the schema and correct the SQL."

    header = f"rows_returned={len(result.rows)}"
    if result.truncated:
        header += " (result capped; add a LIMIT or aggregate)"
    return f"{header}\n{result.to_text()}"


class AnalyticsAgent:
    def __init__(self, model: str = DEFAULT_MODEL, max_iterations: int = 12):
        # Anthropic() resolves credentials from ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN,
        # or an `ant auth login` profile.
        self.client = anthropic.Anthropic()
        self.model = model
        self.max_iterations = max_iterations

    def ask(self, question: str, verbose: bool = False) -> str:
        """Answer one question. Returns the analyst's written explanation."""
        runner = self.client.beta.messages.tool_runner(
            model=self.model,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            thinking={"type": "adaptive"},
            tools=[get_database_schema, run_sql_query],
            messages=[{"role": "user", "content": question}],
        )

        last_message = None
        for i, message in enumerate(runner):
            last_message = message
            if verbose:
                _print_step(i, message)
            if i >= self.max_iterations:
                break

        if last_message is None:
            return "(no response from the model)"

        return _extract_text(last_message)

    def ask_streaming(self, question: str) -> str:
        """Single-shot question with a streamed final answer (nicer for long analyses)."""
        runner = self.client.beta.messages.tool_runner(
            model=self.model,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            thinking={"type": "adaptive"},
            tools=[get_database_schema, run_sql_query],
            messages=[{"role": "user", "content": question}],
        )
        last = None
        for message in runner:
            last = message
        return _extract_text(last) if last else "(no response)"


def _extract_text(message: Any) -> str:
    parts: list[str] = []
    for block in getattr(message, "content", []) or []:
        if getattr(block, "type", None) == "text":
            parts.append(block.text)
    return "\n".join(parts).strip() or "(the model returned no text)"


def _print_step(i: int, message: Any) -> None:
    """Show which tool the agent is calling at each step (stderr-ish trace)."""
    for block in getattr(message, "content", []) or []:
        btype = getattr(block, "type", None)
        if btype == "tool_use":
            args = block.input if isinstance(block.input, dict) else {}
            preview = args.get("sql", "")
            if preview:
                preview = " ".join(str(preview).split())[:160]
                print(f"  [{i}] SQL> {preview}")
            else:
                print(f"  [{i}] tool> {block.name}")
        elif btype == "text" and getattr(block, "text", "").strip():
            print(f"  [{i}] ...")


# ---------------------------------------------------------------------------
# Scheduled / batch checks: the deviation patterns the brief calls for
# ---------------------------------------------------------------------------

STANDARD_CHECKS = {
    # CPI is NULL until actual cost is booked, so results here are usually a
    # subset of projects - that is expected, not a query bug.
    "cost_overrun": """
        SELECT project_name, report_date, cpi, spi, cv
        FROM v_project_latest_snapshot
        WHERE cpi IS NOT NULL AND cpi < 0.9
        ORDER BY cpi ASC
    """,
    "schedule_slip": """
        SELECT project_name, report_date, spi, cpi, sv,
               ROUND(progress_physical_actual * 100, 2) AS physical_pct,
               ROUND(time_progress_pct * 100, 2)         AS time_elapsed_pct
        FROM v_project_latest_snapshot
        WHERE spi IS NOT NULL AND spi > 0 AND spi < 0.9
        ORDER BY spi ASC
    """,
    # Projects where physical progress lags elapsed time - the plain-language
    # form of "behind schedule" and independent of SPI's early-project noise.
    "progress_vs_time": """
        SELECT project_name, report_date,
               ROUND(progress_physical_actual * 100, 2) AS physical_pct,
               ROUND(time_progress_pct * 100, 2)         AS time_elapsed_pct,
               ROUND((progress_physical_actual - time_progress_pct) * 100, 2) AS gap_pct
        FROM v_project_latest_snapshot
        WHERE progress_physical_actual IS NOT NULL AND time_progress_pct IS NOT NULL
        ORDER BY gap_pct ASC
    """,
    "headcount_swing": """
        SELECT project_name, report_date, trade,
               prev_headcount, headcount,
               ROUND(headcount - prev_headcount, 2)       AS change,
               CASE WHEN headcount > prev_headcount THEN 'increase' ELSE 'decrease' END AS direction
        FROM (
            SELECT p.name AS project_name, s.report_date, c.title_fa AS trade,
                   h.headcount,
                   LAG(h.headcount) OVER (
                       PARTITION BY s.project_id, h.contractor_category_id
                       ORDER BY s.report_date
                   ) AS prev_headcount
            FROM snapshot_contractor_headcount h
            JOIN project_snapshot s ON s.id = h.snapshot_id
            JOIN dim_project p ON p.id = s.project_id
            JOIN dim_contractor_category c ON c.id = h.contractor_category_id
        ) t
        WHERE prev_headcount IS NOT NULL
          AND ABS(headcount - prev_headcount) > 5
        ORDER BY ABS(headcount - prev_headcount) DESC
    """,
}


def run_checks(agent: AnalyticsAgent, checks: list[str] | None = None) -> dict[str, str]:
    """Run the predefined deviation queries and have the agent explain each."""
    names = checks or list(STANDARD_CHECKS)
    out: dict[str, str] = {}
    for name in names:
        sql = STANDARD_CHECKS[name]
        print(f"\n=== {name} ===")
        try:
            result = db.run_sql(sql)
            table = result.to_text()
        except Exception as exc:
            out[name] = f"query failed: {exc}"
            print(out[name])
            continue
        print(table)
        out[name] = agent.ask(
            f"Here is the raw result of the '{name}' check:\n\n{table}\n\n"
            "Explain what stands out, what it likely means for these projects, and "
            "what should be investigated next. Be concise and specific."
        )
        print(f"\n--- analysis ---\n{out[name]}\n")
    return out
