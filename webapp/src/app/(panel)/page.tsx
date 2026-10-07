import Link from 'next/link';
import { dashboardData } from '@/server/queries';
import { Badge } from '@/components/ui';
import { healthStatusFa } from '@/lib/types';
import { formatJalali } from '@/lib/jalali';
import { fmtMoneyCompact, fmtRatio } from '@/lib/format';

export const dynamic = 'force-dynamic';

const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export default async function DashboardPage() {
  const { alerts, status, latest, counts } = await dashboardData();

  const countsFa = [
    {
      label: 'پروژه فعال',
      value: counts.projects,
      icon: (
        <svg {...iconProps}>
          <rect width="16" height="20" x="4" y="2" rx="2" />
          <path d="M9 22v-4h6v4" />
          <path d="M8 6h.01" />
          <path d="M16 6h.01" />
          <path d="M12 6h.01" />
          <path d="M8 10h.01" />
          <path d="M12 10h.01" />
          <path d="M16 10h.01" />
          <path d="M8 14h.01" />
          <path d="M12 14h.01" />
          <path d="M16 14h.01" />
        </svg>
      ),
    },
    {
      label: 'دوره‌های ثبت‌شده',
      value: counts.total_periods,
      icon: (
        <svg {...iconProps}>
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <rect width="18" height="18" x="3" y="4" rx="2" />
          <path d="M3 10h18" />
        </svg>
      ),
    },
    {
      label: 'دوره‌های دارای گزارش واقعی',
      value: counts.reported_periods,
      icon: (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      ),
    },
    {
      label: 'دسته‌های پیمانکار',
      value: counts.categories,
      icon: (
        <svg {...iconProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-5">
        <h1 className="text-xl font-extrabold text-slate-900">داشبورد</h1>
        <p className="mt-0.5 text-sm text-slate-500">وضعیت کلی پروژه‌ها بر اساس آخرین گزارش واقعی هر پروژه</p>
      </div>

      {/* stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {countsFa.map((c) => (
          <div key={c.label} className="evm-card flex items-center gap-3 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              {c.icon}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-slate-500">{c.label}</div>
              <div className="mt-1 text-[26px] font-extrabold leading-8 text-slate-900 tabular-nums">{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* project health cards */}
      <h2 className="mb-3 text-[15px] font-bold text-slate-800">وضعیت سلامت پروژه‌ها</h2>
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {alerts.map((a) => {
          const h = healthStatusFa(a.health_status);
          return (
            <Link
              key={a.project_id}
              href={`/projects/${a.project_id}`}
              className="group evm-card block p-4 transition hover:border-blue-300!"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-800 group-hover:text-blue-800">{a.project_name}</span>
                <Badge tone={h.tone}>{h.label}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-slate-200 py-2">
                  <div className="text-[11px] text-slate-500">CPI</div>
                  <div className={`text-sm font-bold ${Number(a.cpi) < 0.9 ? 'text-red-600' : Number(a.cpi) > 1.05 ? 'text-emerald-600' : 'text-slate-700'}`}>
                    {fmtRatio(a.cpi)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 py-2">
                  <div className="text-[11px] text-slate-500">SPI</div>
                  <div className={`text-sm font-bold ${Number(a.spi) < 0.9 ? 'text-red-600' : Number(a.spi) > 1.05 ? 'text-emerald-600' : 'text-slate-700'}`}>
                    {fmtRatio(a.spi)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 py-2">
                  <div className="text-[11px] text-slate-500">آخرین گزارش</div>
                  <div className="text-sm font-bold text-slate-700">{formatJalali(a.report_date) || '—'}</div>
                </div>
              </div>
            </Link>
          );
        })}
        {alerts.length === 0 && (
          <div className="evm-card col-span-full border-dashed border-slate-300! p-8 text-center text-sm text-slate-400">
            هنوز داده‌ای برای نمایش وجود ندارد
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* latest snapshot table */}
        <div className="evm-card overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-800">آخرین وضعیت هر پروژه</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tabular-nums">
              <thead>
                <tr className="bg-slate-50 text-[11px] text-slate-500">
                  <th className="px-3 py-2 text-right font-medium">پروژه</th>
                  <th className="px-3 py-2 text-right font-medium">تاریخ</th>
                  <th className="px-3 py-2 text-right font-medium">پیشرفت واقعی</th>
                  <th className="px-3 py-2 text-right font-medium">پیشرفت برنامه</th>
                  <th className="px-3 py-2 text-right font-medium">EV</th>
                  <th className="px-3 py-2 text-right font-medium">PV</th>
                  <th className="px-3 py-2 text-right font-medium">SPI</th>
                  <th className="px-3 py-2 text-right font-medium">CPI</th>
                </tr>
              </thead>
              <tbody>
                {latest.map((r) => (
                  <tr key={r.project_id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <Link href={`/projects/${r.project_id}`} className="font-medium text-blue-700 hover:underline">
                        {r.project_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{formatJalali(r.report_date)}</td>
                    <td className="px-3 py-2 text-slate-700">{r.progress_physical_actual != null ? `${(Number(r.progress_physical_actual) * 100).toFixed(2)}٪` : '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{r.progress_physical_planned != null ? `${(Number(r.progress_physical_planned) * 100).toFixed(2)}٪` : '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{fmtMoneyCompact(r.ev)}</td>
                    <td className="px-3 py-2 text-slate-600">{fmtMoneyCompact(r.pv)}</td>
                    <td className="px-3 py-2 text-slate-700">{fmtRatio(r.spi)}</td>
                    <td className="px-3 py-2 text-slate-700">{fmtRatio(r.cpi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* reporting status */}
        <div className="evm-card overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-800">وضعیت گزارش‌دهی پروژه‌ها</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tabular-nums">
              <thead>
                <tr className="bg-slate-50 text-[11px] text-slate-500">
                  <th className="px-3 py-2 text-right font-medium">پروژه</th>
                  <th className="px-3 py-2 text-right font-medium">دوره‌ها</th>
                  <th className="px-3 py-2 text-right font-medium">گزارش‌های واقعی</th>
                  <th className="px-3 py-2 text-right font-medium">آخرین دوره در برگه</th>
                  <th className="px-3 py-2 text-right font-medium">آخرین گزارش واقعی</th>
                </tr>
              </thead>
              <tbody>
                {status.map((r) => {
                  const stale = r.last_reported_date && r.last_period_in_sheet && r.last_reported_date < r.last_period_in_sheet;
                  return (
                    <tr key={r.project_id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <Link href={`/projects/${r.project_id}`} className="font-medium text-blue-700 hover:underline">
                          {r.project_name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{r.total_periods}</td>
                      <td className="px-3 py-2 text-slate-600">{r.reported_periods}</td>
                      <td className="px-3 py-2 text-slate-500">{formatJalali(r.last_period_in_sheet) || '—'}</td>
                      <td className={`px-3 py-2 ${stale ? 'font-semibold text-amber-600' : 'text-slate-600'}`}>
                        {formatJalali(r.last_reported_date) || '—'}{stale ? ' ←' : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
            فلش ← یعنی دوره‌های برنامه‌ای جدیدتری در برگه وجود دارد اما گزارش واقعی جدیدتری ثبت نشده است
          </div>
        </div>
      </div>
    </div>
  );
}
