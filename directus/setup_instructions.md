# Directus Setup Guide for the EVM Platform

Directus is attached to the **same PostgreSQL database** as the platform tables
(`evm_db` on the `postgres` container). No separate database is created — Directus
stores its own metadata (users, roles, permissions) in `directus_*` tables in the
same schema, which is why the full-database export contains those tables too.

> Directus replaced NocoDB in this project. If you have an old NocoDB backup with
> `nc_*` tables, it still restores fine — Directus just won't use them.

---

## 1. Start the Stack

```bash
cd evm-platform
docker compose up -d
```

- Directus UI: <http://localhost:8080> (or `$DIRECTUS_HOST_PORT`)
- Postgres: `localhost:5433` (or `$POSTGRES_HOST_PORT`)

Wait for the healthcheck to report `healthy` before continuing — Directus runs a
schema migration on first boot and can take 30–60 seconds.

---

## 2. First Run: Admin Account Is Created Automatically

Directus creates the admin user from `.env` on first boot — no wizard to click
through.

| Field | Value |
|---|---|
| Email | `DIRECTUS_ADMIN_EMAIL` (default `admin@evm.local`) |
| Password | `DIRECTUS_ADMIN_PASSWORD` (default `Admin1234!`) |

**Change the password after first login** (Account Settings ▸ password), and use a
real password in `.env` for anything beyond a local demo.

---

## 3. Make Your Tables Visible

By default Directus creates its own tables but **hides existing ones**. You must
promote each table to a *collection*.

1. Go to **Settings** (gear icon) ▸ **Data Model** ▸ **Create Collection**.
2. For each table, pick **"Configure in Settings"** (this keeps the existing table
   rather than creating a new one) and enter the table name:

| Collection name | Table | Type |
|---|---|---|
| `dim_project` | `dim_project` | Table |
| `dim_contractor_category` | `dim_contractor_category` | Table |
| `contract_revision` | `contract_revision` | Table |
| `contract_extension` | `contract_extension` | Table |
| `project_snapshot` | `project_snapshot` | Table |
| `snapshot_revision_progress` | `snapshot_revision_progress` | Table |
| `snapshot_contractor_headcount` | `snapshot_contractor_headcount` | Table |

Repeat for the five views — mark each as a **view** (read-only):

| View collection | Underlying view |
|---|---|
| `v_project_latest_snapshot` | `v_project_latest_snapshot` |
| `v_evm_distress_alerts` | `v_evm_distress_alerts` |
| `v_snapshot_total_headcount` | `v_snapshot_total_headcount` |
| `v_project_revision_progress` | `v_project_revision_progress` |
| `v_project_reporting_status` | `v_project_reporting_status` |

Directus picks up the `id` primary keys and foreign keys automatically, so
relationships between `dim_project` → `project_snapshot` → `snapshot_*` should
appear without manual configuration.

---

## 4. Persian Labels for Non-Technical Staff

Directus has no per-column Persian label built in for existing tables, but you can
set **Field Display** names per collection:

1. **Settings** ▸ **Data Model** ▸ pick a collection ▸ click a field.
2. Set **Display Name** to the Persian label — e.g. `project_id` → "پروژه",
   `report_date` → "تاریخ گزارش", `headcount` → "نیروی انسانی ماهانه".

For the contractor categories, the Persian labels already live in
`dim_contractor_category.title_fa` — display that column, not `title`.

---

## 5. Build the "Submit Periodic Project Report" Form

1. Open **Content** ▸ `project_snapshot` ▸ **+ Create Item**.
2. Directus auto-generates the form from the field list — reorder fields so the
   ones a clerk fills come first:

   | Order | Field | Note |
   |---|---|---|
   | 1 | `project_id` | dropdown of projects |
   | 2 | `report_date` | **required** |
   | 3 | `revision_no` | 0–3 |
   | 4–7 | progress fields | **fractions, not percent** (0.45 = 45%) |
   | 8 | `time_elapsed_days`, `time_progress_pct` | |
   | 9+ | financials | currency in Rial |
   | last | `spi`, `cpi` | leave blank — computed |

