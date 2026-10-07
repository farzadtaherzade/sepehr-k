#!/usr/bin/env python3
"""
migrate.py - One-off migration from the 'Master Database' Excel sheet into the
normalized EVM Postgres schema.

Subcommands:
  python migrate.py --inspect FILE.xlsx           # list sheet names + every column header
  python migrate.py FILE.xlsx                     # migrate (commits to DB)
  python migrate.py FILE.xlsx --dry-run           # parse + report, write nothing
  python migrate.py FILE.xlsx --mapping other.yaml

Behavior:
  - Idempotent: dim rows use ON CONFLICT; snapshots upsert on (project, report_date);
    headcount rows are replaced per snapshot. Re-running is safe.
  - Numbers with Persian digits and ',' / '،' separators are cleaned.
  - Jalali (Persian) dates like 1403/05/12 are converted to Gregorian.
"""

import argparse
import re
import sys
from pathlib import Path

import pandas as pd
import psycopg2
import yaml
from psycopg2.extras import execute_values

try:
    import jdatetime
    HAS_JDATETIME = True
except ImportError:
    HAS_JDATETIME = False

HERE = Path(__file__).parent
DEFAULT_MAPPING = HERE / "mapping.yaml"

# Windows consoles default to cp1252 and choke on Persian output.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ---------------------------------------------------------------------------
# Cell cleaning helpers
# ---------------------------------------------------------------------------

PERSIAN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")

# Columns of project_snapshot that may receive a raw Excel value.
# Anything outside this set is a mapping.yaml typo (revision_no is handled
# explicitly and project_id comes from the dimension table).
SNAPSHOT_FIELDS = {
    "report_date", "revision_no",
    "progress_physical_actual", "progress_physical_planned",
    "progress_rial_actual", "progress_rial_planned",
    "time_elapsed_days", "time_progress_pct",
    "gross_payment", "net_payment",
    "actual_cost", "overhead_cost", "equipment_cost", "commitments",
    "revenue", "production", "pv", "ev", "spi", "cpi",
    # extra metrics present in the source workbook
    "last_progress_statement", "last_adjustment_statement",
    "revenue_to_cost_ratio", "overhead_to_production_ratio",
    "equipment_to_production_ratio", "commitments_to_production_ratio",
    "collection_rate", "avg_monthly_headcount",
}

# Columns of snapshot_revision_progress.
REVISION_PROGRESS_FIELDS = {
    "progress_physical_actual", "progress_physical_planned",
    "progress_rial_actual", "progress_rial_planned",
    "ev", "pv",
}

# NOTE ON UNITS: the workbook stores progress and ratio columns as fractions
# (0.004 = 0.4%), and SPI/CPI as plain indices. We store exactly what the source
# contains - no rescaling. Multiplying by 100 here would silently corrupt the
# ratio columns (e.g. revenue_to_cost_ratio = 0.95 is a ratio, not 95%).
# The unit for each column is documented in db/schema.sql.


def clean_cell(v):
    """Normalize a raw Excel cell: Persian digits, thousands separators, dashes."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return None if pd.isna(v) else v
    s = str(v).strip()
    if not s or s in {"-", "--", "—", "nan", "None", "N/A", "NA"}:
        return None
    s = s.translate(PERSIAN_DIGITS)
    s = s.replace("،", "").replace(",", "").replace("٬", "")
    try:
        f = float(s)
        return int(f) if f.is_integer() else f
    except ValueError:
        return s if s else None


def parse_date(v):
    """Parse Gregorian or Jalali dates from str/datetime/int Excel serials."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, (pd.Timestamp,)):
        return v.date() if hasattr(v, "date") else v
    import datetime as dt
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    s = str(v).strip().translate(PERSIAN_DIGITS)
    s = re.sub(r"[.\\-]", "/", s)
    m = re.match(r"^(\d{3,4})/(\d{1,2})/(\d{1,2})$", s)
    if m and HAS_JDATETIME:
        y, mo, d = (int(g) for g in m.groups())
        try:
            # Jalali years start with 13xx/14xx
            if 1300 <= y <= 1600:
                return jdatetime.date(y, mo, d).togregorian()
        except ValueError:
            pass
    try:
        return pd.to_datetime(s, dayfirst=True, errors="raise").date()
    except Exception:
        return None


def parse_number(v):
    """Numeric cell -> float/int, or None. No unit conversion: the workbook's
    fractions and ratios are stored as-is (see the units note above)."""
    val = clean_cell(v)
    if val is None or isinstance(val, str):
        return None
    return val


# ---------------------------------------------------------------------------
# Header matching
# ---------------------------------------------------------------------------

