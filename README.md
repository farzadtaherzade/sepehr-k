# Centralized Project Data Platform (EVM) — پلتفرم داده پروژه‌ها

A fully containerized, Persian-language (RTL) Earned-Value-Management platform built
from a wide Excel workbook (`14050617-Dashboards.xlsm`):

```
Excel (Master Database, 83 Persian columns)
        │  migration/migrate.py   (one-off, idempotent)
        ▼
   PostgreSQL 16 (evm_db)  ◄─── live summary triggers (counts, last SPI/CPI, ...)
    │          │
    ▼          ▼
 Directus   Next.js Web App     ◄─ both Persian, RTL, Jalali dates, Persian digits
 (admin +      (management UI)
  Insights)
    ▲
    └── Analytics Agent (Text-to-SQL, read-only) — agent/
```

Everything runs from **one `docker compose up -d`** — no host-installed services.

---

## Services & Ports

| Service | Container | URL / Port | What it does |
|---|---|---|---|
| **Directus 11** | `evm-directus` | http://localhost:8080 | Persian admin UI, data entry, Insights dashboards, map view |
| **Web App** (Next.js) | `evm-webapp` | http://localhost:3600 | Persian RTL management UI (projects, reports, headcount, audit) |
| **PostgreSQL 16** | `evm-postgres` | localhost:5433 | Single database `evm_db` shared by Directus + webapp |
| **Backup** | `evm-postgres-backup` | — | Nightly `pg_dump` → `./backups/` (14 daily / 8 weekly / 6 monthly) |

> **Why port 3600?** Host port 3000 is reserved by Windows on this machine, so the
> web app is exposed on 3600 (container still listens on 3000). Postgres uses 5433
> for the same reason (local 5432 occupied). Inside the Docker network everything
> uses the standard ports.

---

## Quick Start (3 commands)

**Requirements:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) with
Compose v2. (Windows: start Docker Desktop first — the containers come back on their own
via `restart: unless-stopped`.)

```bash
cp .env.example .env        # then edit: set strong passwords + 3 secrets
docker compose up -d        # first boot: builds the webapp, pulls 2 images
docker compose ps           # wait until all show "healthy"
```

Generate the secrets with `openssl rand -hex 32`:

| `.env` variable | Used for |
|---|---|
| `POSTGRES_PASSWORD` | database owner |
| `DIRECTUS_KEY` / `DIRECTUS_SECRET` | Directus instance id / session signing |
| `AUTH_SECRET` | webapp session cookies |
| `EVM_APP_PASSWORD` | least-privilege `evm_app` role (auto-created at webapp startup) |

**First-run accounts (created once, on empty database):**

| App | Login | Notes |
|---|---|---|
| Web App (3600) | `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env` | forces a password change on first login — see *Accounts & Passwords* |
| Directus (8080) | `DIRECTUS_ADMIN_EMAIL` / `DIRECTUS_ADMIN_PASSWORD` from `.env` | created only on very first boot; all later accounts are created inside Directus |

---

## Getting the Data In

**Option 1 — migrate the real workbook** (idempotent; re-runs update, never duplicate):

```bash
python migration/migrate.py --inspect "path/to/14050617-Dashboards.xlsm"   # inspect mapping
python migration/migrate.py "path/to/14050617-Dashboards.xlsm" --dry-run   # dry run
python migration/migrate.py "path/to/14050617-Dashboards.xlsm"             # migrate
```

Column mapping lives in `migration/mapping.yaml` (regex per Persian header) — edit the
yaml, not the code. No workbook at hand? `python migration/make_sample_excel.py`.

**Option 2 — restore a database dump** (see *Backup & Restore* below — a full dump
carries the data *and* the whole Directus configuration, users, theme and dashboards).

### Directus configuration on a fresh database

Directus stores its data model, field labels, dashboards and theme **inside the
database**. On a truly fresh install you get an empty admin. Two paths:

- **Full fidelity (recommended):** restore a full DB dump (below) — you get the
  configured Persian data model, users, Insights dashboards, map bookmark, theme,
  fonts and all data, exactly as on the source machine.
- **From scratch:** log into Directus, create a static token for your admin user
  (User ▸ Token), then run:

  ```bash
  DX_TOKEN=<static token> python directus/config/apply_model.py
  ```

  This configures all collections, Persian/English labels, relations, form groups,
  the Jalali date column and default views (idempotent, additive-only). The
  `fa-display` extension (Jalali dates + Persian digits) is already in the repo at
  `directus/extensions/` and mounts automatically. The map bookmark and Insights
  dashboards are simple to recreate, or copy them from a dump.

