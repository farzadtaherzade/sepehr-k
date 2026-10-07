import { NextRequest } from 'next/server';
import { query } from '@/server/db';
import { categorySchema } from '@/server/validators';
import { csrfOk, dbErrorMessage, ERR, jerr, zodFirstError } from '@/server/api-helpers';
import { guard } from '@/server/auth/guard';
import { writeAudit } from '@/server/audit';
import { clientIp } from '@/server/auth/rate-limit';

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/categories/[id] — rename / reorder a category (admin). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!csrfOk(req)) return jerr(403, 'درخواست نامعتبر است');
  const g = await guard(req, 'admin');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }
  const { id } = await ctx.params;
  const cid = Number(id);
  if (!Number.isInteger(cid)) return ERR.badRequest('شناسه دسته نامعتبر است');

  const body = await req.json().catch(() => null);
  const parsed = categorySchema.partial().safeParse(body);
  if (!parsed.success) return jerr(400, zodFirstError(parsed.error));

  const oldRows = await query(
    `SELECT id, title, title_fa, display_order, aliases FROM dim_contractor_category WHERE id = $1`, [cid]);
  if (!oldRows[0]) return ERR.notFound('دسته یافت نشد');

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const col of ['title', 'title_fa', 'display_order', 'aliases'] as const) {
    if (parsed.data[col] !== undefined) { params.push(parsed.data[col]); sets.push(`${col} = $${params.length}`); }
  }
  if (!sets.length) return ERR.badRequest('تغییری ارسال نشده است');
  params.push(cid);

  try {
    await query(`UPDATE dim_contractor_category SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  } catch (e) {
    const msg = dbErrorMessage(e);
    if (msg) return jerr(409, msg);
    return ERR.server(e);
  }
  await writeAudit({
    userId: g.user.uid, username: g.user.username, action: 'UPDATE',
    tableName: 'dim_contractor_category', rowId: cid, oldData: oldRows[0], newData: parsed.data, ip: clientIp(req),
  });
  return Response.json({ ok: true });
}
