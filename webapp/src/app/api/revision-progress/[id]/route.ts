import { NextRequest } from 'next/server';
import { query } from '@/server/db';
import { csrfOk, ERR, jerr } from '@/server/api-helpers';
import { guard } from '@/server/auth/guard';
import { writeAudit } from '@/server/audit';
import { clientIp } from '@/server/auth/rate-limit';

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  if (!csrfOk(req)) return jerr(403, 'درخواست نامعتبر است');
  const g = await guard(req, 'editor');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }
  const { id } = await ctx.params;
  const rid = Number(id);
  if (!Number.isInteger(rid)) return ERR.badRequest('شناسه نامعتبر است');

  const oldRows = await query(
    `SELECT id, snapshot_id, revision_no, progress_physical_actual, progress_physical_planned,
            progress_rial_actual, progress_rial_planned, ev, pv
     FROM snapshot_revision_progress WHERE id = $1`, [rid]);
  if (!oldRows[0]) return ERR.notFound('رکورد یافت نشد');
  await query(`DELETE FROM snapshot_revision_progress WHERE id = $1`, [rid]);
  await writeAudit({
    userId: g.user.uid, username: g.user.username, action: 'DELETE',
    tableName: 'snapshot_revision_progress', rowId: rid, oldData: oldRows[0], ip: clientIp(req),
  });
  return Response.json({ ok: true });
}
