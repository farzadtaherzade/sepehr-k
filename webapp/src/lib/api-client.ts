'use client';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T = unknown>(
  path: string,
  opts?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown }
): Promise<T> {
  const res = await fetch(path, {
    method: opts?.method ?? 'GET',
    headers: opts?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    throw new ApiError(res.status, String(data.error || 'خطای غیرمنتظره'), String(data.error || ''));
  }
  return data as T;
}
