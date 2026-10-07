import { NextRequest } from 'next/server';
import { requireUser } from '@/server/auth/guard';
import { ERR } from '@/server/api-helpers';

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return ERR.auth();
  return Response.json({
    username: user.username,
    name: user.name,
    role: user.role,
    must_change_password: user.mustChangePassword,
  });
}
