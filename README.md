# Centralized Project Data Platform (EVM)

From a wide Excel workbook to a normalized PostgreSQL platform with spreadsheet-style
data entry (NocoDB) and a natural-language analytics agent.

```
Excel (Master Database)
        │  migration/migrate.py  (one-off, idempotent)
        ▼
   PostgreSQL  ◄──── NocoDB (same DB, Form View for monthly reports)
        │
        ▼
 Analytics Agent (Text-to-SQL + Claude explanation)
```

No vector database is used: all analysis is structured/numeric. If narrative
documents are added later, enable `pgvector` on this same instance.

---

## Repository Layout

| Path | What it is |
|---|---|
| `db/schema.sql` | All 6 tables, indexes, 3 analysis views, seed trades, read-only role |
| `docker-compose.yml` | PostgreSQL + nightly backup + NocoDB |
| `.env.example` | Configuration template (copy to `.env`) |
| `migration/migrate.py` | Excel → Postgres migration (normalizes REV0-3 and trade columns into rows) |
| `migration/mapping.yaml` | Excel-header → DB-column mapping (edit this, not the code) |
| `migration/make_sample_excel.py` | Generates a synthetic Master Database for testing |
| `agent/db.py` | Read-only SQL layer (SELECT-only guard + readonly role) |
| `agent/agent.py` | The Analytics Agent (schema tool + SQL tool + Claude reasoning) |
| `agent/cli.py` | Command-line entry point |
| `nocodb/setup_instructions.md` | Step-by-step NocoDB form + role configuration |
| `backup/backup.sh` | Manual on-demand dump (nightly runs automatically) |

---

## Step 1 — Configuration

```bash
cd evm-platform
cp .env.example .env
```

Edit `.env` and set a strong `POSTGRES_PASSWORD`, then generate a JWT secret:

```bash
openssl rand -hex 32
```

> **Port note:** `POSTGRES_HOST_PORT` defaults to **5433** because port 5432 is
> commonly already taken by a locally installed PostgreSQL service. Inside the
> Docker network Postgres is always on 5432, so NocoDB is unaffected.

---

## Step 2 — Start the Stack

```bash
docker compose up -d
```

This starts three services:

1. **postgres** — PostgreSQL 16, persistent volume, `db/schema.sql` applied
   automatically on first start.
2. **postgres-backup** — nightly `pg_dump`, gzip-compressed, into `./backups`
   (14 daily / 8 weekly / 6 monthly retained).
3. **nocodb** — the data-entry UI, pointed at the **same** `evm_db`.

Check health:

```bash
docker compose ps
docker compose logs -f postgres
```

---

## Step 3 — Migrate the Excel Data

First, see what the workbook actually contains:

```bash
# Your workbook is a macro-enabled .xlsm - migrate.py handles it directly.
python migration/migrate.py --inspect "C:\Users\farza\Music\14050617-Dashboards.xlsm"
```

The mapping in `mapping.yaml` is already written against that workbook's real
Persian headers, so the dry run should map 27 snapshot fields, 4 contract
revisions, 3 extensions, 18 headcount columns, and 6 per-revision series
(progress physical/rial actual/planned + EV + PV, each for REV0-REV3).

Then do a dry run to confirm the column mapping before writing anything:

```bash
python migration/migrate.py /path/to/Master_Database.xlsx --dry-run
```

The dry run prints every detected mapping: which Excel header feeds which DB
column, which revisions/extensions were found, and how many headcount columns
were recognized. **Check this output against the real file.**

If something is unmatched, add a regex to `migration/mapping.yaml` — no code
changes needed. Then run for real:

```bash
python migration/migrate.py /path/to/Master_Database.xlsx
```

> Without the real file to hand, generate a synthetic one to exercise the
> whole path end-to-end: `python migration/make_sample_excel.py`

The migration is **idempotent**: re-running updates rather than duplicating
(projects are matched by name, snapshots by `(project, report_date)`).

