import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { query } from '@/server/db';
import { userUpdateSchema } from '@/server/validators';
import { csrfOk, dbErrorMessage, ERR, jerr, zodFirstError } from '@/server/api-helpers';
import { guard } from '@/server/auth/guard';
import { writeAudit } from '@/server/audit';
import { clientIp } from '@/server/auth/rate-limit';

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/users/[id] — role / activation / password reset (admin). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!csrfOk(req)) return jerr(403, 'درخواست نامعتبر است');
  const g = await guard(req, 'admin');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }
  const { id } = await ctx.params;
  const uid = Number(id);
  if (!Number.isInteger(uid)) return ERR.badRequest('شناسه کاربر نامعتبر است');

  const body = await req.json().catch(() => null);
  const parsed = userUpdateSchema.safeParse(body);
  if (!parsed.success) return jerr(400, zodFirstError(parsed.error));

  const oldRows = await query(
    `SELECT id, username, full_name, role, is_active, must_change_password FROM app_user WHERE id = $1`, [uid]);
  const old = oldRows[0];
  if (!old) return ERR.notFound('کاربر یافت نشد');

  // An admin cannot lock themselves out (demote own role or deactivate self).
  if (g.user.uid === uid && (parsed.data.role !== undefined || parsed.data.is_active !== undefined)) {
    return jerr(400, 'تغییر نقش یا وضعیت حساب خودتان مجاز نیست');
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  if (parsed.data.role !== undefined) { params.push(parsed.data.role); sets.push(`role = $${params.length}`); }
  if (parsed.data.is_active !== undefined) { params.push(parsed.data.is_active); sets.push(`is_active = $${params.length}`); }
  if (parsed.data.password !== undefined) {
    params.push(await bcrypt.hash(parsed.data.password, 12));
    sets.push(`password_hash = $${params.length}`);
    sets.push(`must_change_password = TRUE`);
    sets.push(`failed_attempts = 0`);
    sets.push(`locked_until = NULL`);
  }
  if (!sets.length) return ERR.badRequest('تغییری ارسال نشده است');
  params.push(uid);

  try {
    await query(`UPDATE app_user SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${params.length}`, params);
  } catch (e) {
    const msg = dbErrorMessage(e);
    if (msg) return jerr(409, msg);
    return ERR.server(e);
  }
  await writeAudit({
    userId: g.user.uid, username: g.user.username, action: 'UPDATE',
    tableName: 'app_user', rowId: uid,
    oldData: { role: old.role, is_active: old.is_active },
    newData: { role: parsed.data.role, is_active: parsed.data.is_active, password_reset: !!parsed.data.password },
    ip: clientIp(req),
  });
  return Response.json({ ok: true });
}
