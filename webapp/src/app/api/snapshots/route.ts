import { NextRequest } from 'next/server';
import { query } from '@/server/db';
import { snapshotSchema } from '@/server/validators';
import { csrfOk, dbErrorMessage, ERR, jerr, zodFirstError } from '@/server/api-helpers';
import { guard } from '@/server/auth/guard';
import { writeAudit } from '@/server/audit';
import { clientIp } from '@/server/auth/rate-limit';
import { getSnapshot, listSnapshots } from '@/server/queries';

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** GET /api/snapshots?projectId=&from=&to=&onlyActual=1 */
export async function GET(req: NextRequest) {
  const g = await guard(req, 'viewer');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }
  const sp = req.nextUrl.searchParams;
  const num = (k: string) => {
    const v = Number(sp.get(k));
    return Number.isInteger(v) && v > 0 ? v : null;
  };
  const snapshots = await listSnapshots({
    projectId: num('projectId'),
    from: sp.get('from'),
    to: sp.get('to'),
    onlyActual: sp.get('onlyActual') === '1',
  });
  return Response.json({ snapshots });
}

/** POST /api/snapshots — create a period report (editor+). */
export async function POST(req: NextRequest) {
  if (!csrfOk(req)) return jerr(403, 'درخواست نامعتبر است');
  const g = await guard(req, 'editor');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }

  const body = await req.json().catch(() => null);
  const parsed = snapshotSchema.safeParse(body);
  if (!parsed.success) return jerr(400, zodFirstError(parsed.error));
  const d = parsed.data;

  // Auto-compute EVM indices when the source values are present.
  const spi = d.spi ?? (d.ev != null && d.pv != null && Number(d.pv) !== 0 ? round4(Number(d.ev) / Number(d.pv)) : null);
  const cpi = d.cpi ?? (d.ev != null && d.actual_cost != null && Number(d.actual_cost) !== 0 ? round4(Number(d.ev) / Number(d.actual_cost)) : null);

  try {
    const rows = await query<{ id: number }>(
      `INSERT INTO project_snapshot
        (project_id, report_date, revision_no,
         progress_physical_actual, progress_physical_planned, progress_rial_actual, progress_rial_planned,
         time_elapsed_days, time_progress_pct,
         gross_payment, net_payment, actual_cost, overhead_cost, equipment_cost, commitments, revenue, production,
         pv, ev, spi, cpi,
         last_progress_statement, last_adjustment_statement,
         revenue_to_cost_ratio, overhead_to_production_ratio, equipment_to_production_ratio,
         commitments_to_production_ratio, collection_rate, avg_monthly_headcount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
       RETURNING id`,
      [
        d.project_id, d.report_date, d.revision_no ?? 0,
        d.progress_physical_actual, d.progress_physical_planned, d.progress_rial_actual, d.progress_rial_planned,
        d.time_elapsed_days, d.time_progress_pct,
        d.gross_payment, d.net_payment, d.actual_cost, d.overhead_cost, d.equipment_cost,
        d.commitments, d.revenue, d.production,
        d.pv, d.ev, spi, cpi,
        d.last_progress_statement, d.last_adjustment_statement,
        d.revenue_to_cost_ratio, d.overhead_to_production_ratio, d.equipment_to_production_ratio,
        d.commitments_to_production_ratio, d.collection_rate, d.avg_monthly_headcount,
      ]
    );
    await writeAudit({
      userId: g.user.uid, username: g.user.username, action: 'INSERT',
      tableName: 'project_snapshot', rowId: rows[0].id, newData: { ...d, spi, cpi }, ip: clientIp(req),
    });
    const created = await getSnapshot(rows[0].id);
    return Response.json({ snapshot: created }, { status: 201 });
  } catch (e) {
    const msg = dbErrorMessage(e);
    if (msg) return jerr(409, msg);
    return ERR.server(e);
  }
}
