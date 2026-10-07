-- =============================================================================
-- Centralized Project Data Platform (EVM)
-- Schema Definition
-- =============================================================================

-- 1. Dim Project (Master list of projects)
CREATE TABLE IF NOT EXISTS dim_project (
    id                  SERIAL PRIMARY KEY,
    name                TEXT NOT NULL UNIQUE,
    contract_start_date DATE,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Dim Contractor Category (Standard trades / disciplines)
CREATE TABLE IF NOT EXISTS dim_contractor_category (
    id                  SERIAL PRIMARY KEY,
    title               TEXT NOT NULL UNIQUE,   -- canonical slug: mobilization, concrete_structure, ...
    title_fa            TEXT,                  -- Persian translation for UI display
    display_order       INT DEFAULT 0,
    aliases             TEXT[] DEFAULT '{}',   -- Excel/Persian synonyms that map to this category
    UNIQUE(title)
);

-- 3. Contract Revision (REV0, REV1, REV2, REV3...)
CREATE TABLE IF NOT EXISTS contract_revision (
    id                  SERIAL PRIMARY KEY,
    project_id          INT NOT NULL REFERENCES dim_project(id) ON DELETE CASCADE,
    revision_no         SMALLINT NOT NULL,      -- 0, 1, 2, 3...
    amount              NUMERIC(18, 2),
    duration_days       INT,
    effective_date      DATE,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, revision_no)
);

-- 4. Contract Extension (Time extensions)
CREATE TABLE IF NOT EXISTS contract_extension (
    id                  SERIAL PRIMARY KEY,
    project_id          INT NOT NULL REFERENCES dim_project(id) ON DELETE CASCADE,
    extension_no        SMALLINT NOT NULL,      -- 1, 2, 3...
    duration_days       INT,
    effective_date      DATE,
    UNIQUE(project_id, extension_no)
);

-- 5. Project Snapshot (Periodic EVM & progress status report)
CREATE TABLE IF NOT EXISTS project_snapshot (
    id                          SERIAL PRIMARY KEY,
    project_id                  INT NOT NULL REFERENCES dim_project(id) ON DELETE CASCADE,
    report_date                 DATE NOT NULL,
    revision_no                 SMALLINT DEFAULT 0, -- which REV this report is based on
    progress_physical_actual    NUMERIC(7, 4),      -- percentage e.g. 0.4520 or 45.20
    progress_physical_planned   NUMERIC(7, 4),
    progress_rial_actual        NUMERIC(7, 4),
    progress_rial_planned       NUMERIC(7, 4),
    time_elapsed_days           INT,
    time_progress_pct           NUMERIC(7, 4),
    gross_payment               NUMERIC(18, 2),
    net_payment                 NUMERIC(18, 2),
    actual_cost                 NUMERIC(18, 2),     -- AC
    overhead_cost               NUMERIC(18, 2),
    equipment_cost              NUMERIC(18, 2),
    commitments                 NUMERIC(18, 2),
    revenue                     NUMERIC(18, 2),
    production                  NUMERIC(18, 2),
    pv                          NUMERIC(18, 2),     -- Planned Value
    ev                          NUMERIC(18, 2),     -- Earned Value
    spi                         NUMERIC(8, 4),      -- Schedule Performance Index (EV / PV)
    cpi                         NUMERIC(8, 4),      -- Cost Performance Index (EV / AC)
    -- Extra metrics present in the source workbook and used by its dashboards
    last_progress_statement     NUMERIC(18, 2),     -- آخرین صورت وضعیت تجمعی کارکرد تایید شده
    last_adjustment_statement   NUMERIC(18, 2),     -- آخرین صورت وضعیت تجمعی تعدیل تایید شده
    revenue_to_cost_ratio       NUMERIC(10, 4),     -- نسبت درآمد به هزینه
    overhead_to_production_ratio NUMERIC(10, 4),    -- نسبت بالاسری به تولید
    equipment_to_production_ratio NUMERIC(10, 4),   -- نسبت هزینه های تجهیز به تولید
    commitments_to_production_ratio NUMERIC(10, 4), -- نسبت تعهدات به تولید
    collection_rate             NUMERIC(8, 4),      -- درصد وصول مطالبات
    avg_monthly_headcount       NUMERIC(10, 2),     -- متوسط نیروی انسانی پیمانکار در ماه
    created_at                  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, report_date)
);