---

## What You Get

- **7 normalized collections** — projects → contract revisions/extensions → periodic
  snapshots → per-REV progress + per-trade headcount (adding a REV4 or a new trade
  never needs a schema change).
- **Live summary columns** (`db/schema.sql` triggers): report count, last report date,
  latest progress/SPI/CPI and contract amounts on every project; total headcount per
  report; usage stats per trade. Always current, regardless of what writes the data.
- **Persian everything**: RTL app language, Vazirmatn font + teal theme, Jalali/Shamsi
  dates and Persian digits (custom display extension `directus/extensions/fa-display`),
  bilingual (fa/en) field names.
- **Insights dashboards** «نمای کلی پروژه‌ها» and «نیروی انسانی»: KPIs, per-project
  progress/report bars, headcount by trade/project, SPI trend.
- **Map view**: bookmark «نقشه پروژه‌ها» shows projects with coordinates
  (`dim_project.location`, GeoJSON). Editing pins is a full-width map field on each
  project.
- **Guided data-entry flow**: create project → add report from the project page
  (project pre-filled, date defaults to today, REV defaults 0) → fill headcount /
  per-REV rows inline.
- **Analysis views** for the agent and the webapp: `v_project_latest_snapshot`,
  `v_evm_distress_alerts`, `v_snapshot_total_headcount`, `v_project_revision_progress`,
  `v_project_reporting_status`.

---

## Accounts & Passwords

There are **three independent credential sets** — they look similar but are completely
separate systems:

| System | Login with | Where it comes from |
|---|---|---|
| PostgreSQL | user + password | `POSTGRES_USER` / `POSTGRES_PASSWORD` in `.env` (database owner) |
| **Web App** (3600) | **username** + password (e.g. `admin`) | `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env` — used **only** to create the account on first startup; the app forces a password change at first login |
| **Directus** (8080) | **email** + password (e.g. `admin@gmail.com`) | created **inside Directus itself** — not from `.env` |

The web app and Directus do **not** share accounts: the web app's username/password is
different from your Directus email/password, and changing one never affects the other.
`DIRECTUS_ADMIN_EMAIL` / `DIRECTUS_ADMIN_PASSWORD` in `.env` only seed the very first
admin when the database is empty; after that, every Directus user is created and managed
in the app (**Settings ▸ Users**) and lives in the database — editing `.env` afterwards
changes nothing.

---

## Backup & Restore

Nightly backups run automatically into `./backups/` (14 daily / 8 weekly / 6 monthly
retained). For an on-demand full backup — a single file that carries the data **and** the
whole Directus configuration, users, theme, dashboards and webapp accounts:

```bash
docker exec evm-postgres pg_dump -U evm_admin -d evm_db -Fc -f /tmp/evm_full.dump
docker cp evm-postgres:/tmp/evm_full.dump ./evm_full.dump
```

> In PowerShell run the two lines separately (`&&` is not supported there).

Restoring replaces the current database with the dump's contents:

```bash
docker cp evm_full.dump evm-postgres:/tmp/evm_full.dump
docker exec evm-postgres pg_restore -U evm_admin -d evm_db --clean --if-exists /tmp/evm_full.dump
docker compose restart directus webapp
```

Notes:

- The dump is **complete and self-contained** — restoring it onto a fresh database
  reproduces the entire system exactly (verified end-to-end): data, Persian field
  labels, dashboards, map bookmark, users.
- Only `POSTGRES_PASSWORD` must match between the machine that made the dump and the
  target — the dump carries the database roles' passwords, but the container itself
  authenticates with the value in the target's `.env`.
- The dump carries the **webapp accounts too** (`app_user` table), so the target's
  `.env` bootstrap password is ignored unless no account exists yet.
- `pg_restore` prints warnings about cluster-level roles (e.g. `analytics_readonly`)
  that are not part of a database dump — they are harmless; recreate the role with
  `CREATE ROLE` if you use the analytics agent on the target machine.
- Test restores with `--clean --if-exists` into a scratch database first; restart the
  Directus container after any restore.

---

## Deploying to a Server

Same as Quick Start on a Linux host with Docker: set **production** secrets in `.env`,
`docker compose up -d`, put Directus/webapp behind a TLS reverse proxy, verify backups
appear in `./backups/`, and change `analytics_readonly`'s password from
`db/schema.sql` (or `ALTER ROLE`).

---

## Analytics Agent (read-only Text-to-SQL)

