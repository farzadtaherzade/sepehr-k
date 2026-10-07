import { query } from './db';
import type {
  AppUser, AuditEntry, ContractExtension, ContractRevision,
  ContractorCategory, HeadcountRow, Project, ProjectDetail,
  Snapshot, SnapshotRevisionProgress,
} from '@/lib/types';

// NOTE: column lists are always explicit — the Directus audit columns added to
// these tables (status, sort, user_created, …) are never selected or written.

const P_COLS = `id, name, contract_start_date`;

const SNAPSHOT_COLS = [
  'id', 'project_id', 'report_date', 'revision_no',
  'progress_physical_actual', 'progress_physical_planned', 'progress_rial_actual', 'progress_rial_planned',
  'time_elapsed_days', 'time_progress_pct',
  'gross_payment', 'net_payment', 'actual_cost', 'overhead_cost', 'equipment_cost', 'commitments', 'revenue', 'production',
  'pv', 'ev', 'spi', 'cpi',
  'last_progress_statement', 'last_adjustment_statement',
  'revenue_to_cost_ratio', 'overhead_to_production_ratio', 'equipment_to_production_ratio',
  'commitments_to_production_ratio', 'collection_rate', 'avg_monthly_headcount',
  'updated_at',
] as const;

const S_COLS = SNAPSHOT_COLS.join(', ');
const S_PREFIXED = SNAPSHOT_COLS.map((c) => `s.${c}`).join(', ');

export async function listProjects(): Promise<Project[]> {
  return query<Project>(`SELECT ${P_COLS} FROM dim_project ORDER BY name`);
}

