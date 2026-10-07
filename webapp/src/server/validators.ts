import { z } from 'zod';
import { faToEn } from '@/lib/digits';

/** Numeric input that accepts Persian/Latin digits and separators. */
function numeric(maxAbs: number, maxDecimals = 4) {
  return z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined || v === '') return null;
      let s = faToEn(String(v)).trim();
      if (!s) return null;
      s = s.replace(/[٬,\s]/g, '').replace('٫', '.');
      return s;
    })
    .refine((s): s is string | null => s === null || /^-?\d+(\.\d+)?$/.test(s), {
      message: 'عدد نامعتبر است',
    })
    .transform((s) => (s === null ? null : Number(s)))
    .refine((n) => n === null || Math.abs(n) <= maxAbs, { message: 'مقدار خارج از محدوده مجاز است' })
    .refine(
      (n) => {
        if (n === null) return true;
        const s = String(n);
        const dot = s.indexOf('.');
        return dot === -1 || s.length - dot - 1 <= maxDecimals + 2;
      },
      { message: 'تعداد رقم اعشار بیش از حد مجاز است' }
    );
}

function integer(min: number, max: number) {
  return z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined || v === '') return null;
      const s = faToEn(String(v)).trim();
      return s === '' ? null : s;
    })
    .refine((s): s is string => s === null || /^-?\d+$/.test(s), { message: 'عدد صحیح نامعتبر است' })
    .transform((s) => (s === null ? null : Number(s)))
    .refine((n) => n === null || (n >= min && n <= max), { message: `مقدار باید بین ${min} و ${max} باشد` });
}

function dateField(required = false) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const s = v == null ? '' : faToEn(String(v)).trim();
      return s === '' ? null : s;
    })
    .refine((s) => !required || s !== null, { message: 'تاریخ الزامی است' })
    .refine((s) => s === null || /^\d{4}-\d{2}-\d{2}$/.test(s), { message: 'تاریخ باید به قالب میلادی YYYY-MM-DD باشد' })
    .refine((s) => s === null || !Number.isNaN(Date.parse(s)), { message: 'تاریخ نامعتبر است' });
}

export const requiredInt = z.union([z.number(), z.string()])
  .transform((v) => Number(faToEn(String(v))))
  .refine((n) => Number.isInteger(n), { message: 'شناسه نامعتبر است' });

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'نام کاربری الزامی است').max(64),
  password: z.string().min(1, 'رمز عبور الزامی است').max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'رمز عبور فعلی الزامی است').max(128),
  newPassword: z.string().min(8, 'رمز عبور جدید باید حداقل ۸ نویسه باشد').max(128),
});

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1, 'نام پروژه الزامی است').max(200, 'نام پروژه طولانی است'),
  contract_start_date: dateField(false),
});

export const projectUpdateSchema = projectCreateSchema.partial();

export const revisionSchema = z.object({
  project_id: requiredInt,
  revision_no: integer(0, 32767).refine((n) => n !== null, { message: 'شماره اصلاحیه الزامی است' }) as z.ZodType<number | null>,
  amount: numeric(1e15, 2),
  duration_days: integer(0, 36500),
  effective_date: dateField(false),
});

export const extensionSchema = z.object({
  project_id: requiredInt,
  extension_no: integer(0, 32767).refine((n) => n !== null, { message: 'شماره تمدید الزامی است' }) as z.ZodType<number | null>,
  duration_days: integer(0, 36500),
  effective_date: dateField(false),
});

export const snapshotSchema = z.object({
  project_id: requiredInt,
  report_date: dateField(true),
  revision_no: integer(0, 32767),
  progress_physical_actual: numeric(1e6, 4),
  progress_physical_planned: numeric(1e6, 4),
  progress_rial_actual: numeric(1e6, 4),
  progress_rial_planned: numeric(1e6, 4),
  time_elapsed_days: integer(0, 36500),
  time_progress_pct: numeric(1e6, 4),
  gross_payment: numeric(1e15, 2),
  net_payment: numeric(1e15, 2),
  actual_cost: numeric(1e15, 2),
  overhead_cost: numeric(1e15, 2),
  equipment_cost: numeric(1e15, 2),
  commitments: numeric(1e15, 2),
  revenue: numeric(1e15, 2),
  production: numeric(1e15, 2),
  pv: numeric(1e15, 2),
  ev: numeric(1e15, 2),
  spi: numeric(1000, 4),
  cpi: numeric(1000, 4),
  last_progress_statement: numeric(1e15, 2),
  last_adjustment_statement: numeric(1e15, 2),
  revenue_to_cost_ratio: numeric(1e6, 4),
  overhead_to_production_ratio: numeric(1e6, 4),
  equipment_to_production_ratio: numeric(1e6, 4),
  commitments_to_production_ratio: numeric(1e6, 4),
  collection_rate: numeric(1e6, 4),
  avg_monthly_headcount: numeric(1e7, 2),
});

export const snapshotUpdateSchema = snapshotSchema.partial().extend({
  /** optimistic locking */
  updated_at: z.string().optional(),
});

export const headcountSchema = z.object({
  snapshot_id: requiredInt,
  contractor_category_id: requiredInt,
  headcount: numeric(1e7, 2).refine((n) => n === null || n >= 0, { message: 'نیروی انسانی نمی‌تواند منفی باشد' }),
});

export const revisionProgressSchema = z.object({
  snapshot_id: requiredInt,
  revision_no: integer(0, 32767).refine((n) => n !== null, { message: 'شماره ریوژن الزامی است' }) as z.ZodType<number | null>,
  progress_physical_actual: numeric(1e6, 4),
  progress_physical_planned: numeric(1e6, 4),
  progress_rial_actual: numeric(1e6, 4),
  progress_rial_planned: numeric(1e6, 4),
  ev: numeric(1e15, 2),
  pv: numeric(1e15, 2),
});

export const categorySchema = z.object({
  title: z.string().trim().min(1, 'عنوان لاتین الزامی است').max(80).regex(/^[a-z0-9_]+$/, 'عنوان لاتین فقط حروف کوچک، عدد و _ '),
  title_fa: z.string().trim().max(120).optional().nullable(),
  display_order: integer(0, 10000),
  aliases: z.union([z.array(z.string().trim().min(1).max(120)), z.null()]).optional(),
});

export const userCreateSchema = z.object({
  username: z.string().trim().min(3, 'نام کاربری حداقل ۳ نویسه').max(32)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'نام کاربری فقط حروف انگلیسی، عدد، نقطه، خط تیره و زیرخط'),
  password: z.string().min(8, 'رمز عبور حداقل ۸ نویسه').max(128),
  full_name: z.string().trim().max(120).optional().nullable(),
  role: z.enum(['admin', 'editor', 'viewer']),
});

export const userUpdateSchema = z.object({
  role: z.enum(['admin', 'editor', 'viewer']).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(8, 'رمز عبور حداقل ۸ نویسه').max(128).optional(),
});
