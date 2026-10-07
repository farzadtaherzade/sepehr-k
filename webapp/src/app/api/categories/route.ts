import { NextRequest } from 'next/server';
import { query } from '@/server/db';
import { categorySchema } from '@/server/validators';
import { csrfOk, dbErrorMessage, ERR, jerr, zodFirstError } from '@/server/api-helpers';
import { guard } from '@/server/auth/guard';
import { writeAudit } from '@/server/audit';
import { clientIp } from '@/server/auth/rate-limit';
import { listCategories } from '@/server/queries';

export async function GET(req: NextRequest) {
  const g = await guard(req, 'viewer');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }
  return Response.json({ categories: await listCategories() });
}

/** POST /api/categories — add a contractor trade category (admin). */
export async function POST(req: NextRequest) {
  if (!csrfOk(req)) return jerr(403, 'درخواست نامعتبر است');
  const g = await guard(req, 'admin');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }

  const body = await req.json().catch(() => null);
  const parsed = categorySchema.safeParse(body);
  if (!parsed.success) return jerr(400, zodFirstError(parsed.error));
  const d = parsed.data;

  try {
    const rows = await query<{ id: number }>(
      `INSERT INTO dim_contractor_category (title, title_fa, display_order, aliases)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [d.title, d.title_fa || null, d.display_order ?? 0, d.aliases ?? []]
    );
    await writeAudit({
      userId: g.user.uid, username: g.user.username, action: 'INSERT',
      tableName: 'dim_contractor_category', rowId: rows[0].id, newData: d, ip: clientIp(req),
    });
    return Response.json({ id: rows[0].id }, { status: 201 });
  } catch (e) {
    const msg = dbErrorMessage(e);
    if (msg) return jerr(409, msg);
    return ERR.server(e);
  }
}
