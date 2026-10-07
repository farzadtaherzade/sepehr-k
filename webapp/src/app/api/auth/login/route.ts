import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/server/db';
import { loginSchema } from '@/server/validators';
import { zodFirstError, jerr, csrfOk } from '@/server/api-helpers';
import { createSessionToken, setSessionCookie } from '@/server/auth/session';
import { clearFailures, clientIp, isLocked, rateKey, recordFailure } from '@/server/auth/rate-limit';
import { writeAudit } from '@/server/audit';

const HARD_FAIL_LOCK = 10;          // DB-side fails before a DB-level lock
const HARD_LOCK_MINUTES = 15;

export async function POST(req: NextRequest) {
  if (!csrfOk(req)) return jerr(403, 'درخواست نامعتبر است');

  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return jerr(400, zodFirstError(parsed.error));
  const { username, password } = parsed.data;
  const ip = clientIp(req);

  const key = rateKey(req, 'login', username);
  const lock = isLocked(key);
  if (lock.locked) {
    return NextResponse.json(
      { error: `به دلیل تلاش‌های ناموفق، ${Math.ceil(lock.retryAfterSec / 60)} دقیقه قفل شده است. بعداً تلاش کنید` },
      { status: 429 }
    );
  }

  const rows = await query<{
    id: number; username: string; password_hash: string; full_name: string | null;
    role: 'admin' | 'editor' | 'viewer'; is_active: boolean;
    failed_attempts: number; locked_until: string | null; must_change_password: boolean;
  }>(
    `SELECT id, username, password_hash, full_name, role, is_active, failed_attempts, locked_until, must_change_password
     FROM app_user WHERE username = $1`,
    [username]
  );
  const user = rows[0];

  if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
    const secs = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 1000);
    return NextResponse.json(
      { error: `حساب تا ${Math.ceil(secs / 60)} دقیقه دیگر قفل است` },
      { status: 429 }
    );
  }

  const valid = user ? await bcrypt.compare(password, user.password_hash) : false;

  if (!user || !valid || !user.is_active) {
    recordFailure(key);
    if (user && !valid) {
      const fails = user.failed_attempts + 1;
      const lockUntil =
        fails >= HARD_FAIL_LOCK
          ? new Date(Date.now() + HARD_LOCK_MINUTES * 60_000)
          : null;
      await query(
        `UPDATE app_user SET failed_attempts = $2, locked_until = $3 WHERE id = $1`,
        [user.id, fails, lockUntil]
      );
    }
    await writeAudit({ username, action: 'LOGIN_FAILED', ip });
    return NextResponse.json({ error: 'نام کاربری یا رمز عبور اشتباه است' }, { status: 401 });
  }

  clearFailures(key);
  await query(
    `UPDATE app_user SET failed_attempts = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [user.id]
  );
  const token = await createSessionToken({
    uid: user.id,
    username: user.username,
    name: user.full_name || user.username,
    role: user.role,
  });
  await setSessionCookie(token);
  await writeAudit({ userId: user.id, username: user.username, action: 'LOGIN', ip });
  return NextResponse.json({
    ok: true,
    must_change_password: user.must_change_password,
    role: user.role,
  });
}
