import { NextRequest } from 'next/server';
import { query } from '@/server/db';
import { revisionProgressSchema } from '@/server/validators';
import { csrfOk, ERR, jerr, zodFirstError } from '@/server/api-helpers';
import { guard } from '@/server/auth/guard';
import { writeAudit } from '@/server/audit';
import { clientIp } from '@/server/auth/rate-limit';
import { listRevisionProgress } from '@/server/queries';

export async function GET(req: NextRequest) {
  const g = await guard(req, 'viewer');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }
  const sp = req.nextUrl.searchParams;
  const pid = Number(sp.get('projectId'));
  const sid = Number(sp.get('snapshotId'));
  const rows = await listRevisionProgress(
    Number.isInteger(pid) && pid > 0 ? pid : undefined,
    Number.isInteger(sid) && sid > 0 ? sid : undefined
  );
  return Response.json({ revision_progress: rows });
}

/** POST /api/revision-progress — upsert one (snapshot, revision) row (editor+). */
export async function POST(req: NextRequest) {
  if (!csrfOk(req)) return jerr(403, 'درخواست نامعتبر است');
  const g = await guard(req, 'editor');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }

  const body = await req.json().catch(() => null);
  const parsed = revisionProgressSchema.safeParse(body);
  if (!parsed.success) return jerr(400, zodFirstError(parsed.error));
  const d = parsed.data;

  try {
    const rows = await query<{ id: number }>(
      `INSERT INTO snapshot_revision_progress
         (snapshot_id, revision_no, progress_physical_actual, progress_physical_planned,
          progress_rial_actual, progress_rial_planned, ev, pv)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (snapshot_id, revision_no) DO UPDATE SET
         progress_physical_actual = EXCLUDED.progress_physical_actual,
         progress_physical_planned = EXCLUDED.progress_physical_planned,
         progress_rial_actual = EXCLUDED.progress_rial_actual,
         progress_rial_planned = EXCLUDED.progress_rial_planned,
         ev = EXCLUDED.ev,
         pv = EXCLUDED.pv
       RETURNING id`,
      [d.snapshot_id, d.revision_no, d.progress_physical_actual, d.progress_physical_planned,
       d.progress_rial_actual, d.progress_rial_planned, d.ev, d.pv]
    );
    await writeAudit({
      userId: g.user.uid, username: g.user.username, action: 'UPSERT',
      tableName: 'snapshot_revision_progress', rowId: rows[0].id, newData: d, ip: clientIp(req),
    });
    return Response.json({ id: rows[0].id });
  } catch (e) {
    console.error('[revision-progress]', e);
    return ERR.server(e);
  }
}