3. For per-trade headcount, open the related `snapshot_contractor_headcount`
   record from the parent item (Directus follows the foreign key automatically).
   Add headcount rows with `contractor_category_id` + `headcount`.

   > Headcount is the **average manpower over the month**, not a one-day count —
   > fractional values like `17.37` are normal.

### Restrict what a clerk can edit
**Settings** ▸ **Roles & Permissions** ▸ pick the role ▸ toggle **Read/Create/Update/Delete**
per collection. Give clerks Create+Update on `project_snapshot` and
`snapshot_contractor_headcount` only; everything else Read-only.

---

## 6. Roles

| Role | Permissions |
|---|---|
| **Administrator** | everything (you) |
| **Editor** (data entry) | Create/Update on `project_snapshot` + `snapshot_contractor_headcount`; Read on all others |
| **Viewer** (managers) | Read-only on all collections and views |

Create them under **Settings** ▸ **User Roles** ▸ **Create Role**, then add users
under **Settings** ▸ **Users**.

---

## 7. Dashboards

Directus's built-in Dashboards (left sidebar ▸ **Dashboards**) support panels:

- **Metric** — one number: average `cpi` or `spi` from `v_project_latest_snapshot`
- **Label** — `v_evm_distress_alerts.health_status`, grouped
- **Chart** — line chart from `project_snapshot`: `report_date` on X,
  `cpi`/`spi` on Y, split by `project_id`
- **List** — `v_project_reporting_status` to spot stale projects