def normalize_header(h):
    return re.sub(r"\s+", " ", str(h).strip()) if h is not None else ""


def match_first(header, patterns):
    """Return the first pattern that matches this header, else None."""
    for p in patterns:
        if re.search(p, header, flags=re.IGNORECASE):
            return p
    return None


def build_column_map(columns, mapping, exclude=()):
    """Return {db_field: excel_column} for scalar snapshot fields.

    `exclude` holds columns already claimed by project-level fields (e.g. the
    contract start date, which would otherwise be mistaken for report_date).
    Only fields that exist as real project_snapshot columns are mapped, so a
    typo in mapping.yaml warns instead of producing a bad INSERT.
    """
    colmap = {}
    for db_field, cfg in mapping["snapshot"].items():
        if not db_field.endswith("_patterns"):
            continue
        target = db_field[: -len("_patterns")]
        if target not in SNAPSHOT_FIELDS:
            print(f"WARNING: mapping.yaml field '{target}' is not a project_snapshot column - ignored")
            continue
        for col in columns:
            if col in colmap.values() or col in exclude:
                continue
            if match_first(col, cfg):
                colmap[target] = col
                break
    return colmap


def match_project_columns(columns, mapping):
    name_col = start_col = None
    for col in columns:
        h = normalize_header(col)
        if name_col is None and mapping["project"]["name_patterns"] and \
                match_first(h, mapping["project"]["name_patterns"]):
            name_col = col
        elif start_col is None and mapping["project"].get("start_date_patterns") and \
                match_first(h, mapping["project"]["start_date_patterns"]):
            start_col = col
    return name_col, start_col


def _revision_from_header(h, patterns, initial_is_zero):
    """Return the revision number a header refers to, or None.

    Patterns with a capture group yield the number directly. A header matching
    the 'initial' pattern (e.g. 'مبلغ اولیه پیمان') means revision 0.
    """
    for pat in patterns:
        m = re.search(pat, h, flags=re.IGNORECASE)
        if not m:
            continue
        if m.groups():
            try:
                return int(m.group(1))
            except (TypeError, ValueError):
                continue
        return 0
    return None


def match_revisions(columns, mapping):
    """Return list of (revision_no, amount_col|None, duration_col|None)."""
    found = {}
    for col in columns:
        h = normalize_header(col)
        rev = _revision_from_header(h, mapping["revision"]["amount_patterns"], True)
        if rev is not None:
            found.setdefault(rev, {})["amount"] = col
            continue
        rev = _revision_from_header(h, mapping["revision"]["duration_patterns"], True)
        if rev is not None:
            found.setdefault(rev, {})["duration"] = col
    return [(rev, d.get("amount"), d.get("duration")) for rev, d in sorted(found.items())]


def match_extensions(columns, mapping):
    """Return [(extension_no, excel_col)]. Handles word ordinals (اول/دوم/سوم)
    and numeric ones, driven by `ordinal_map` in mapping.yaml."""
    ordinal_map = mapping["extension"].get("ordinal_map", {})
    found = {}
    for col in columns:
        h = normalize_header(col)
        for pat in mapping["extension"]["duration_patterns"]:
            m = re.search(pat, h)
            if not m:
                continue
            if m.groups():
                try:
                    ext = int(m.group(1))
                except (TypeError, ValueError):
                    ext = ordinal_map.get(m.group(1).strip())
            else:
                # Pattern matched a whole known phrase, e.g. "تمدید اول":
                # recover the ordinal word that the pattern contains.
                ext = next((n for word, n in ordinal_map.items() if word in h), None)
            if ext:
                found[ext] = col
            break
    return [(ext, col) for ext, col in sorted(found.items())]


def match_revision_progress(columns, mapping):
    """Return {field: {revision_no: excel_col}} for snapshot_revision_progress.

    Source headers encode the revision as a trailing 'REV<n>' or as 'برنامه اولیه'
    (initial schedule = revision 0).
    """
    cfg = mapping.get("revision_progress")
    if not cfg:
        return {}
    initial_label = cfg.get("initial_label", "برنامه اولیه")
    out: dict[str, dict[int, str]] = {}
    for field, patterns in cfg.items():
        if not field.endswith("_patterns"):
            continue
        target = field[: -len("_patterns")]
        if target not in REVISION_PROGRESS_FIELDS:
            continue
        for col in columns:
            h = normalize_header(col)
            if not any(re.search(p, h, flags=re.IGNORECASE) for p in patterns):
                continue
            m = re.search(r"REV\s*(\d)", h, flags=re.IGNORECASE)
            if m:
                rev = int(m.group(1))
            elif initial_label in h:
                rev = 0
            else:
                continue
            out.setdefault(target, {})[rev] = col
    return out


