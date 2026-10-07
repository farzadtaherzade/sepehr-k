'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Select, Field, inputCls } from '@/components/ui';
import { JalaliDatePicker } from '@/components/jalali/JalaliDatePicker';
import { fmtRatio, parseNumInput } from '@/lib/format';
import { formatJalali } from '@/lib/jalali';
import type { Project, Snapshot } from '@/lib/types';

type Kind = 'pct' | 'money' | 'ratio' | 'int' | 'num';

interface FieldSpec { key: keyof Snapshot; label: string; kind: Kind }

const SECTIONS: { title: string; fields: FieldSpec[] }[] = [
  {
    title: 'پیشرفت و زمان',
    fields: [
      { key: 'progress_physical_actual', label: 'پیشرفت فیزیکی واقعی (٪)', kind: 'pct' },
      { key: 'progress_physical_planned', label: 'پیشرفت فیزیکی برنامه (٪)', kind: 'pct' },
      { key: 'progress_rial_actual', label: 'پیشرفت ریالی واقعی (٪)', kind: 'pct' },
      { key: 'progress_rial_planned', label: 'پیشرفت ریالی برنامه (٪)', kind: 'pct' },
      { key: 'time_elapsed_days', label: 'روزهای سپری‌شده از پیمان', kind: 'int' },
      { key: 'time_progress_pct', label: 'درصد پیشرفت زمان (٪)', kind: 'pct' },
    ],
  },
  {
    title: 'مالی (ریال)',
    fields: [
      { key: 'gross_payment', label: 'پرداخت ناخالص', kind: 'money' },
      { key: 'net_payment', label: 'پرداخت خالص', kind: 'money' },
      { key: 'actual_cost', label: 'هزینه واقعی (AC)', kind: 'money' },
      { key: 'overhead_cost', label: 'هزینه بالاسری', kind: 'money' },
      { key: 'equipment_cost', label: 'هزینه تجهیزات', kind: 'money' },
      { key: 'commitments', label: 'تعهدات', kind: 'money' },
      { key: 'revenue', label: 'درآمد', kind: 'money' },
      { key: 'production', label: 'تولید', kind: 'money' },
      { key: 'last_progress_statement', label: 'آخرین صورت‌وضعیت کارکرد', kind: 'money' },
      { key: 'last_adjustment_statement', label: 'آخرین صورت‌وضعیت تعدیل', kind: 'money' },
    ],
  },
  {
    title: 'شاخص‌های ارزش‌گذاری',
    fields: [
      { key: 'pv', label: 'ارزش برنامه‌ای (PV)', kind: 'money' },
      { key: 'ev', label: 'ارزش کسب‌شده (EV)', kind: 'money' },
      { key: 'revenue_to_cost_ratio', label: 'نسبت درآمد به هزینه', kind: 'ratio' },
      { key: 'overhead_to_production_ratio', label: 'نسبت بالاسری به تولید', kind: 'ratio' },
      { key: 'equipment_to_production_ratio', label: 'نسبت تجهیزات به تولید', kind: 'ratio' },
      { key: 'commitments_to_production_ratio', label: 'نسبت تعهدات به تولید', kind: 'ratio' },
      { key: 'collection_rate', label: 'درصد وصول مطالبات (٪)', kind: 'pct' },
      { key: 'avg_monthly_headcount', label: 'متوسط نیروی انسانی ماهانه (نفر)', kind: 'num' },
    ],
  },
];

const PCT_KEYS = new Set<string>(SECTIONS.flatMap((s) => s.fields.filter((f) => f.kind === 'pct').map((f) => f.key as string)));

function toFormValues(snap?: Snapshot | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of SECTIONS) {
    for (const f of s.fields) {
      const raw = snap?.[f.key];
      const n = raw == null || raw === '' ? null : Number(raw);
      out[f.key as string] = n == null ? '' : f.kind === 'pct' ? String(Math.round(n * 100 * 100) / 100) : String(n);
    }
  }
  return out;
}