```bash
pip install -r agent/requirements.txt
# agent/.env:
#   ANALYTICS_DB_URL=postgresql://analytics_readonly:readonly_secret_pass@localhost:5433/evm_db
#   ANTHROPIC_API_KEY=sk-ant-...
python agent/cli.py "which projects have CPI below 0.9?"
python agent/cli.py --checks    # deviation report (cost overrun, schedule slip, headcount)
```

Two safety layers: the `analytics_readonly` role (SELECT-only grants), and a guard that
only ever runs a single `SELECT`/`WITH` in a `READ ONLY` transaction with a 15 s timeout.

---

## Repository Layout

| Path | What it is |
|---|---|
| `db/schema.sql` | All tables, indexes, 5 analysis views, summary triggers, seed trades, read-only role (auto-applied on first boot; idempotent) |
| `docker-compose.yml` | postgres + postgres-backup + directus + webapp |
| `.env.example` | Configuration template (copy to `.env`) |
| `webapp/` | Next.js Persian management app (Dockerfile included) |
| `directus/config/apply_model.py` | Idempotent Directus data-model configurator |
| `directus/extensions/fa-display/` | Installed display extension: Jalali dates + Persian digits |
| `directus/extensions-src/` | Extension source — `npm install && npx directus-extension build` |
| `directus/setup_instructions.md` | Full change log: data model, styling, dashboards, map, entry flow (§11–17) |
| `migration/migrate.py` + `mapping.yaml` | Excel → Postgres migration (regex mapping) |
| `agent/` | Read-only analytics agent (Text-to-SQL) |
| `backup/backup.sh` / `export.sh` | Manual dump / CSV+SQL export of the 7 platform tables |
| `expose-public-url.sh` | One-command public HTTPS tunnel |

---

## Schema Notes (read before querying)

The wide Excel layout is normalized into rows, so adding a REV4 or a new trade never
requires a schema change:

| Excel shape | Becomes |
|---|---|
| `REV0..REV3` amount + duration columns | rows in `contract_revision` |
| `تمدید اول/دوم/سوم` columns | rows in `contract_extension` |
| `REV0..REV3` progress + EV/PV columns | rows in `snapshot_revision_progress` |
| 18 contractor headcount columns | rows in `snapshot_contractor_headcount` |

Three facts about the real data that shape the schema:

1. **Every project has future-dated rows with no data** (the workbook pre-fills planned
   periods to contract end). `MAX(report_date)` returns an empty row — that's why
   `v_project_latest_snapshot` picks the latest period *with* reported values, and why
   the trigger-maintained `last_report_date` filters on actual progress.
2. **Progress and ratio columns are fractions** (`0.45` = 45%). Monetary columns are Rial.
3. **Headcount is a fractional monthly average** (`17.37` people is normal) — the column
   is `NUMERIC(10,2)`, not `INT`. `cpi` is usually NULL because actual cost books late —
   NULL is missing information, not zero.

---

## Troubleshooting

**Docker Hub unreachable** (`TLS handshake timeout` on `docker compose up`): this
network blocks Docker Hub and most mirrors. Either configure a registry mirror in
Docker Desktop ▸ Settings ▸ Docker Engine (values that have worked: `docker.1panel.live`
is China-only; try `dockerhub.timeweb.cloud`, `hub.rat.dev`, `mirror.gcr.io` — availability
varies), or pre-pull on a connected machine and `docker save | docker load`:

```bash
docker pull postgres:16-alpine directus/directus:11 node:20-alpine
docker save postgres:16-alpine directus/directus:11 node:20-alpine -o images.tar
# copy images.tar to the offline machine, then:
docker load -i images.tar && docker compose up -d
```

(`node:20-alpine` is only needed to build the webapp image.)

**Container shows `unhealthy`**: check `docker inspect evm-directus
--format '{{json .State.Health}}'`. The compose healthchecks use `127.0.0.1` on purpose
— `localhost` resolves to IPv6 inside the container and Directus listens on IPv4 only.

**Port already in use**: change `POSTGRES_HOST_PORT` / `WEBAPP_HOST_PORT` /
`DIRECTUS_HOST_PORT` in `.env`. Port 3000 has a Windows socket reservation on this
machine — use 3600 (already the default).

**`schema.sql` didn't run**: it only executes when the Postgres volume is empty. Apply
manually: `docker exec -i evm-postgres psql -U evm_admin -d evm_db < db/schema.sql`.

**Restore conflicts**: always `pg_restore --clean --if-exists`, and restart the
Directus container after a restore.

**Map has no pins**: projects need `موقعیت روی نقشه` (location) set — full-width map
field on each project's detail page.
