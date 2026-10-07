import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { query } from '@/server/db';
import { changePasswordSchema } from '@/server/validators';
import { csrfOk, ERR, jerr, zodFirstError } from '@/server/api-helpers';
import { guard } from '@/server/auth/guard';
import { writeAudit } from '@/server/audit';
import { clientIp } from '@/server/auth/rate-limit';

export async function POST(req: NextRequest) {
  if (!csrfOk(req)) return jerr(403, 'درخواست نامعتبر است');
  const g = await guard(req, 'viewer', { allowDuringPasswordChange: true });
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    return ERR.forbidden();
  }

  const body = await req.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) return jerr(400, zodFirstError(parsed.error));

  const rows = await query<{ password_hash: string }>(
    'SELECT password_hash FROM app_user WHERE id = $1',
    [g.user.uid]
  );
  if (!rows[0]) return ERR.notFound('کاربر یافت نشد');

  const valid = await bcrypt.compare(parsed.data.currentPassword, rows[0].password_hash);
  if (!valid) return jerr(400, 'رمز عبور فعلی اشتباه است');
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return jerr(400, 'رمز عبور جدید نباید با رمز فعلی یکسان باشد');
  }

  const hash = await bcrypt.hash(parsed.data.newPassword, 12);
  await query(
    `UPDATE app_user SET password_hash = $2, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [g.user.uid, hash]
  );
  await writeAudit({
    userId: g.user.uid,
    username: g.user.username,
    action: 'CHANGE_PASSWORD',
    ip: clientIp(req),
  });
  return Response.json({ ok: true });
}