# ---------------------------------------------------------------------------
# Main extraction
# ---------------------------------------------------------------------------

def _sheet_engine(path):
    """Excel engine per file type (.xlsm needs openpyxl + keep_vba off)."""
    return "openpyxl" if str(path).lower().endswith((".xlsx", ".xlsm", ".xltx")) else None


def read_master_sheet(path):
    engine = _sheet_engine(path)
    xl = pd.ExcelFile(path, engine=engine)
    # Prefer the sheet named exactly or containing 'Master'
    for name in xl.sheet_names:
        if name.strip().lower() == "master database":
            return name, pd.read_excel(path, sheet_name=name, engine=engine)
    for name in xl.sheet_names:
        if "master" in name.strip().lower():
            return name, pd.read_excel(path, sheet_name=name, engine=engine)
    # Fallback: widest sheet
    best = max(xl.sheet_names, key=lambda n: pd.read_excel(path, sheet_name=n, engine=engine).shape[1])
    return best, pd.read_excel(path, sheet_name=best, engine=engine)


def coerce_project_name(v):
    s = clean_cell(v)
    if s is None:
        return None
    s = str(s).strip()
    return s or None


def upsert_dim_project(cur, name, contract_start_date):
    cur.execute(
        """
        INSERT INTO dim_project (name, contract_start_date)
        VALUES (%s, %s)
        ON CONFLICT (name) DO UPDATE
        SET contract_start_date = COALESCE(EXCLUDED.contract_start_date, dim_project.contract_start_date)
        RETURNING id
        """,
        (name, contract_start_date),
    )
    return cur.fetchone()[0]


def upsert_revision(cur, project_id, rev, amount, duration, effective_date):
    if amount is None and duration is None:
        return
    cur.execute(
        """
        INSERT INTO contract_revision (project_id, revision_no, amount, duration_days, effective_date)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (project_id, revision_no) DO UPDATE
        SET amount = COALESCE(EXCLUDED.amount, contract_revision.amount),
            duration_days = COALESCE(EXCLUDED.duration_days, contract_revision.duration_days),
            effective_date = COALESCE(EXCLUDED.effective_date, contract_revision.effective_date)
        """,
        (project_id, rev, amount, duration, effective_date),
    )


def upsert_extension(cur, project_id, ext_no, duration_days):
    if duration_days is None:
        return
    cur.execute(
        """
        INSERT INTO contract_extension (project_id, extension_no, duration_days)
        VALUES (%s, %s, %s)
        ON CONFLICT (project_id, extension_no) DO UPDATE
        SET duration_days = EXCLUDED.duration_days
        """,
        (project_id, ext_no, duration_days),
    )


def upsert_snapshot(cur, row: dict):
    if len(row) <= 2:  # only keys -> nothing to store
        return None
    cols = list(row.keys())
    placeholders = ", ".join(["%s"] * len(cols))
    updates = ", ".join(
        f"{c} = EXCLUDED.{c}" for c in cols if c not in ("project_id", "report_date")
    )
    cur.execute(
        f"""
        INSERT INTO project_snapshot ({", ".join(cols)})
        VALUES ({placeholders})
        ON CONFLICT (project_id, report_date) DO UPDATE SET {updates}
        RETURNING id
        """,
        [row[c] for c in cols],
    )
    return cur.fetchone()[0]


def upsert_revision_progress(cur, snapshot_id, revision_no, values: dict):
    """Insert one row of snapshot_revision_progress if anything is present."""
    data = {k: v for k, v in values.items() if v is not None}
    if not data:
        return
    row = {"snapshot_id": snapshot_id, "revision_no": revision_no, **data}
    cols = list(row)
    placeholders = ", ".join(["%s"] * len(cols))
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in data)
    cur.execute(
        f"""
        INSERT INTO snapshot_revision_progress ({", ".join(cols)})
        VALUES ({placeholders})
        ON CONFLICT (snapshot_id, revision_no) DO UPDATE SET {updates}
        """,
        [row[c] for c in cols],
    )


