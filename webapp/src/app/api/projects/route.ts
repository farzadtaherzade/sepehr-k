import { NextRequest } from 'next/server';
import { query } from '@/server/db';
import { projectCreateSchema } from '@/server/validators';
import { csrfOk, dbErrorMessage, ERR, jerr, zodFirstError } from '@/server/api-helpers';
import { guard } from '@/server/auth/guard';
import { writeAudit } from '@/server/audit';
import { clientIp } from '@/server/auth/rate-limit';

/** GET /api/projects — list projects with snapshot counts (any signed-in user). */
export async function GET(req: NextRequest) {
  const g = await guard(req, 'viewer');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }
  const rows = await query(
    `SELECT p.id, p.name, p.contract_start_date,
            COUNT(s.id) AS snapshot_count,
            COUNT(s.id) FILTER (WHERE s.progress_physical_actual IS NOT NULL OR s.spi IS NOT NULL) AS reported_count,
            MAX(s.report_date) FILTER (WHERE s.progress_physical_actual IS NOT NULL OR s.spi IS NOT NULL) AS last_reported_date
     FROM dim_project p LEFT JOIN project_snapshot s ON s.project_id = p.id
     GROUP BY p.id ORDER BY p.name`
  );
  return Response.json({ projects: rows });
}

/** POST /api/projects — create a project (editor+). */
export async function POST(req: NextRequest) {
  if (!csrfOk(req)) return jerr(403, 'درخواست نامعتبر است');
  const g = await guard(req, 'editor');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }

  const body = await req.json().catch(() => null);
  const parsed = projectCreateSchema.safeParse(body);
  if (!parsed.success) return jerr(400, zodFirstError(parsed.error));
  const { name, contract_start_date } = parsed.data;

  try {
    const rows = await query<{ id: number }>(
      `INSERT INTO dim_project (name, contract_start_date) VALUES ($1, $2) RETURNING id`,
      [name, contract_start_date]
    );
    await writeAudit({
      userId: g.user.uid, username: g.user.username, action: 'INSERT',
      tableName: 'dim_project', rowId: rows[0].id, newData: parsed.data, ip: clientIp(req),
    });
    return Response.json({ id: rows[0].id }, { status: 201 });
  } catch (e) {
    const msg = dbErrorMessage(e);
    if (msg) return jerr(409, msg);
    return ERR.server(e);
  }
}
