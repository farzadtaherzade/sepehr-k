"""Read-only PostgreSQL access for the analytics agent.

Two layers of protection, because the agent generates SQL from a language model:

1. The connection itself uses the `analytics_readonly` role (SELECT-only grants,
   created by db/schema.sql). Even a malicious statement cannot write.
2. `run_sql` rejects anything that is not a single SELECT/WITH statement, and
   runs the query inside a READ ONLY transaction with a statement timeout, so a
   runaway query cannot pin the database.

If ANALYTICS_DB_URL is not set, the agent refuses to start rather than falling
back to a superuser connection.
"""

from __future__ import annotations

import os
import re
import sys
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import psycopg2
import psycopg2.extras

# Windows consoles default to cp1252; project names and trade titles are Persian.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Statements that must never appear in generated SQL.
FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|"
    r"vacuum|analyze|reindex|refresh|call|do|set|reset|begin|commit|rollback|"
    r"savepoint|listen|notify|lock|prepare|execute|merge)\b",
    re.IGNORECASE,
)

STATEMENT_TIMEOUT_MS = 15_000
MAX_ROWS = 500


class SqlRejected(Exception):
    """The generated SQL failed the read-only safety check."""


@dataclass
class QueryResult:
    columns: list[str]
    rows: list[tuple]
    truncated: bool

    def as_dicts(self) -> list[dict[str, Any]]:
        return [dict(zip(self.columns, row)) for row in self.rows]

    def to_text(self, max_rows: int = 200) -> str:
        """Render as a compact markdown-ish table for the LLM."""
        if not self.rows:
            return "(no rows)"
        shown = self.rows[:max_rows]
        lines = [" | ".join(self.columns), "-" * 40]
        for row in shown:
            lines.append(" | ".join(_fmt(v) for v in row))
        if len(self.rows) > max_rows or self.truncated:
            lines.append(f"... ({len(self.rows)} rows shown, result was capped)")
        return "\n".join(lines)


def _fmt(v: Any) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, Decimal):
        return f"{v:,.4f}".rstrip("0").rstrip(".")
    if isinstance(v, float):
        return f"{v:,.4f}".rstrip("0").rstrip(".")
    return str(v)


def get_connection_url() -> str:
    url = os.environ.get("ANALYTICS_DB_URL")
    if not url:
        raise RuntimeError(
            "ANALYTICS_DB_URL is not set. It must point at the read-only role, e.g.\n"
            "  postgresql://analytics_readonly:readonly_secret_pass@localhost:5433/evm_db\n"
            "Refusing to fall back to a privileged connection."
        )
    return url


def validate_sql(sql: str) -> str:
    """Reject anything that is not one read-only SELECT/WITH statement."""
    cleaned = sql.strip().rstrip(";").strip()
    if not cleaned:
        raise SqlRejected("Empty SQL statement.")

    # Strip string literals and comments before scanning, so a literal like
    # 'delete meeting' inside a LIKE clause doesn't trip the keyword check.
    scannable = re.sub(r"'(?:[^']|'')*'", "''", cleaned)
    scannable = re.sub(r"--[^\n]*", " ", scannable)
    scannable = re.sub(r"/\*.*?\*/", " ", scannable, flags=re.DOTALL)

    if ";" in scannable:
        raise SqlRejected("Multiple statements are not allowed.")

    first_word = re.match(r"\s*(\w+)", scannable)
    if not first_word or first_word.group(1).lower() not in {"select", "with"}:
        raise SqlRejected("Only SELECT (or WITH ... SELECT) queries are allowed.")

    bad = FORBIDDEN.search(scannable)
    if bad:
        raise SqlRejected(f"Forbidden keyword in generated SQL: '{bad.group(1)}'")

    return cleaned


def run_sql(sql: str, max_rows: int = MAX_ROWS) -> QueryResult:
    safe = validate_sql(sql)
    url = get_connection_url()

    conn = psycopg2.connect(url)
    try:
        conn.set_session(readonly=True, autocommit=False)
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(f"SET LOCAL statement_timeout = {STATEMENT_TIMEOUT_MS}")
            cur.execute(safe)
            rows_raw = cur.fetchmany(max_rows + 1)
            columns = [d.name for d in cur.description] if cur.description else []
        conn.rollback()  # nothing to commit; release locks
    finally:
        conn.close()

    truncated = len(rows_raw) > max_rows
    rows = [tuple(r.values()) for r in rows_raw[:max_rows]]
    return QueryResult(columns=columns, rows=rows, truncated=truncated)


def get_schema_ddl() -> str:
    """Introspect the live schema so the model always sees the real columns."""
    sql = """
        SELECT c.table_name, c.column_name, c.data_type
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_name = c.table_name AND t.table_schema = c.table_schema
        WHERE c.table_schema = 'public'
          AND t.table_type IN ('BASE TABLE', 'VIEW')
        ORDER BY c.table_name, c.ordinal_position
    """
    result = run_sql(sql, max_rows=1000)
    by_table: dict[str, list[str]] = {}
    for table, column, dtype in result.rows:
        by_table.setdefault(table, []).append(f"{column} {dtype}")
    return "\n".join(f"{t}({', '.join(cols)})" for t, cols in by_table.items())
