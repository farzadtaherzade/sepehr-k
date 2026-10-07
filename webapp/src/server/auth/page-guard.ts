import { cookies } from 'next/headers';
import { query } from '../db';
import { SESSION_COOKIE, verifySessionToken } from './session';
import type { Role } from '@/lib/types';

export interface PageUser {
  uid: number;
  username: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
}

/** Server-component counterpart of the API guard. */
export async function getServerUser(): Promise<PageUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  const rows = await query<{ id: number; username: string; full_name: string | null; role: Role; is_active: boolean; must_change_password: boolean }>(
    'SELECT id, username, full_name, role, is_active, must_change_password FROM app_user WHERE id = $1',
    [payload.uid]
  );
  const u = rows[0];
  if (!u || !u.is_active) return null;
  return { uid: u.id, username: u.username, name: u.full_name || u.username, role: u.role, mustChangePassword: u.must_change_password };
}