def resolve_category_id(cur, title):
    """Map a trade label from Excel to a dim_contractor_category row.

    Prefers a match on the canonical `title`, then on the Persian `title_fa`,
    then on any element of the `aliases` array (so 'اسکلت بتنی' from Excel
    resolves to the seeded 'concrete_structure' row instead of creating a
    duplicate category). Only creates a new category if nothing matches.
    """
    title = title.strip()
    cur.execute(
        """
        SELECT id FROM dim_contractor_category
        WHERE title = %(t)s
           OR title_fa = %(t)s
           OR %(t)s = ANY(aliases)
        ORDER BY (title = %(t)s) DESC, display_order
        LIMIT 1
        """,
        {"t": title},
    )
    row = cur.fetchone()
    if row:
        return row[0]

    # Unknown trade: add it so the headcount is not silently dropped.
    cur.execute(
        """
        INSERT INTO dim_contractor_category (title, display_order)
        VALUES (%s, 999)
        ON CONFLICT (title) DO UPDATE SET title = EXCLUDED.title
        RETURNING id
        """,
        (title,),
    )
    return cur.fetchone()[0]


def set_headcounts(cur, snapshot_id, headcounts: dict):
    """headcounts: {category_title: count}. Replace all rows for snapshot.

    Counts are monthly AVERAGES and may be fractional (17.37 people), so they
    are kept as floats - casting to int would silently lose real data.

    Counts are aggregated per resolved category, so if two Excel columns map to
    the same trade their headcounts are summed rather than one being dropped.
    """
    cur.execute("DELETE FROM snapshot_contractor_headcount WHERE snapshot_id = %s", (snapshot_id,))

    per_category: dict[int, float] = {}
    for title, count in headcounts.items():
        if count is None:
            continue
        cat_id = resolve_category_id(cur, title)
        per_category[cat_id] = per_category.get(cat_id, 0) + float(count)

    for cat_id, total in per_category.items():
        cur.execute(
            """
            INSERT INTO snapshot_contractor_headcount
                (snapshot_id, contractor_category_id, headcount)
            VALUES (%s, %s, %s)
            ON CONFLICT (snapshot_id, contractor_category_id)
            DO UPDATE SET headcount = EXCLUDED.headcount
            """,
            (snapshot_id, cat_id, total),
        )


