import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { query } from '@/server/db';
import { userCreateSchema } from '@/server/validators';
import { csrfOk, dbErrorMessage, ERR, jerr, zodFirstError } from '@/server/api-helpers';
import { guard } from '@/server/auth/guard';
import { writeAudit } from '@/server/audit';
import { clientIp } from '@/server/auth/rate-limit';
import { listUsers } from '@/server/queries';

/** GET /api/users — list app users (admin). */
export async function GET(req: NextRequest) {
  const g = await guard(req, 'admin');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }
  return Response.json({ users: await listUsers() });
}

/** POST /api/users — create a user with a forced password change (admin). */
export async function POST(req: NextRequest) {
  if (!csrfOk(req)) return jerr(403, 'درخواست نامعتبر است');
  const g = await guard(req, 'admin');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }

  const body = await req.json().catch(() => null);
  const parsed = userCreateSchema.safeParse(body);
  if (!parsed.success) return jerr(400, zodFirstError(parsed.error));
  const d = parsed.data;

  try {
    const hash = await bcrypt.hash(d.password, 12);
    const rows = await query<{ id: number }>(
      `INSERT INTO app_user (username, password_hash, full_name, role, must_change_password)
       VALUES ($1, $2, $3, $4, TRUE) RETURNING id`,
      [d.username, hash, d.full_name || null, d.role]
    );
    await writeAudit({
      userId: g.user.uid, username: g.user.username, action: 'INSERT',
      tableName: 'app_user', rowId: rows[0].id,
      newData: { username: d.username, role: d.role, full_name: d.full_name }, ip: clientIp(req),
    });
    return Response.json({ id: rows[0].id }, { status: 201 });
  } catch (e) {
    const msg = dbErrorMessage(e);
    if (msg) return jerr(409, msg);
    return ERR.server(e);
  }
}