export async function getProject(id: number): Promise<Project | null> {
  const rows = await query<Project>(`SELECT ${P_COLS} FROM dim_project WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listCategories(): Promise<ContractorCategory[]> {
  return query<ContractorCategory>(
    `SELECT id, title, title_fa, display_order, aliases FROM dim_contractor_category ORDER BY display_order, id`
  );
}

export async function listSnapshots(filters: {
  projectId?: number | null;
  from?: string | null;
  to?: string | null;
  onlyActual?: boolean;
  snapshotIds?: number[] | null;
}): Promise<Snapshot[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (cond: string, val: unknown) => { params.push(val); where.push(cond.replace('?', `$${params.length}`)); };
  if (filters.projectId) add('s.project_id = ?', filters.projectId);
  if (filters.from) add('s.report_date >= ?', filters.from);
  if (filters.to) add('s.report_date <= ?', filters.to);
  if (filters.onlyActual) where.push('(s.progress_physical_actual IS NOT NULL OR s.spi IS NOT NULL OR s.ev IS NOT NULL OR s.actual_cost IS NOT NULL)');
  if (filters.snapshotIds && filters.snapshotIds.length > 0) {
    params.push(filters.snapshotIds);
    where.push(`s.id = ANY($${params.length})`);
  }
  const sql = `SELECT ${S_PREFIXED}, p.name AS project_name
    FROM project_snapshot s JOIN dim_project p ON p.id = s.project_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.name, s.report_date, s.id`;
  return query<Snapshot>(sql, params);
}

export async function getSnapshot(id: number): Promise<Snapshot | null> {
  const rows = await query<Snapshot>(
    `SELECT ${S_PREFIXED}, p.name AS project_name
     FROM project_snapshot s JOIN dim_project p ON p.id = s.project_id WHERE s.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listRevisions(projectId?: number): Promise<ContractRevision[]> {
  if (projectId) {
    return query<ContractRevision>(
      `SELECT id, project_id, revision_no, amount, duration_days, effective_date FROM contract_revision WHERE project_id = $1 ORDER BY revision_no`,
      [projectId]
    );
  }
  return query<ContractRevision>(
    `SELECT id, project_id, revision_no, amount, duration_days, effective_date FROM contract_revision ORDER BY project_id, revision_no`
  );
}

export async function listExtensions(projectId?: number): Promise<ContractExtension[]> {
  if (projectId) {
    return query<ContractExtension>(
      `SELECT id, project_id, extension_no, duration_days, effective_date FROM contract_extension WHERE project_id = $1 ORDER BY extension_no`,
      [projectId]
    );
  }
  return query<ContractExtension>(
    `SELECT id, project_id, extension_no, duration_days, effective_date FROM contract_extension ORDER BY project_id, extension_no`
  );
}

export async function listRevisionProgress(projectId?: number, snapshotId?: number): Promise<SnapshotRevisionProgress[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (projectId) { params.push(projectId); where.push(`p.id = $${params.length}`); }
  if (snapshotId) { params.push(snapshotId); where.push(`r.snapshot_id = $${params.length}`); }
  return query<SnapshotRevisionProgress>(
    `SELECT r.id, r.snapshot_id, r.revision_no, r.progress_physical_actual, r.progress_physical_planned,
            r.progress_rial_actual, r.progress_rial_planned, r.ev, r.pv, s.report_date, s.project_id
     FROM snapshot_revision_progress r
     JOIN project_snapshot s ON s.id = r.snapshot_id
     JOIN dim_project p ON p.id = s.project_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY s.report_date, r.revision_no`,
    params
  );
}

export async function listHeadcount(projectId?: number, snapshotId?: number): Promise<HeadcountRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (projectId) { params.push(projectId); where.push(`s.project_id = $${params.length}`); }
  if (snapshotId) { params.push(snapshotId); where.push(`h.snapshot_id = $${params.length}`); }
  return query<HeadcountRow>(
    `SELECT h.id, h.snapshot_id, h.contractor_category_id, h.headcount
     FROM snapshot_contractor_headcount h
     JOIN project_snapshot s ON s.id = h.snapshot_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY h.snapshot_id, h.contractor_category_id`,
    params
  );
}

export async function getProjectDetail(id: number): Promise<ProjectDetail | null> {
  const project = await getProject(id);
  if (!project) return null;
  const [snapshots, revisions, extensions, revisionProgress, headcount, categories] = await Promise.all([
    listSnapshots({ projectId: id }),
    listRevisions(id),
    listExtensions(id),
    listRevisionProgress(id),
    listHeadcount(id),
    listCategories(),
  ]);
  return { project, snapshots, revisions, extensions, revisionProgress, headcount, categories };
}

export async function listUsers(): Promise<AppUser[]> {
  return query<AppUser>(
    `SELECT id, username, full_name, role, is_active, must_change_password, last_login_at, created_at
     FROM app_user ORDER BY id`
  );
}

export async function listAudit(limit = 500): Promise<AuditEntry[]> {
  return query<AuditEntry>(
    `SELECT id, user_id, username, action, table_name, row_id, old_data, new_data, ip, created_at
     FROM audit_log ORDER BY id DESC LIMIT ${Math.min(Math.max(1, limit), 2000)}`
  );
}

/** Dashboard aggregates (from the analytical views). */
export async function dashboardData() {
  const [alerts, status, latest, counts] = await Promise.all([
    query(`SELECT project_id, project_name, report_date, cpi, spi, cv, sv, health_status FROM v_evm_distress_alerts ORDER BY
           CASE WHEN health_status LIKE 'CRITICAL%' THEN 0 WHEN health_status LIKE 'WARNING%' THEN 1
                WHEN health_status LIKE 'EXCELLENT%' THEN 3 ELSE 2 END, project_name`),
    query(`SELECT project_id, project_name, total_periods, reported_periods, last_period_in_sheet, last_reported_date, last_physical_progress_date FROM v_project_reporting_status`),
    query(`SELECT project_id, project_name, report_date, revision_no, progress_physical_actual, progress_physical_planned,
           spi, cpi, ev, pv, ac, time_progress_pct, revenue, commitments FROM v_project_latest_snapshot ORDER BY project_name`),
    query(`SELECT
             (SELECT COUNT(*) FROM dim_project) AS projects,
             (SELECT COUNT(*) FROM project_snapshot) AS total_periods,
             (SELECT COUNT(*) FROM project_snapshot WHERE progress_physical_actual IS NOT NULL OR spi IS NOT NULL) AS reported_periods,
             (SELECT COUNT(*) FROM dim_contractor_category) AS categories`),
  ]);
  return { alerts, status, latest, counts: counts[0] };
}