def migrate(path, mapping, dsn, dry_run=False, sheet=None):
    sheet_name, df = read_master_sheet(path) if not sheet else (sheet, pd.read_excel(path, sheet_name=sheet))
    df.columns = [normalize_header(c) for c in df.columns]
    columns = list(df.columns)

    print(f"Sheet: '{sheet_name}'  rows={len(df)}  columns={len(columns)}")

    # ---- build column map ----
    name_col, start_col = match_project_columns(columns, mapping)
    colmap = build_column_map(columns, mapping, exclude={c for c in (start_col,) if c})
    revisions = match_revisions(columns, mapping)
    extensions = match_extensions(columns, mapping)
    rev_progress = match_revision_progress(columns, mapping)

    # ---- headcount columns: match block pattern, unclaimed ----
    claimed = set(colmap.values()) | {name_col, start_col}
    claimed |= {c for _, a, d in revisions for c in (a, d) if c}
    claimed |= {c for _, c in extensions}
    claimed.discard(None)

    strip_prefixes = mapping["headcount"].get("strip_prefixes", [])
    headcols = []
    for col in columns:
        if col in claimed:
            continue
        h = normalize_header(col)
        if match_first(h, mapping["headcount"]["column_patterns"]):
            trade = h
            for p in strip_prefixes:
                trade = re.sub(p, "", trade, flags=re.IGNORECASE)
            trade = re.sub(r"^[\s\-–—:،]+|[\s\-–—:،]+$", "", trade)
            headcols.append((col, trade or h))

    print(f"\nColumn mapping ({len(colmap)} snapshot fields):")
    for k, v in sorted(colmap.items()):
        print(f"  {k:32s} <- '{v}'")
    print(f"  project name                     <- {name_col!r}")
    print(f"  contract start date              <- {start_col!r}")
    print(f"  revisions detected: {revisions}")
    print(f"  extensions detected: {extensions}")
    print(f"  headcount columns: {len(headcols)}")
    for col, trade in headcols[:25]:
        print(f"    '{col}' -> trade '{trade}'")

    if rev_progress:
        print("  per-revision progress series:")
        for field, by_rev in sorted(rev_progress.items()):
            revs = ", ".join(f"REV{k}<-'{v}'" for k, v in sorted(by_rev.items()))
            print(f"    {field:30s} {revs}")

    missing = [
        f for f in ("report_date_patterns",) if f.rsplit("_", 1)[0] not in colmap
    ]
    if missing:
        print(f"\nWARNING: required fields not detected: {[m.rsplit('_', 1)[0] for m in missing]}")

    if dry_run:
        print("\n[DRY-RUN] No data written.")
        return

    # ---- connect & insert ----
    conn = psycopg2.connect(dsn)
    stats = {}
    try:
        with conn:
            with conn.cursor() as cur:
                for _, r in df.iterrows():
                    pname = coerce_project_name(r[name_col]) if name_col else "UNKNOWN"
                    if not pname:
                        continue

                    start_date = parse_date(r[start_col]) if start_col else None
                    pid = upsert_dim_project(cur, pname, start_date)

                    for rev, a_col, d_col in revisions:
                        amount = clean_cell(r[a_col]) if a_col else None
                        duration = clean_cell(r[d_col]) if d_col else None
                        if isinstance(amount, str) or isinstance(duration, str):
                            continue  # non-numeric garbage -> skip
                        upsert_revision(cur, pid, rev, amount, duration, None)

                    for ext, e_col in extensions:
                        dur = clean_cell(r[e_col])
                        upsert_extension(cur, pid, ext, dur if not isinstance(dur, str) else None)

                    snap = {"project_id": pid}
                    for db_field, col in colmap.items():
                        raw = r[col]
                        if db_field == "report_date":
                            val = parse_date(raw)
                        elif db_field == "revision_no":
                            val = clean_cell(raw)
                            if isinstance(val, str):
                                m = re.search(r"(\d+)", val)
                                val = int(m.group(1)) if m else None
                        else:
                            val = parse_number(raw)
                        snap[db_field] = val

                    if snap.get("report_date") is None:
                        stats["snapshots_skipped_no_date"] = stats.get("snapshots_skipped_no_date", 0) + 1
                        continue

                    sid = upsert_snapshot(cur, snap)
                    if sid is None:
                        continue

                    # Per-revision progress rows (one per REV that has any data)
                    for rev in sorted({k for m in rev_progress.values() for k in m}):
                        values = {
                            field: parse_number(r[cols[rev]])
                            for field, cols in rev_progress.items()
                            if rev in cols
                        }
                        if any(v is not None for v in values.values()):
                            upsert_revision_progress(cur, sid, rev, values)
                            stats["revision_progress_rows"] = (
                                stats.get("revision_progress_rows", 0) + 1
                            )

                    hc = {}
                    for col, trade in headcols:
                        v = parse_number(r[col])
                        if v is None:
                            continue
                        hc[trade] = v
                    set_headcounts(cur, sid, hc)

                    stats["snapshots"] = stats.get("snapshots", 0) + 1
                    stats.setdefault("_projects", set()).add(pname)
    finally:
        conn.close()

    # ---- summary ----
    print("\n=== Migration summary ===")
    projects = stats.pop("_projects", set())
    print(f"  distinct projects migrated: {len(projects)}")
    for k in sorted(stats):
        print(f"  {k}: {stats[k]}")

    with psycopg2.connect(dsn) as conn2:
        with conn2.cursor() as cur:
            for t in ("dim_project", "contract_revision", "contract_extension",
                      "project_snapshot", "snapshot_revision_progress",
                      "snapshot_contractor_headcount", "dim_contractor_category"):
                cur.execute(f"SELECT COUNT(*) FROM {t}")
                print(f"  total rows in {t}: {cur.fetchone()[0]}")


def inspect(path):
    xl = pd.ExcelFile(path)
    print(f"Workbook: {path}")
    print(f"Sheets: {xl.sheet_names}\n")
    for name in xl.sheet_names:
        df = pd.read_excel(path, sheet_name=name, nrows=5)
        print(f"--- sheet '{name}' ({df.shape[1]} cols) first 5 rows ---")
        print(df.head().to_string())
        print()


def main():
    ap = argparse.ArgumentParser(description="Migrate Master Database Excel -> EVM Postgres")
    ap.add_argument("excel", nargs="?", help="path to the Excel file")
    ap.add_argument("--inspect", metavar="FILE", help="print sheets and headers of FILE")
    ap.add_argument("--dry-run", action="store_true", help="parse and report without writing")
    ap.add_argument("--mapping", default=str(DEFAULT_MAPPING))
    ap.add_argument("--dsn", default=None, help="postgres DSN; default from env or docker-compose defaults")
    args = ap.parse_args()

    if args.inspect:
        inspect(args.inspect)
        return

    if not args.excel:
        ap.error("provide an Excel file, or use --inspect")

    import os
    dsn = args.dsn or os.environ.get("EVM_DSN") or \
        "postgresql://evm_admin:change_me_strong_password@localhost:5433/evm_db"

    with open(args.mapping, encoding="utf-8") as f:
        mapping = yaml.safe_load(f)

    migrate(args.excel, mapping, dsn, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
