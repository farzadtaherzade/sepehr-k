import { NextRequest } from 'next/server';
import { csrfOk, ERR, jerr } from '@/server/api-helpers';
import { guard } from '@/server/auth/guard';
import { listAudit } from '@/server/queries';

/** GET /api/audit?limit=500 — audit trail (admin). */
export async function GET(req: NextRequest) {
  if (!csrfOk(req)) return jerr(403, 'درخواست نامعتبر است');
  const g = await guard(req, 'admin');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }
  const limit = Number(req.nextUrl.searchParams.get('limit')) || 500;
  return Response.json({ audit: await listAudit(limit) });
}
