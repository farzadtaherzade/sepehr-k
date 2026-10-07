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
  const hid = Number(id);
  if (!Number.isInteger(hid)) return ERR.badRequest('شناسه نامعتبر است');

  const oldRows = await query(
    `SELECT id, snapshot_id, contractor_category_id, headcount FROM snapshot_contractor_headcount WHERE id = $1`, [hid]);
  if (!oldRows[0]) return ERR.notFound('رکورد یافت نشد');
  await query(`DELETE FROM snapshot_contractor_headcount WHERE id = $1`, [hid]);
  await writeAudit({
    userId: g.user.uid, username: g.user.username, action: 'DELETE',
    tableName: 'snapshot_contractor_headcount', rowId: hid, oldData: oldRows[0], ip: clientIp(req),
  });
  return Response.json({ ok: true });
}
