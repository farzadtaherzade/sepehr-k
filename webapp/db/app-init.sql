-- =============================================================================
-- EVM WebApp — application tables, least-privilege runtime role, grants.
-- Idempotent: safe to run on every webapp startup (data dir already initialized).
-- Placeholders __EVM_APP_PASSWORD__ and __DB_NAME__ are replaced by the webapp
-- (server/init-db.ts) with values from the environment at startup.
--
-- This file NEVER touches the Directus system tables. The evm_app role gets
-- grants ONLY on the EVM business tables + views + app tables below.
-- =============================================================================

-- 1. Application users (login accounts for the web app)
CREATE TABLE IF NOT EXISTS app_user (
    id                    SERIAL PRIMARY KEY,
    username              TEXT NOT NULL UNIQUE,
    password_hash         TEXT NOT NULL,
    full_name             TEXT,
    role                  TEXT NOT NULL DEFAULT 'viewer'
                          CHECK (role IN ('admin', 'editor', 'viewer')),
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password  BOOLEAN NOT NULL DEFAULT FALSE,
    failed_attempts       INT NOT NULL DEFAULT 0,
    locked_until          TIMESTAMPTZ,
    last_login_at         TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Audit trail (who changed what, when, from where) — append only
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    user_id     INT,
    username    TEXT NOT NULL,
    action      TEXT NOT NULL,          -- LOGIN, LOGIN_FAILED, INSERT, UPDATE, DELETE
    table_name  TEXT,
    row_id      TEXT,
    old_data    JSONB,
    new_data    JSONB,
    ip          TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_username ON audit_log(username);

-- 3. Optimistic locking for the hot table (project_snapshot): track last change
ALTER TABLE project_snapshot ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_snapshot_updated ON project_snapshot;
CREATE TRIGGER trg_project_snapshot_updated
    BEFORE UPDATE ON project_snapshot
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 4. Dedicated least-privilege runtime role for the web app.
--    The password is re-synced from the environment on every startup.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'evm_app') THEN
        CREATE ROLE evm_app WITH LOGIN PASSWORD '__EVM_APP_PASSWORD__';
    END IF;
END
$$;
ALTER ROLE evm_app WITH LOGIN PASSWORD '__EVM_APP_PASSWORD__';

GRANT CONNECT ON DATABASE __DB_NAME__ TO evm_app;
GRANT USAGE ON SCHEMA public TO evm_app;

-- Business tables (full CRUD for the app; role checks happen in the app layer)
GRANT SELECT, INSERT, UPDATE, DELETE ON
    dim_project,
    dim_contractor_category,
    contract_revision,
    contract_extension,
    project_snapshot,
    snapshot_revision_progress,
    snapshot_contractor_headcount,
    app_user
TO evm_app;

-- Audit log: append + read, never update/delete
GRANT SELECT, INSERT ON audit_log TO evm_app;

-- Sequences for the SERIAL keys the app inserts into
GRANT USAGE, SELECT ON SEQUENCE
    dim_project_id_seq,
    dim_contractor_category_id_seq,
    contract_revision_id_seq,
    contract_extension_id_seq,
    project_snapshot_id_seq,
    snapshot_revision_progress_id_seq,
    snapshot_contractor_headcount_id_seq,
    app_user_id_seq,
    audit_log_id_seq
TO evm_app;

-- Read-only analytical views
GRANT SELECT ON
    v_project_latest_snapshot,
    v_project_reporting_status,
    v_project_revision_progress,
    v_evm_distress_alerts,
    v_snapshot_total_headcount
TO evm_app;