---

## Step 4 — NocoDB Data Entry

See **[nocodb/setup_instructions.md](nocodb/setup_instructions.md)** for the full
walkthrough. In short:

1. Open <http://localhost:8080> and create the admin account.
2. **Settings ▸ Data Sources ▸ Add ▸ PostgreSQL** → host `postgres`, port `5432`,
   database `evm_db`, user/password from `.env`.
3. On `project_snapshot`, add a **Form view** named *Submit Periodic Report*
   with the progress/financial fields, plus a **sub-form** on
   `snapshot_contractor_headcount` for per-trade headcount.
4. Create the three roles: **Admin**, **Editor** (data entry), **Viewer**.
   Clerks get Editor on the two fact tables only; managers get Viewer.

---

## Step 5 — Analytics Agent

### Install

```bash
pip install -r agent/requirements.txt
```

### Configure

The agent **requires** an explicit read-only connection string — it will not
fall back to a privileged one. Create `agent/.env`:

```bash
ANALYTICS_DB_URL=postgresql://analytics_readonly:readonly_secret_pass@localhost:5433/evm_db
ANTHROPIC_API_KEY=sk-ant-...
```

`analytics_readonly` is created by `db/schema.sql` with SELECT-only grants.
**Change its password** on your server:

```sql
ALTER ROLE analytics_readonly WITH PASSWORD 'your_strong_password';
```

Credentials for Claude resolve from `ANTHROPIC_API_KEY` (or an `ant auth login`
profile). Do not reuse the admin database password here.

### Use

```bash
# Single question
python agent/cli.py "which projects have CPI below 0.9?"

# Interactive
python agent/cli.py

# Interactive with SQL trace
python agent/cli.py -v

# Predefined deviation checks (cost overrun, schedule slip, headcount)
python agent/cli.py --checks

# Inspect the live schema the agent sees
python agent/cli.py --schema
```

Example questions it answers:

- «کدام پروژه‌ها CPI کمتر از ۰.۹ دارند؟» — which projects have CPI below 0.9?
- "How has project X's SPI trended over the last 6 months?"
- "Which projects are over budget *and* behind schedule?"
- "Compare headcount by trade across projects last month."

The agent writes SQL, executes it through the read-only tool, then **explains**
the result — likely cause, which supporting columns point that way, and what to
check next. It does not merely restate the numbers.

### Safety

Two independent layers, because the SQL is model-generated:

1. The connection uses `analytics_readonly` (SELECT-only grants).
2. `run_sql` rejects any statement that is not a single `SELECT`/`WITH`, runs
   inside a `READ ONLY` transaction with a 15s `statement_timeout`, and caps
   results at 500 rows.

---

## Step 6 — Deploying to Your Own Server

1. Install Docker + Docker Compose on the server.
2. Copy this directory over (`scp -r`, or `git clone`).
3. Create `.env` with **production** secrets — do not reuse the dev values.
4. `docker compose up -d`
5. Put NocoDB behind a reverse proxy with TLS (nginx/Caddy).
6. Edit `db/schema.sql`'s `analytics_readonly` password (or `ALTER ROLE` after
   first boot) and set `ANALYTICS_DB_URL` accordingly.
7. Verify backups are appearing: `ls -la backups/`
8. Schedule the agent's `--checks` run if you want periodic deviation reports.

### Backup / Restore

Nightly backups run automatically in the `postgres-backup` service (uses the
same `postgres:16-alpine` image, no extra pull). Backups land in `./backups/`
with 14 daily / 8 weekly / 6 monthly retention.

On-demand manual dump:

```bash
./backup/backup.sh
```

Restore a dump (manual or nightly):

```bash
gunzip -c backups/manual/evm_db_2026-09-26_120000.sql.gz | \
  docker exec -i evm-postgres psql -U evm_admin -d evm_db
```

Or from the nightly `daily/` or `weekly/` folders under `./backups/`.