Keep the heavy lifting in the SQL views (they're already computed) rather than
re-aggregating in Directus panels.

---

## 8. REST API

Directus exposes `/items/<collection>` on the same port:

```bash
# requires an access token
curl -H "Authorization: Bearer <token>" \
     "http://localhost:8080/items/v_project_latest_snapshot?fields=project_name,spi,cpi"
```

Tokens live under **Settings** ▸ **Access Tokens**. The API uses the same
role-based permissions as the UI, so a Viewer token cannot write.

---

## 9. Swapping Directus Later

Directus stores its metadata in `directus_*` tables inside the same Postgres.
To swap for NocoDB / a custom UI:

1. `docker compose stop directus`
2. Ignore or drop the `directus_*` tables.
3. Point the new tool at the same connection string —
   `postgres:5432` user `evm_admin`, database `evm_db`.
4. The seven platform tables and five views are unchanged; no migration needed.

---

## 10. Backup

Nightly backups run automatically in the `postgres-backup` service
(`./backups/`, 14 daily / 8 weekly / 6 monthly retention). This includes both the
platform tables **and** Directus's `directus_*` tables — so a restore brings back
your roles, permissions, and users too.

Manual dump:

```bash
./backup/backup.sh
```

Or a full SQL file you can inspect:

```bash
docker exec evm-postgres pg_dump -U evm_admin -d evm_db \
  --no-owner --no-privileges --inserts > backups/exports/evm_full_database.sql
```

---

## 11. Automated Data-Model Configuration (2026-10-06)

Sections 3–4 above were done **automatically and idempotently** by
[`config/apply_model.py`](config/apply_model.py) (run: `DX_TOKEN=<admin token> python config/apply_model.py`).
Re-running it is safe — it only patches meta and never deletes anything.

What is now configured:

- **Navigation group** «داده‌های پروژه / Project Data (EVM)» containing all 7 collections in a
  logical order: Projects → Contract Revisions → Extensions → Periodic Snapshots →
  Progress per REV → Headcount per Trade → Contractor Categories.
- **Bilingual field names** (fa-IR + en-US via Directus field naming) and notes on every field of
  every collection, following the original Excel headers.
- **All 6 relations wired with `one_field`**: project pages show inline lists of their revisions,
  extensions and snapshots; snapshot pages show headcount rows (with trade names) and per-REV
  progress; child rows get project/snapshot/category dropdown pickers with readable templates.
- **Form grouping** on `project_snapshot`: «پیشرفت و زمان», «مالی و صورت‌وضعیت»,
  «ارزش کسب‌شده و شاخص‌های EVM», «نسبت‌ها».
- **New column** `project_snapshot.report_date_jalali` (from Excel column «تاریخ 2», filled for all
  227 rows). Excel column «تاریخ 3» is redundant (Jalali of month-end report dates) and was not imported.
- **Default list views** (global presets + refreshed personal presets) with project name,
  dates (incl. Jalali), progress and EVM indices; snapshots sorted newest first.
- Dropdowns for `revision_no` (REV0–REV5, “allow other”) and `extension_no` (1–5, “allow other”).
- The broken leftover field `contract_revision.project` (uuid, no relation) and the
  `dim_contractor_category.aliases` `text[]` field are **hidden** (not deleted).

Not exposed as Directus collections: the `v_*` analysis SQL views. Directus cannot track a view
without a primary key (`POST /collections` would try to CREATE a table and fail), so they remain
available to the webapp/analytics directly. If you ever need them in Directus, materialize them
into real tables and refresh on a schedule.

Healthcheck note: the compose healthcheck now targets `127.0.0.1:8055` — `localhost` resolved to
IPv6 inside the container and kept the container permanently "unhealthy".

---

## 12. Data-Entry Flow (2026-10-06)

The intended order of work, following the schema (پروژه ← گزارش ← جزئیات):

1. **Create the project** — Content ▸ «پروژه‌ها» ▸ ➕. Name + شروع پیمان + وضعیت.
2. **Add reports from the project page** — open the project; the first list on the page is
   «گزارش‌های دوره‌ای» ▸ ➕ Create New. The project field comes pre-filled; تاریخ گزارش is
   required (defaults to today), REV defaults to 0, status defaults to published.
3. **Fill the report's children on the same page**:
   - «نیروی انسانی به تفکیک رده» ▸ add one row per trade that worked this period
     (category dropdown in Persian, headcount defaults to 0, fractions like 17.37 are fine).
   - «پیشرفت به تفکیک REV» ▸ one row per REV you want to track for this period (REV0 default).

Defaults set to make this smooth (`report_date = CURRENT_DATE`, `revision_no = 0`,
`status = 'published'` on the entry tables). Verified end-to-end via the API on 2026-10-06;
test rows were removed afterwards.

Note on deleting projects: the live FK constraints are NO ACTION (not CASCADE as `db/schema.sql`
suggests), so a project that already has reports **cannot** be deleted until its reports are
removed first. This protects data and matches the "never lose data" requirement.

---

## 13. Persian (Jalali) Dates & Persian Digits (2026-10-06)

Directus formats dates as Gregorian only, so a small custom **display extension**
(`fa-display`) now renders dates as Jalali/Shamsi with Persian digits
(`2025-04-20 → ۱۴۰۴/۰۱/۳۱`) and numbers with Persian digits (`4798155824724 → ۴٬۷۹۸٬۱۵۵٬۸۲۴٬۷۲۴`).
It uses the browser's built-in `Intl` Persian calendar — no external date libraries.

- Source: [`extensions-src/`](extensions-src/) (`npm install && npx directus-extension build`)
- Installed: [`extensions/fa-display/`](extensions/fa-display/), mounted into the container via
  `./directus/extensions:/directus/extensions` in `docker-compose.yml`
- Assigned to 41 fields (all dates + all numeric fields except primary keys); the O2M/related
  templates use `report_date_jalali`; REV dropdown labels use Persian digits.

Notes: this is **display-only** — the edit forms still use Gregorian date pickers, and API
responses/filtering keep using ISO dates and Latin digits (so the webapp is unaffected).
To change the format, edit `extensions-src/src/index.js`, rebuild, and copy `dist/` to
`extensions/fa-display/dist/`, then restart the container.

---

## 14. App Styling — «سبز سازمانی» Theme (2026-10-06)

Applied via the settings API (no extension changes):

- **Font**: Vazirmatn (Regular + Bold) embedded as data-URIs in the `custom_css` project
  setting, so no external CDN is needed. `body` + form controls use it.
- **Light theme overrides** (`theme_light_overrides`): teal primary `#0F766E`, page background
  `#F8FAF9`, text `#1A2E2B`, borders `#D9E2E0`, radius `8px`, Vazirmatn font family.
- **Dark theme overrides** (`theme_dark_overrides`): matching dark palette with bright-teal
  `#2DD4BF` accent (auto mode still looks branded).
- **Project color** `#0F766E` (login page + accent), `default_appearance: light`.

To tweak: keys map to `--theme--*` CSS variables (e.g. `primary`, `background`,
`border-radius`, `font-family-sans-serif`). Change via API or Settings ▸ Appearance in the
app. Fonts: swap the two `@font-face` blocks in `custom_css` (base64 woff2).

---

## 15. Summary Columns for All Collections (2026-10-06)

Same pattern as §12 applied across the schema — live columns maintained by triggers:

| Collection | New fields (all readonly, auto-computed) |
|---|---|
| `dim_project` | `last_revision_no`, `initial_amount`, `current_amount`, `initial_duration_days`, `current_duration_days` (from contract revisions), `extensions_count`, `total_extension_days` (from extensions) — plus the §12 report summaries |
| `project_snapshot` | `headcount_total` — sum of the report's headcount rows |
| `dim_contractor_category` | `usage_count`, `avg_headcount` — how often the trade appears and its average headcount |

Triggers: `trg_revision_stats` / `trg_extension_stats` → `sync_project_contract_stats`,
`trg_headcount_stats` → `sync_snapshot_headcount_total` + `sync_category_headcount_stats`.
Definitions live in `db/schema.sql` (idempotent) and are applied to the live database.

List presets updated (personal + global) for `dim_project`, `project_snapshot` and
`dim_contractor_category`. `contract_revision`, `contract_extension`,
`snapshot_revision_progress` and `snapshot_contractor_headcount` already show their parent
context (project + date) and needed no computed columns.

Note: these were applied ONCE — no recurring job is needed (the triggers keep everything in
sync on every write, including writes from the webapp or API).

---

## 16. Insights Dashboards (2026-10-06)

Two Persian dashboards built under **Insights / بینش‌ها** (16 panels), reading the live
summary fields from §12/§15:

**نمای کلی پروژه‌ها** — KPIs (project count, report count, avg SPI of latest statuses,
avg physical progress as %), progress per project (bar), report count per project (bar),
avg headcount per trade (bar), and avg-SPI-over-time (line).

**نیروی انسانی** — KPIs (avg headcount per row, active trades, total person-periods, max
single-report headcount), headcount by trade (bar), headcount trend over time (line of
`headcount_total`), and by-project totals/averages (bars).

Panel option shapes match Directus 11 core panels (`metric` = collection/field/function/filter,
`bar-chart` = collection/xAxis/yAxis/function/filter, `line-chart` = collection/xAxis/yAxis/
aggregation). The user's own «test» dashboard was left untouched. To add more panels use
Settings ▸ Insights edit mode — e.g. a `variable` panel to filter charts by project.

---

## 17. Sample Projects + Map Layout (2026-10-07) — branch `feature/samples-and-map`

- Five example projects added, all suffixed **(نمونه)** so they are easy to tell apart and
  filter: مجتمع مسکونی آفتاب، برج اداری نگین، پل و تقاطع دریا، کارخانه بتن آماده زاگرس،
  بهسازی راه ساحلی خلیج فارس. Each has REV0, one snapshot and two headcount rows.
- `dim_project.location` (JSONB GeoJSON Point) + Directus `map` interface.
- Bookmark **«نقشه پروژه‌ها»** on dim_project opens the map layout (clustered pins).
- Approximate city-level locations set for ساری، پیشوا، مروارید کیش — replace with real
  coordinates when known.
- Registry note: Docker Hub and most mirrors are blocked on this network, so the PostGIS
  image could not be pulled; the map works via the GeoJSON column (no bbox filter). If a
  VPN/mirror becomes available, migrate the column to geometry(Point,4326).
