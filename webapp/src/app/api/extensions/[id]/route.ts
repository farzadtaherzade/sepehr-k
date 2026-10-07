import { NextRequest } from 'next/server';
import { query } from '@/server/db';
import { extensionSchema } from '@/server/validators';
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
  const eid = Number(id);
  if (!Number.isInteger(eid)) return ERR.badRequest('شناسه تمدید نامعتبر است');

  const body = await req.json().catch(() => null);
  const parsed = extensionSchema.partial().omit({ project_id: true }).safeParse(body);
  if (!parsed.success) return jerr(400, zodFirstError(parsed.error));

  const oldRows = await query(
    `SELECT id, project_id, extension_no, duration_days, effective_date FROM contract_extension WHERE id = $1`, [eid]);
  if (!oldRows[0]) return ERR.notFound('تمدید یافت نشد');

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const col of ['extension_no', 'duration_days', 'effective_date'] as const) {
    if (parsed.data[col] !== undefined) { params.push(parsed.data[col]); sets.push(`${col} = $${params.length}`); }
  }
  if (!sets.length) return ERR.badRequest('تغییری ارسال نشده است');
  params.push(eid);

  try {
    await query(`UPDATE contract_extension SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  } catch (e) {
    const msg = dbErrorMessage(e);
    if (msg) return jerr(409, msg);
    return ERR.server(e);
  }
  await writeAudit({
    userId: g.user.uid, username: g.user.username, action: 'UPDATE',
    tableName: 'contract_extension', rowId: eid, oldData: oldRows[0], newData: parsed.data, ip: clientIp(req),
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
  const eid = Number(id);
  if (!Number.isInteger(eid)) return ERR.badRequest('شناسه تمدید نامعتبر است');

  const oldRows = await query(`SELECT id, project_id, extension_no, duration_days, effective_date FROM contract_extension WHERE id = $1`, [eid]);
  if (!oldRows[0]) return ERR.notFound('تمدید یافت نشد');
  await query(`DELETE FROM contract_extension WHERE id = $1`, [eid]);
  await writeAudit({
    userId: g.user.uid, username: g.user.username, action: 'DELETE',
    tableName: 'contract_extension', rowId: eid, oldData: oldRows[0], ip: clientIp(req),
  });
  return Response.json({ ok: true });
}
