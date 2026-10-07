import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { SessionUser } from '@/lib/types';

export const SESSION_COOKIE = 'evm_session';
export const SESSION_TTL_HOURS = 8;

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    // Refuse to run with a weak signing key in production
    throw new Error('AUTH_SECRET must be set to at least 32 characters');
  }
  return new TextEncoder().encode(s);
}

export async function createSessionToken(u: SessionUser): Promise<string> {
  return new SignJWT({ uid: u.uid, username: u.username, name: u.name, role: u.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(`${SESSION_TTL_HOURS}h`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.uid !== 'number' || typeof payload.username !== 'string') return null;
    return {
      uid: payload.uid,
      username: payload.username,
      name: typeof payload.name === 'string' ? payload.name : payload.username,
      role: (payload.role as SessionUser['role']) || 'viewer',
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Only enable when the app is actually served over HTTPS (COOKIE_SECURE=true)
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: SESSION_TTL_HOURS * 3600,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
