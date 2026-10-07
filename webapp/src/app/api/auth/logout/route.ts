import { NextRequest } from 'next/server';
import { clearSessionCookie } from '@/server/auth/session';
import { requireUser } from '@/server/auth/guard';
import { writeAudit } from '@/server/audit';
import { clientIp } from '@/server/auth/rate-limit';
import { csrfOk, jerr } from '@/server/api-helpers';

export async function POST(req: NextRequest) {
  if (!csrfOk(req)) return jerr(403, 'درخواست نامعتبر است');
  const user = await requireUser(req);
  if (user) await writeAudit({ userId: user.uid, username: user.username, action: 'LOGOUT', ip: clientIp(req) });
  await clearSessionCookie();
  return Response.json({ ok: true });
}
