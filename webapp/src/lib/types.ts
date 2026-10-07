export type Role = 'admin' | 'editor' | 'viewer';

export interface SessionUser {
  uid: number;
  username: string;
  name: string;
  role: Role;
}

export interface Project {
  id: number;
  name: string;
  contract_start_date: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ContractRevision {
  id: number;
  project_id: number;
  revision_no: number;
  amount: string | null;
  duration_days: number | null;
  effective_date: string | null;
  created_at?: string;
}

export interface ContractExtension {
  id: number;
  project_id: number;
  extension_no: number;
  duration_days: number | null;
  effective_date: string | null;
}

export interface Snapshot {
  id: number;
  project_id: number;
  project_name?: string;
  report_date: string;
  revision_no: number | null;
  progress_physical_actual: string | null;
  progress_physical_planned: string | null;
  progress_rial_actual: string | null;
  progress_rial_planned: string | null;
  time_elapsed_days: number | null;
  time_progress_pct: string | null;
  gross_payment: string | null;
  net_payment: string | null;
  actual_cost: string | null;
  overhead_cost: string | null;
  equipment_cost: string | null;
  commitments: string | null;
  revenue: string | null;
  production: string | null;
  pv: string | null;
  ev: string | null;
  spi: string | null;
  cpi: string | null;
  last_progress_statement: string | null;
  last_adjustment_statement: string | null;
  revenue_to_cost_ratio: string | null;
  overhead_to_production_ratio: string | null;
  equipment_to_production_ratio: string | null;
  commitments_to_production_ratio: string | null;
  collection_rate: string | null;
  avg_monthly_headcount: string | null;
  updated_at?: string;
}

export interface SnapshotRevisionProgress {
  id: number;
  snapshot_id: number;
  revision_no: number;
  progress_physical_actual: string | null;
  progress_physical_planned: string | null;
  progress_rial_actual: string | null;
  progress_rial_planned: string | null;
  ev: string | null;
  pv: string | null;
  report_date?: string;
  project_id?: number;
}

export interface ContractorCategory {
  id: number;
  title: string;
  title_fa: string | null;
  display_order: number | null;
  aliases: string[] | null;
}

export interface HeadcountRow {
  id: number;
  snapshot_id: number;
  contractor_category_id: number;
  headcount: string;
}

export interface AppUser {
  id: number;
  username: string;
  full_name: string | null;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  user_id: number | null;
  username: string;
  action: string;
  table_name: string | null;
  row_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

export interface ProjectDetail {
  project: Project;
  snapshots: Snapshot[];
  revisions: ContractRevision[];
  extensions: ContractExtension[];
  revisionProgress: SnapshotRevisionProgress[];
  headcount: HeadcountRow[];
  categories: ContractorCategory[];
}

/** Map English health status from v_evm_distress_alerts to Persian badge info. */
export function healthStatusFa(raw: string | null): { label: string; tone: 'red' | 'amber' | 'green' | 'teal' } {
  if (!raw) return { label: 'بدون داده', tone: 'teal' };
  if (raw.startsWith('CRITICAL')) return { label: 'بحرانی', tone: 'red' };
  if (raw.startsWith('WARNING')) return { label: 'هشدار', tone: 'amber' };
  if (raw.startsWith('EXCELLENT')) return { label: 'عالی', tone: 'green' };
  return { label: 'در مسیر', tone: 'teal' };
}