-- 6. Snapshot Revision Progress
-- The workbook carries progress/EV/PV figures per contract revision (REV0-REV3)
-- for the same report row. Normalized to one row per (snapshot, revision) so a
-- REV4 needs no schema change, mirroring the approach used for contract_revision.
CREATE TABLE IF NOT EXISTS snapshot_revision_progress (
    id                          SERIAL PRIMARY KEY,
    snapshot_id                 INT NOT NULL REFERENCES project_snapshot(id) ON DELETE CASCADE,
    revision_no                 SMALLINT NOT NULL,      -- 0 = برنامه اولیه, 1..3 = REV1..REV3
    progress_physical_actual    NUMERIC(7, 4),
    progress_physical_planned   NUMERIC(7, 4),
    progress_rial_actual        NUMERIC(7, 4),
    progress_rial_planned       NUMERIC(7, 4),
    ev                          NUMERIC(18, 2),
    pv                          NUMERIC(18, 2),
    UNIQUE(snapshot_id, revision_no)
);

-- 7. Snapshot Contractor Headcount (Normalized headcount per trade per report)
-- headcount is the AVERAGE manpower for the reporting period, not a headcount
-- snapshot: the workbook stores fractional values (e.g. 17.37 people), so this
-- is NUMERIC rather than INT - an INT column would truncate real data.
CREATE TABLE IF NOT EXISTS snapshot_contractor_headcount (
    id                       SERIAL PRIMARY KEY,
    snapshot_id              INT NOT NULL REFERENCES project_snapshot(id) ON DELETE CASCADE,
    contractor_category_id   INT NOT NULL REFERENCES dim_contractor_category(id),
    headcount                NUMERIC(10, 2) NOT NULL DEFAULT 0,
    created_at               TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(snapshot_id, contractor_category_id)
);

