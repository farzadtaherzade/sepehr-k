import { NextRequest } from 'next/server';
import { query } from '@/server/db';
import { extensionSchema } from '@/server/validators';
import { csrfOk, dbErrorMessage, ERR, jerr, zodFirstError } from '@/server/api-helpers';
import { guard } from '@/server/auth/guard';
import { writeAudit } from '@/server/audit';
import { clientIp } from '@/server/auth/rate-limit';
import { listExtensions } from '@/server/queries';

export async function GET(req: NextRequest) {
  const g = await guard(req, 'viewer');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }
  const pid = Number(req.nextUrl.searchParams.get('projectId'));
  return Response.json({ extensions: await listExtensions(Number.isInteger(pid) && pid > 0 ? pid : undefined) });
}

export async function POST(req: NextRequest) {
  if (!csrfOk(req)) return jerr(403, 'درخواست نامعتبر است');
  const g = await guard(req, 'editor');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }

  const body = await req.json().catch(() => null);
  const parsed = extensionSchema.safeParse(body);
  if (!parsed.success) return jerr(400, zodFirstError(parsed.error));
  const d = parsed.data;

  try {
    const rows = await query<{ id: number }>(
      `INSERT INTO contract_extension (project_id, extension_no, duration_days, effective_date)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [d.project_id, d.extension_no, d.duration_days, d.effective_date]
    );
    await writeAudit({
      userId: g.user.uid, username: g.user.username, action: 'INSERT',
      tableName: 'contract_extension', rowId: rows[0].id, newData: d, ip: clientIp(req),
    });
    return Response.json({ id: rows[0].id }, { status: 201 });
  } catch (e) {
    const msg = dbErrorMessage(e);
    if (msg) return jerr(409, msg);
    return ERR.server(e);
  }
}
