'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { DataGrid } from '@/components/grid/DataGrid';
import { Badge, PageHeader } from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatJalaliDateTime } from '@/lib/jalali';
import { useToast } from '@/components/ui-providers';
import type { AuditEntry } from '@/lib/types';

const actionFa: Record<string, { label: string; tone: 'green' | 'amber' | 'red' | 'slate' }> = {
  LOGIN: { label: 'ورود', tone: 'slate' },
  LOGOUT: { label: 'خروج', tone: 'slate' },
  LOGIN_FAILED: { label: 'ورود ناموفق', tone: 'red' },
  CHANGE_PASSWORD: { label: 'تغییر رمز', tone: 'slate' },
  INSERT: { label: 'ثبت', tone: 'green' },
  UPDATE: { label: 'ویرایش', tone: 'amber' },
  UPSERT: { label: 'ثبت/ویرایش', tone: 'amber' },
  DELETE: { label: 'حذف', tone: 'red' },
};

const tableFa: Record<string, string> = {
  dim_project: 'پروژه',
  dim_contractor_category: 'دسته پیمانکار',
  contract_revision: 'اصلاحیه قرارداد',
  contract_extension: 'تمدید پیمان',
  project_snapshot: 'گزارش دوره‌ای',
  snapshot_revision_progress: 'پیشرفت ریوژن',
  snapshot_contractor_headcount: 'نیروی انسانی',
  app_user: 'کاربر سامانه',
  audit_log: 'گزارش تغییرات',
};

export function AuditClient() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [detail, setDetail] = useState<AuditEntry | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api<{ audit: AuditEntry[] }>('/api/audit?limit=800');
        setRows(res.audit);
      } catch {
        toast('خطا در دریافت گزارش تغییرات', 'error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = useMemo<ColDef<AuditEntry>[]>(
    () => [
      { headerName: 'زمان', field: 'created_at', width: 170, valueFormatter: (p) => formatJalaliDateTime(p.value), filter: 'agDateColumnFilter' },
      { headerName: 'کاربر', field: 'username', width: 120 },
      {
        headerName: 'عملیات', field: 'action', width: 110,
        cellRenderer: (p: { value: string }) => {
          const a = actionFa[p.value] ?? { label: p.value, tone: 'slate' as const };
          return <Badge tone={a.tone}>{a.label}</Badge>;
        },
        filter: 'agSetColumnFilter',
      },
      { headerName: 'جدول', field: 'table_name', width: 150, valueFormatter: (p) => (p.value ? tableFa[p.value as string] ?? p.value : '—'), filter: 'agSetColumnFilter' },
      { headerName: 'شناسه ردیف', field: 'row_id', width: 110, filter: 'agTextColumnFilter' },
      { headerName: 'IP', field: 'ip', width: 110, filter: 'agTextColumnFilter' },
      {
        headerName: 'جزئیات', colId: '__detail', width: 100, filter: false, sortable: false,
        cellRenderer: (p: { data?: AuditEntry }) =>
          p.data ? (
            <button onClick={() => setDetail(p.data!)} className="text-xs font-medium text-blue-700 hover:underline">
              مشاهده
            </button>
          ) : null,
      },
    ],
    []
  );

  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader title="گزارش تغییرات" subtitle="تمام عملیات ثبت، ویرایش، حذف و ورود کاربران (۸۰۰ رکورد آخر)" />
      <div className="evm-card overflow-hidden">
        <DataGrid<AuditEntry>
          columnDefs={columns}
          rowData={rows}
          heightClass="h-[calc(100vh-260px)] min-h-[360px]"
          pageSize={50}
          gridOptions={{ getRowId: (p) => String(p.data.id) }}
        />
      </div>

      {detail && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">
                {actionFa[detail.action]?.label ?? detail.action} — {tableFa[detail.table_name ?? ''] ?? detail.table_name}
              </h3>
              <span className="text-xs text-slate-400">{formatJalaliDateTime(detail.created_at)} · {detail.username}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {detail.old_data && (
                <div>
                  <div className="mb-1 text-xs font-bold text-red-600">مقدار قبلی</div>
                  <pre dir="ltr" className="max-h-72 overflow-auto rounded-lg bg-red-50 p-3 text-[11px] leading-5 text-slate-700">
                    {JSON.stringify(detail.old_data, null, 2)}
                  </pre>
                </div>
              )}
              {detail.new_data && (
                <div>
                  <div className="mb-1 text-xs font-bold text-emerald-600">مقدار جدید</div>
                  <pre dir="ltr" className="max-h-72 overflow-auto rounded-lg bg-emerald-50 p-3 text-[11px] leading-5 text-slate-700">
                    {JSON.stringify(detail.new_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
