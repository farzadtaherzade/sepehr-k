import { NextRequest } from 'next/server';
import { query } from '@/server/db';
import { projectUpdateSchema } from '@/server/validators';
import { csrfOk, dbErrorMessage, ERR, jerr, zodFirstError } from '@/server/api-helpers';
import { guard } from '@/server/auth/guard';
import { writeAudit } from '@/server/audit';
import { clientIp } from '@/server/auth/rate-limit';
import { getProjectDetail } from '@/server/queries';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/projects/[id] — everything related to the project. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const g = await guard(req, 'viewer');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }
  const { id } = await ctx.params;
  const pid = Number(id);
  if (!Number.isInteger(pid)) return ERR.badRequest('شناسه پروژه نامعتبر است');
  const detail = await getProjectDetail(pid);
  if (!detail) return ERR.notFound('پروژه یافت نشد');
  return Response.json(detail);
}

/** PATCH /api/projects/[id] — rename / change start date (editor+). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!csrfOk(req)) return jerr(403, 'درخواست نامعتبر است');
  const g = await guard(req, 'editor');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }
  const { id } = await ctx.params;
  const pid = Number(id);
  if (!Number.isInteger(pid)) return ERR.badRequest('شناسه پروژه نامعتبر است');

  const body = await req.json().catch(() => null);
  const parsed = projectUpdateSchema.safeParse(body);
  if (!parsed.success) return jerr(400, zodFirstError(parsed.error));

  const old = await query(`SELECT id, name, contract_start_date FROM dim_project WHERE id = $1`, [pid]);
  if (!old[0]) return ERR.notFound('پروژه یافت نشد');

  const sets: string[] = [];
  const params: unknown[] = [];
  if (parsed.data.name !== undefined) { params.push(parsed.data.name); sets.push(`name = $${params.length}`); }
  if (parsed.data.contract_start_date !== undefined) { params.push(parsed.data.contract_start_date); sets.push(`contract_start_date = $${params.length}`); }
  if (!sets.length) return ERR.badRequest('تغییری ارسال نشده است');
  params.push(pid);

  try {
    await query(
      `UPDATE dim_project SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${params.length}`,
      params
    );
  } catch (e) {
    const msg = dbErrorMessage(e);
    if (msg) return jerr(409, msg);
    return ERR.server(e);
  }
  await writeAudit({
    userId: g.user.uid, username: g.user.username, action: 'UPDATE',
    tableName: 'dim_project', rowId: pid, oldData: old[0], newData: parsed.data, ip: clientIp(req),
  });
  return Response.json({ ok: true });
}

/** DELETE /api/projects/[id] — admin only; cascades to all related rows. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  if (!csrfOk(req)) return jerr(403, 'درخواست نامعتبر است');
  const g = await guard(req, 'admin');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }
  const { id } = await ctx.params;
  const pid = Number(id);
  if (!Number.isInteger(pid)) return ERR.badRequest('شناسه پروژه نامعتبر است');

  const old = await query(`SELECT id, name, contract_start_date FROM dim_project WHERE id = $1`, [pid]);
  if (!old[0]) return ERR.notFound('پروژه یافت نشد');

  await query(`DELETE FROM dim_project WHERE id = $1`, [pid]);
  await writeAudit({
    userId: g.user.uid, username: g.user.username, action: 'DELETE',
    tableName: 'dim_project', rowId: pid, oldData: old[0], ip: clientIp(req),
  });
  return Response.json({ ok: true });
}
