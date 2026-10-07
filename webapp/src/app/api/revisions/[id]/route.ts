import { NextRequest } from 'next/server';
import { query } from '@/server/db';
import { revisionSchema } from '@/server/validators';
import { csrfOk, dbErrorMessage, ERR, jerr, zodFirstError } from '@/server/api-helpers';
import { guard } from '@/server/auth/guard';
import { writeAudit } from '@/server/audit';
import { clientIp } from '@/server/auth/rate-limit';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!csrfOk(req)) return jerr(403, 'درخواست نامعتبر است');
  const g = await guard(req, 'editor');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }
  const { id } = await ctx.params;
  const rid = Number(id);
  if (!Number.isInteger(rid)) return ERR.badRequest('شناسه اصلاحیه نامعتبر است');

  const body = await req.json().catch(() => null);
  const parsed = revisionSchema.partial().omit({ project_id: true }).safeParse(body);
  if (!parsed.success) return jerr(400, zodFirstError(parsed.error));

  const oldRows = await query(
    `SELECT id, project_id, revision_no, amount, duration_days, effective_date FROM contract_revision WHERE id = $1`, [rid]);
  if (!oldRows[0]) return ERR.notFound('اصلاحیه یافت نشد');

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const col of ['revision_no', 'amount', 'duration_days', 'effective_date'] as const) {
    if (parsed.data[col] !== undefined) { params.push(parsed.data[col]); sets.push(`${col} = $${params.length}`); }
  }
  if (!sets.length) return ERR.badRequest('تغییری ارسال نشده است');
  params.push(rid);

  try {
    await query(`UPDATE contract_revision SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  } catch (e) {
    const msg = dbErrorMessage(e);
    if (msg) return jerr(409, msg);
    return ERR.server(e);
  }
  await writeAudit({
    userId: g.user.uid, username: g.user.username, action: 'UPDATE',
    tableName: 'contract_revision', rowId: rid, oldData: oldRows[0], newData: parsed.data, ip: clientIp(req),
  });
  return Response.json({ ok: true });
}

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
  if (!Number.isInteger(rid)) return ERR.badRequest('شناسه اصلاحیه نامعتبر است');

  const oldRows = await query(`SELECT id, project_id, revision_no, amount, duration_days, effective_date FROM contract_revision WHERE id = $1`, [rid]);
  if (!oldRows[0]) return ERR.notFound('اصلاحیه یافت نشد');
  await query(`DELETE FROM contract_revision WHERE id = $1`, [rid]);
  await writeAudit({
    userId: g.user.uid, username: g.user.username, action: 'DELETE',
    tableName: 'contract_revision', rowId: rid, oldData: oldRows[0], ip: clientIp(req),
  });
  return Response.json({ ok: true });
}