-- =============================================================================
-- Indexes for Performance
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_snapshot_project_date ON project_snapshot(project_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_snapshot_cpi ON project_snapshot(cpi);
CREATE INDEX IF NOT EXISTS idx_snapshot_spi ON project_snapshot(spi);
CREATE INDEX IF NOT EXISTS idx_headcount_snapshot ON snapshot_contractor_headcount(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_revision_project ON contract_revision(project_id);
CREATE INDEX IF NOT EXISTS idx_snap_rev_progress ON snapshot_revision_progress(snapshot_id);

-- =============================================================================
-- Read-Only Views for Easy Analysis & Dashboarding
-- =============================================================================

-- View 1: Latest Snapshot per Project with EVM metrics
--
-- IMPORTANT: every project carries forward-looking rows for future periods
-- (the source workbook pre-fills planned dates to contract completion). Those
-- rows have a later report_date but no actual progress/EV/SPI values, so picking
-- simply the MAX(report_date) returns an empty row for all 10 projects.
-- We therefore select the latest report_date that actually has reported values.
CREATE OR REPLACE VIEW v_project_latest_snapshot AS
SELECT DISTINCT ON (p.id)
    p.id AS project_id,
    p.name AS project_name,
    p.contract_start_date,
    s.id AS snapshot_id,
    s.report_date,
    s.revision_no,
    s.progress_physical_actual,
    s.progress_physical_planned,
    s.progress_rial_actual,
    s.progress_rial_planned,
    s.pv,
    s.ev,
    s.actual_cost AS ac,
    s.spi,
    s.cpi,
    (s.ev - s.pv) AS sv, -- Schedule Variance
    (s.ev - s.actual_cost) AS cv, -- Cost Variance
    s.time_elapsed_days,
    s.time_progress_pct,
    s.revenue,
    s.commitments,
    s.overhead_cost,
    s.equipment_cost,
    s.production,
    s.gross_payment,
    s.net_payment,
    s.collection_rate,
    s.avg_monthly_headcount,
    s.revenue_to_cost_ratio,
    s.overhead_to_production_ratio
FROM dim_project p
JOIN project_snapshot s ON p.id = s.project_id
-- Only rows carrying actual reported values count as "latest".
WHERE s.progress_physical_actual IS NOT NULL
   OR s.ev IS NOT NULL
   OR s.spi IS NOT NULL
   OR s.actual_cost IS NOT NULL
ORDER BY p.id, s.report_date DESC;

-- View 5: Reporting status per project - how many periods are actual vs planned,
-- and when the last real report was. Useful for spotting stale projects and for
-- explaining why a project's "latest" row may be old.
CREATE OR REPLACE VIEW v_project_reporting_status AS
SELECT
    p.id AS project_id,
    p.name AS project_name,
    COUNT(*) AS total_periods,
    COUNT(*) FILTER (
        WHERE s.progress_physical_actual IS NOT NULL OR s.spi IS NOT NULL
    ) AS reported_periods,
    MAX(s.report_date) AS last_period_in_sheet,
    MAX(s.report_date) FILTER (
        WHERE s.progress_physical_actual IS NOT NULL OR s.spi IS NOT NULL
    ) AS last_reported_date,
    MAX(s.report_date) FILTER (WHERE s.progress_physical_actual IS NOT NULL)
        AS last_physical_progress_date
FROM dim_project p
JOIN project_snapshot s ON p.id = s.project_id
GROUP BY p.id, p.name
ORDER BY last_reported_date DESC NULLS LAST;
CREATE OR REPLACE VIEW v_project_revision_progress AS
SELECT
    p.name AS project_name,
    s.report_date,
    r.revision_no,
    r.progress_physical_actual,
    r.progress_physical_planned,
    r.progress_rial_actual,
    r.progress_rial_planned,
    r.ev,
    r.pv,
    CASE WHEN r.pv > 0 THEN ROUND(r.ev / r.pv, 4) END AS revision_spi
FROM snapshot_revision_progress r
JOIN project_snapshot s ON s.id = r.snapshot_id
JOIN dim_project p ON p.id = s.project_id
WHERE r.ev IS NOT NULL OR r.progress_physical_actual IS NOT NULL
ORDER BY p.name, s.report_date DESC, r.revision_no;

-- View 2: EVM Health Alert View (Projects in distress)
CREATE OR REPLACE VIEW v_evm_distress_alerts AS
SELECT
    project_id,
    project_name,
    report_date,
    cpi,
    spi,
    cv,
    sv,
    CASE
        WHEN cpi < 0.90 AND spi < 0.90 THEN 'CRITICAL: Cost overrun & Behind schedule'
        WHEN cpi < 0.90 THEN 'WARNING: Cost overrun (CPI < 0.90)'
        WHEN spi < 0.90 THEN 'WARNING: Behind schedule (SPI < 0.90)'
        WHEN cpi > 1.05 AND spi > 1.05 THEN 'EXCELLENT: Under budget & Ahead of schedule'
        ELSE 'ON TRACK'
    END AS health_status
FROM v_project_latest_snapshot;

-- View 3: Total Headcount per Snapshot
CREATE OR REPLACE VIEW v_snapshot_total_headcount AS
SELECT
    s.id AS snapshot_id,
    s.project_id,
    p.name AS project_name,
    s.report_date,
    COALESCE(SUM(h.headcount), 0) AS total_headcount
FROM project_snapshot s
JOIN dim_project p ON s.project_id = p.id
LEFT JOIN snapshot_contractor_headcount h ON s.id = h.snapshot_id
GROUP BY s.id, s.project_id, p.name, s.report_date;

-- =============================================================================
-- Seed Initial Contractor Categories (Common standard construction trades)
-- =============================================================================
INSERT INTO dim_contractor_category (title, title_fa, display_order, aliases) VALUES
    ('direct_staff', 'ستادی', 1,
        ARRAY['ستادی']),
    ('daily_wage', 'روزمزد', 2,
        ARRAY['روزمزد']),
    ('mobilization', 'پیمانکار تجهیز', 3,
        ARRAY['تجهیز', 'پیمانکار تجهیز']),
    ('demolition', 'پیمانکار تخریب', 4,
        ARRAY['تخریب', 'پیمانکار تخریب']),
    ('earthwork_excavation', 'پیمانکار خاکبرداری', 5,
        ARRAY['خاکبرداری', 'پیمانکار خاکبرداری']),
    ('shoring_stabilization', 'پیمانکار اجرای سازه نگهبان', 6,
        ARRAY['اجرای سازه نگهبان', 'پیمانکار اجرای سازه نگهبان']),
    ('concrete_structure', 'پیمانکار اجرای سازه بتنی', 7,
        ARRAY['اجرای سازه بتنی', 'پیمانکار اجرای سازه بتنی']),
    ('steel_structure_fabrication', 'پیمانکار ساخت اسکلت فلزی', 8,
        ARRAY['ساخت اسکلت فلزی', 'پیمانکار ساخت اسکلت فلزی']),
    ('steel_structure_erection', 'پیمانکار نصب اسکلت فلزی', 9,
        ARRAY['نصب اسکلت فلزی', 'پیمانکار نصب اسکلت فلزی']),
    ('fireproofing', 'پیمانکار اجرای ضد حریق', 10,
        ARRAY['اجرای ضد حریق', 'پیمانکار اجرای ضد حریق']),
    ('scaffolding', 'پیمانکار داربست بندی', 11,
        ARRAY['داربست بندی', 'پیمانکار داربست بندی']),
    ('masonry_walling', 'پیمانکار سفت کاری', 12,
        ARRAY['سفت کاری', 'پیمانکار سفت کاری']),
    ('plastering_drywall', 'پیمانکار نازک کاری', 13,
        ARRAY['نازک کاری', 'پیمانکار نازک کاری']),
    ('mechanical', 'پیمانکار مکانیکال', 14,
        ARRAY['مکانیکال', 'پیمانکار مکانیکال']),
    ('electrical', 'پیمانکار الکتریکال', 15,
        ARRAY['الکتریکال', 'پیمانکار الکتریکال']),
    ('facade_cladding', 'پیمانکار اجرای نما', 16,
        ARRAY['اجرای نما', 'پیمانکار اجرای نما']),
    ('landscaping', 'پیمانکار محوطه سازی', 17,
        ARRAY['محوطه سازی', 'پیمانکار محوطه سازی']),
    ('piping', 'پیمانکار Piping', 18,
        ARRAY['Piping', 'پیمانکار Piping'])
ON CONFLICT (title) DO UPDATE
SET title_fa = EXCLUDED.title_fa,
    display_order = EXCLUDED.display_order,
    aliases = EXCLUDED.aliases;

-- =============================================================================
-- Read-Only Role Creation for Analytics Agent
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'analytics_readonly') THEN
        CREATE ROLE analytics_readonly WITH LOGIN PASSWORD 'readonly_secret_pass';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE evm_db TO analytics_readonly;
GRANT USAGE ON SCHEMA public TO analytics_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO analytics_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO analytics_readonly;

-- =============================================================================
-- Project summary columns (2026-10-06) — live aggregates from project_snapshot,
-- maintained by trigger so the Directus project list can sort/filter by them.
-- =============================================================================
ALTER TABLE dim_project
  ADD COLUMN IF NOT EXISTS reports_count    INT,
  ADD COLUMN IF NOT EXISTS last_report_date DATE,
  ADD COLUMN IF NOT EXISTS last_progress    NUMERIC(7,4),
  ADD COLUMN IF NOT EXISTS last_spi         NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS last_cpi         NUMERIC(8,4);

CREATE OR REPLACE FUNCTION sync_project_report_stats(p_id INT) RETURNS void AS $$
BEGIN
  UPDATE dim_project p SET
    reports_count    = st.cnt,
    last_report_date = st.maxd,
    last_progress    = lp.progress_physical_actual,
    last_spi         = lp.spi,
    last_cpi         = lp.cpi
  FROM (SELECT COUNT(*) AS cnt, MAX(report_date) AS maxd
        FROM project_snapshot WHERE project_id = p_id) st
  CROSS JOIN LATERAL (SELECT progress_physical_actual, spi, cpi
                      FROM project_snapshot
                      WHERE project_id = p_id AND progress_physical_actual IS NOT NULL
                      ORDER BY report_date DESC, id DESC LIMIT 1) lp
  WHERE p.id = p_id;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_project_report_stats_with_row() RETURNS trigger AS $$
BEGIN
  PERFORM sync_project_report_stats(COALESCE(NEW.project_id, OLD.project_id));
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_snapshot_stats ON project_snapshot;
CREATE TRIGGER trg_snapshot_stats
AFTER INSERT OR UPDATE OF project_id, report_date, progress_physical_actual, spi, cpi OR DELETE
ON project_snapshot FOR EACH ROW
EXECUTE FUNCTION sync_project_report_stats_with_row();

-- =============================================================================
-- More live summary columns (2026-10-06, batch 2)
--   dim_project:          contract-side summary from contract_revision/extension
--   project_snapshot:     total headcount from snapshot_contractor_headcount
--   dim_contractor_category: usage stats from snapshot_contractor_headcount
-- =============================================================================
ALTER TABLE dim_project
  ADD COLUMN IF NOT EXISTS last_revision_no      SMALLINT,
  ADD COLUMN IF NOT EXISTS initial_amount        NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS current_amount        NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS initial_duration_days INT,
  ADD COLUMN IF NOT EXISTS current_duration_days INT,
  ADD COLUMN IF NOT EXISTS extensions_count      INT,
  ADD COLUMN IF NOT EXISTS total_extension_days  INT;
ALTER TABLE project_snapshot ADD COLUMN IF NOT EXISTS headcount_total NUMERIC(12,2);
ALTER TABLE dim_contractor_category
  ADD COLUMN IF NOT EXISTS usage_count   INT,
  ADD COLUMN IF NOT EXISTS avg_headcount NUMERIC(12,2);

CREATE OR REPLACE FUNCTION sync_project_contract_stats(p_id INT) RETURNS void AS $$
BEGIN
  UPDATE dim_project p SET
    last_revision_no      = rev.last_rev,
    initial_amount        = rev.init_amt,
    current_amount        = rev.cur_amt,
    initial_duration_days = rev.init_dur,
    current_duration_days = rev.cur_dur,
    extensions_count      = ext.cnt,
    total_extension_days  = ext.days
  FROM (SELECT
      (SELECT revision_no   FROM contract_revision WHERE project_id = p_id ORDER BY revision_no DESC LIMIT 1) AS last_rev,
      (SELECT amount        FROM contract_revision WHERE project_id = p_id AND amount IS NOT NULL        ORDER BY revision_no ASC  LIMIT 1) AS init_amt,
      (SELECT amount        FROM contract_revision WHERE project_id = p_id AND amount IS NOT NULL        ORDER BY revision_no DESC LIMIT 1) AS cur_amt,
      (SELECT duration_days FROM contract_revision WHERE project_id = p_id AND duration_days IS NOT NULL ORDER BY revision_no ASC  LIMIT 1) AS init_dur,
      (SELECT duration_days FROM contract_revision WHERE project_id = p_id AND duration_days IS NOT NULL ORDER BY revision_no DESC LIMIT 1) AS cur_dur
    ) rev
  CROSS JOIN LATERAL (SELECT COUNT(*) AS cnt, COALESCE(SUM(duration_days),0) AS days
                      FROM contract_extension WHERE project_id = p_id) ext
  WHERE p.id = p_id;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_snapshot_headcount_total(s_id INT) RETURNS void AS $$
BEGIN
  UPDATE project_snapshot s SET headcount_total = agg.total
  FROM (SELECT COALESCE(SUM(headcount),0) AS total
        FROM snapshot_contractor_headcount WHERE snapshot_id = s_id) agg
  WHERE s.id = s_id;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_category_headcount_stats(c_id INT) RETURNS void AS $$
BEGIN
  UPDATE dim_contractor_category c SET
    usage_count   = agg.cnt,
    avg_headcount = agg.avg
  FROM (SELECT COUNT(*) AS cnt, AVG(headcount) AS avg
        FROM snapshot_contractor_headcount WHERE contractor_category_id = c_id) agg
  WHERE c.id = c_id;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_project_contract_stats_with_row() RETURNS trigger AS $$
BEGIN
  PERFORM sync_project_contract_stats(COALESCE(NEW.project_id, OLD.project_id));
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_headcount_stats_with_row() RETURNS trigger AS $$
BEGIN
  PERFORM sync_snapshot_headcount_total(COALESCE(NEW.snapshot_id, OLD.snapshot_id));
  PERFORM sync_category_headcount_stats(COALESCE(NEW.contractor_category_id, OLD.contractor_category_id));
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_revision_stats ON contract_revision;
CREATE TRIGGER trg_revision_stats
AFTER INSERT OR UPDATE OF project_id, revision_no, amount, duration_days OR DELETE
ON contract_revision FOR EACH ROW
EXECUTE FUNCTION sync_project_contract_stats_with_row();

DROP TRIGGER IF EXISTS trg_extension_stats ON contract_extension;
CREATE TRIGGER trg_extension_stats
AFTER INSERT OR UPDATE OF project_id, duration_days OR DELETE
ON contract_extension FOR EACH ROW
EXECUTE FUNCTION sync_project_contract_stats_with_row();

DROP TRIGGER IF EXISTS trg_headcount_stats ON snapshot_contractor_headcount;
CREATE TRIGGER trg_headcount_stats
AFTER INSERT OR UPDATE OF snapshot_id, contractor_category_id, headcount OR DELETE
ON snapshot_contractor_headcount FOR EACH ROW
EXECUTE FUNCTION sync_headcount_stats_with_row();