Test a restore into a scratch database before you need it in anger.

---

## Troubleshooting: Docker Registry Access

If `docker compose pull` or `docker compose up` fails with `TLS handshake timeout`,
your network blocks Docker Hub. Two options:

**Option A — Use a registry mirror (recommended).**  
In Docker Desktop ▸ Settings ▸ Docker Engine, add:

```json
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://mirror.gcr.io",
    "https://docker.iranserver.com"
  ]
}
```

Then restart Docker Desktop and `docker compose pull`.

**Option B — Pre-pull on a machine that can reach Docker Hub.**  
```bash
docker pull postgres:16-alpine
docker pull nocodb/nocodb:latest
docker save postgres:16-alpine nocodb/nocodb:latest -o images.tar
# copy images.tar to the server
docker load -i images.tar
```

The `postgres-backup` service reuses `postgres:16-alpine`, so only **two images**
must be pulled/saved.

> Note: if you are on a network with Cloudflare WARP / ProxyBridge / similar,
> the Docker daemon's WSL2 backend often does **not** inherit the host proxy.
> A registry mirror is the most reliable fix.

---

## Schema Notes

The wide Excel layout is normalized into rows, so adding a REV4 or a new trade
never requires a schema change:

| Excel shape | Becomes |
|---|---|
| `REV0..REV3` amount + duration columns | rows in `contract_revision` |
| Repeated extension columns (`تمدید اول/دوم/سوم`) | rows in `contract_extension` |
| `REV0..REV3` progress + EV/PV columns | rows in `snapshot_revision_progress` |
| 18 contractor headcount columns | rows in `snapshot_contractor_headcount` |

Analysis helpers (in `db/schema.sql`):

- `v_project_latest_snapshot` — latest **reported** period per project, with `sv`/`cv`
- `v_evm_distress_alerts` — the same, plus a `health_status` label
- `v_snapshot_total_headcount` — total headcount per report
- `v_project_revision_progress` — per-REV progress/EV/PV with `revision_spi`
- `v_project_reporting_status` — actual vs planned periods, and the last real report date

### Three things about the real data that shape the schema

These were discovered by profiling `14050617-Dashboards.xlsm` and are worth
knowing before you trust any query:

**1. Every project has future-dated rows with no data.**
The workbook pre-fills planned periods out to contract completion. So
`MAX(report_date)` per project returns an *empty* row for all projects. `v_project_latest_snapshot`
therefore picks the latest period that actually carries reported values. Use
`v_project_reporting_status` to see how stale a project is.

**2. Progress and ratio columns are fractions, not percentages.**
`progress_physical_actual = 0.45` means 45%. This is stored as-is — no rescaling.
Multiply by 100 when presenting. Monetary columns are in Rial.

**3. `headcount` is a monthly average and is fractional.**
Values like `17.37` people appear throughout. The column is `NUMERIC(10,2)`, not
`INT` — an integer column would have silently truncated real data.

`cpi` is usually NULL because it needs actual cost, which is booked late. A NULL
CPI is missing information, not a zero.

---

## Troubleshooting

**NocoDB shows no tables.** It connected to the wrong database. Check the data
source points at `evm_db`, not NocoDB's internal default.

**Port already in use.** Change `POSTGRES_HOST_PORT` / `NOCODB_HOST_PORT` in `.env`.

**`schema.sql` didn't run.** It only executes when the Postgres data volume is
empty (first boot). Apply it manually:

```bash
docker exec -i evm-postgres psql -U evm_admin -d evm_db < db/schema.sql
```

**Migration mapped the wrong column.** Run `--dry-run`, then adjust the relevant
regex in `migration/mapping.yaml`.

**Docker Hub unreachable.** On networks where Docker Hub is blocked, configure a
registry mirror in Docker Desktop ▸ Settings ▸ Docker Engine, or pre-pull the
images on a machine that can reach it.