/** Body ready for POST/PATCH: percent inputs converted back to fractions. */
function toPayload(vals: Record<string, string>): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const key of Object.keys(vals)) {
    const n = parseNumInput(vals[key]);
    out[key] = n == null ? null : PCT_KEYS.has(key) ? Math.round(n / 100 * 10000) / 10000 : n;
  }
  return out;
}

export function SnapshotForm({
  projects,
  initial,
  onSubmit,
  busy,
  submitLabel = 'ذخیره گزارش',
}: {
  projects: Pick<Project, 'id' | 'name'>[];
  initial?: Snapshot | null;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
  busy: boolean;
  submitLabel?: string;
}) {
  const [projectId, setProjectId] = useState<number | ''>(initial?.project_id ?? '');
  const [reportDate, setReportDate] = useState<string | null>(initial?.report_date ?? null);
  const [revisionNo, setRevisionNo] = useState<string>(initial?.revision_no != null ? String(initial.revision_no) : '0');
  const [vals, setVals] = useState<Record<string, string>>(() => toFormValues(initial));
  const [error, setError] = useState<string | null>(null);

  const spiPreview = useMemo(() => {
    const ev = parseNumInput(vals.ev);
    const pv = parseNumInput(vals.pv);
    return ev != null && pv ? ev / pv : null;
  }, [vals.ev, vals.pv]);

  function set(key: string, v: string) {
    setVals((prev) => ({ ...prev, [key]: v }));
  }

  async function handle(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!projectId) { setError('انتخاب پروژه الزامی است'); return; }
    if (!reportDate) { setError('انتخاب تاریخ گزارش الزامی است'); return; }
    const body: Record<string, unknown> = {
      ...toPayload(vals),
      project_id: projectId,
      report_date: reportDate,
      revision_no: revisionNo === '' ? null : Number(revisionNo),
    };
    await onSubmit(body).catch((msg) => setError(String(msg)));
  }

  return (
    <form onSubmit={handle} className="space-y-5">
      {/* پایه */}
      <fieldset className="rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-xs font-bold text-blue-800">اطلاعات پایه</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="پروژه">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : '')} disabled={!!initial}>
              <option value="">— انتخاب پروژه —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="تاریخ گزارش (شمسی)">
            <JalaliDatePicker value={reportDate} onChange={setReportDate} />
          </Field>
          <Field label="ریوژن پایه گزارش">
            <input type="number" min={0} value={revisionNo} onChange={(e) => setRevisionNo(e.target.value)} className={inputCls} />
          </Field>
        </div>
        {reportDate && (
          <p className="mt-2 text-[11px] text-slate-400">
            معادل میلادی ذخیره می‌شود؛ نمایش شمسی: {formatJalali(reportDate, { long: true })}
          </p>
        )}
      </fieldset>

      {SECTIONS.map((sec) => (
        <fieldset key={sec.title} className="rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-xs font-bold text-blue-800">{sec.title}</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {sec.fields.map((f) => (
              <Field key={f.key as string} label={f.label}>
                <input
                  dir="ltr"
                  value={vals[f.key as string] ?? ''}
                  onChange={(e) => set(f.key as string, e.target.value)}
                  className={inputCls}
                  placeholder="—"
                  inputMode="decimal"
                />
              </Field>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="rounded-lg bg-slate-50 px-4 py-2 text-xs text-slate-500">
        اگر PV و EV را وارد کنید، شاخص‌های SPI و CPI به‌صورت خودکار محاسبه و ذخیره می‌شوند.
        {spiPreview != null && <> پیش‌نمایش SPI: <span className="font-bold text-blue-800">{fmtRatio(spiPreview)}</span></>}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex justify-start">
        <button
          type="submit"
          disabled={busy}
          className="h-10 rounded-lg bg-blue-700 px-6 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
