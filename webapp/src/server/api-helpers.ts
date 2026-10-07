import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

export function okJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function jerr(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export const ERR = {
  auth: () => jerr(401, 'برای انجام این عملیات باید وارد شوید'),
  passwordChange: () => jerr(403, 'PASSWORD_CHANGE_REQUIRED'),
  forbidden: () => jerr(403, 'دسترسی لازم برای این عملیات را ندارید'),
  badRequest: (msg = 'درخواست نامعتبر است') => jerr(400, msg),
  notFound: (msg = 'رکورد مورد نظر یافت نشد') => jerr(404, msg),
  server: (e: unknown) => {
    console.error('[api]', e);
    return jerr(500, 'خطای غیرمنتظره سرور');
  },
};

export function zodFirstError(e: ZodError): string {
  return e.issues[0]?.message || 'داده‌های ارسالی نامعتبر است';
}

/** CSRF defense-in-depth on top of SameSite=Lax cookies. */
export function csrfOk(req: NextRequest): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  const host = req.headers.get('host');
  if (!host) return false;
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const referer = req.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }
  return false;
}

/** Map known Postgres errors to Persian messages. */
export function dbErrorMessage(e: unknown): string | null {
  const err = e as { code?: string; constraint?: string; detail?: string };
  if (err?.code === '23505') {
    if (err.constraint?.includes('project_snapshot_project_id_report_date')) {
      return 'برای این پروژه در این تاریخ قبلاً گزارش ثبت شده است';
    }
    if (err.constraint?.includes('dim_project_name')) return 'پروژه‌ای با این نام از قبل وجود دارد';
    if (err.constraint?.includes('app_user_username')) return 'کاربری با این نام کاربری وجود دارد';
    if (err.constraint?.includes('dim_contractor_category_title')) return 'دسته‌ای با این عنوان از قبل وجود دارد';
    if (err.constraint?.includes('contract_revision')) return 'این شماره اصلاحیه برای این پروژه قبلاً ثبت شده است';
    if (err.constraint?.includes('contract_extension')) return 'این شماره تمدید برای این پروژه قبلاً ثبت شده است';
    return 'رکورد تکراری است';
  }
  return null;
}
