import { NextRequest } from 'next/server';
import { query } from '../db';
import { SESSION_COOKIE, verifySessionToken } from './session';
import type { Role, SessionUser } from '@/lib/types';

const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };

export interface AuthedUser extends SessionUser {
  mustChangePassword: boolean;
}

/** Verify the JWT cookie AND that the account still exists and is active. */
export async function requireUser(req: NextRequest): Promise<AuthedUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  const rows = await query<{
    id: number; username: string; full_name: string | null; role: Role;
    is_active: boolean; must_change_password: boolean;
  }>(
    'SELECT id, username, full_name, role, is_active, must_change_password FROM app_user WHERE id = $1',
    [payload.uid]
  );
  const u = rows[0];
  if (!u || !u.is_active) return null;
  return {
    uid: u.id,
    username: u.username,
    name: u.full_name || u.username,
    role: u.role,
    mustChangePassword: u.must_change_password,
  };
}

/** Full API guard: auth + role + force-change-password gate. */
export async function guard(
  req: NextRequest,
  minRole: Role = 'viewer',
  opts: { allowDuringPasswordChange?: boolean } = {}
): Promise<{ user: AuthedUser } | { error: 'AUTH' } | { error: 'PASSWORD_CHANGE' } | { error: 'FORBIDDEN' }> {
  const user = await requireUser(req);
  if (!user) return { error: 'AUTH' };
  if (user.mustChangePassword && !opts.allowDuringPasswordChange) return { error: 'PASSWORD_CHANGE' };
  if (ROLE_RANK[user.role] < ROLE_RANK[minRole]) return { error: 'FORBIDDEN' };
  return { user };
}

export function canEdit(role: Role): boolean {
  return role === 'admin' || role === 'editor';
}
