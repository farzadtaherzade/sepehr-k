import { NextRequest } from 'next/server';

interface Entry {
  fails: number;
  windowStart: number;
  lockedUntil: number;
}

const MAX_FAILS = 5;
const WINDOW_MS = 10 * 60 * 1000;       // 10 min rolling window
const LOCK_BASE_MS = 5 * 60 * 1000;     // 5 min, doubles per extra offense…
const LOCK_MAX_MS = 30 * 60 * 1000;     // …capped at 30 min

const store = new Map<string, Entry>();

function sweep() {
  const now = Date.now();
  for (const [k, e] of store) {
    if (e.lockedUntil < now && now - e.windowStart > WINDOW_MS) store.delete(k);
  }
}

export function rateKey(req: NextRequest, scope: string, username: string): string {
  return `${scope}:${clientIp(req)}:${username.toLowerCase()}`;
}

export function isLocked(key: string): { locked: boolean; retryAfterSec: number } {
  const e = store.get(key);
  if (!e) return { locked: false, retryAfterSec: 0 };
  const now = Date.now();
  if (e.lockedUntil > now) {
    return { locked: true, retryAfterSec: Math.ceil((e.lockedUntil - now) / 1000) };
  }
  return { locked: false, retryAfterSec: 0 };
}

export function recordFailure(key: string): void {
  sweep();
  const now = Date.now();
  let e = store.get(key);
  if (!e || now - e.windowStart > WINDOW_MS) {
    e = { fails: 0, windowStart: now, lockedUntil: 0 };
    store.set(key, e);
  }
  e.fails += 1;
  if (e.fails >= MAX_FAILS) {
    const offense = Math.min(e.fails - MAX_FAILS, 3); // 0..3 → 5,10,20,30 min
    e.lockedUntil = now + Math.min(LOCK_BASE_MS * 2 ** offense, LOCK_MAX_MS);
    e.windowStart = now;
  }
}

export function clearFailures(key: string): void {
  store.delete(key);
}

export function clientIp(req: NextRequest): string {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'local';
}
