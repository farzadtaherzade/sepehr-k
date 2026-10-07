'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef, GridApi, ICellRendererParams, ValueGetterParams } from 'ag-grid-community';
import { DataGrid } from '@/components/grid/DataGrid';
import { Button, PageHeader, Modal, Field, inputCls } from '@/components/ui';
import { useToast, useConfirm } from '@/components/ui-providers';
import { JalaliDatePicker } from '@/components/jalali/JalaliDatePicker';
import { api, ApiError } from '@/lib/api-client';
import { formatJalali } from '@/lib/jalali';
import type { Role } from '@/lib/types';

interface ProjectRow {
  id: number;
  name: string;
  contract_start_date: string | null;
  snapshot_count: number;
  reported_count: number;
  last_reported_date: string | null;
}

export function ProjectsClient({ role }: { role: Role }) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const editable = role === 'admin' || role === 'editor';

  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const apiRef = useRef<GridApi<ProjectRow> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ projects: ProjectRow[] }>('/api/projects');
      setRows(res.projects);
    } catch {
      toast('خطا در دریافت پروژه‌ها', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function onCellEdited(row: ProjectRow, colId: string, newValue: unknown) {
    const body: Record<string, unknown> = { [colId]: newValue };
    try {
      await api(`/api/projects/${row.id}`, { method: 'PATCH', body });
      toast('پروژه به‌روزرسانی شد', 'success');
      void load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'خطا در ذخیره', 'error');
      void load();
    }
  }

  async function deleteProject(row: ProjectRow) {
    const ok = await confirm(
      `پروژه «${row.name}» به همراه همه گزارش‌ها، اصلاحیه‌ها، تمدیدها و نیروی انسانی آن حذف شود؟ این عمل بازگشت‌پذیر نیست.`,
      true
    );
    if (!ok) return;
    try {
      await api(`/api/projects/${row.id}`, { method: 'DELETE' });
      toast('پروژه حذف شد', 'success');
      void load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'خطا در حذف پروژه', 'error');
    }
  }

  async function addProject() {
    if (!newName.trim()) { toast('نام پروژه الزامی است', 'error'); return; }
    setBusy(true);
    try {
      const res = await api<{ id: number }>('/api/projects', {
        method: 'POST',
        body: { name: newName.trim(), contract_start_date: newDate },
      });
      toast('پروژه ایجاد شد؛ حالا اصلاحیه REV0 و گزارش‌ها را اضافه کنید', 'success');
      setAddOpen(false);
      setNewName('');
      setNewDate(null);
      window.location.href = `/projects/${res.id}`;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'خطا در ایجاد پروژه', 'error');
    } finally {
      setBusy(false);
    }
  }

  const columnDefs = useMemo<ColDef<ProjectRow>[]>(
    () => [
      {
        headerName: 'نام پروژه',
        field: 'name',
        pinned: 'left',
        width: 220,
        editable,
        cellRenderer: (p: ICellRendererParams<ProjectRow>) => (
          <a href={`/projects/${p.data?.id}`} className="font-medium text-blue-700 hover:underline">{p.value}</a>
        ),
      },
      {
        headerName: 'تاریخ شروع پیمان',
        field: 'contract_start_date',
        width: 150,
        editable,
        filter: 'agDateColumnFilter',
        filterParams: { inRangeInclusive: true, maxNumConditions: 2 },
        valueFormatter: (p) => formatJalali(p.value),
        cellClassRules: { 'evm-cell-null': (p) => p.value == null },
      },
      {
        headerName: 'دوره‌های ثبت‌شده',
        field: 'snapshot_count',
        width: 130,
        filter: 'agNumberColumnFilter',
        type: 'rightAligned',
      },
      {
        headerName: 'گزارش واقعی',
        field: 'reported_count',
        width: 120,
        filter: 'agNumberColumnFilter',
        type: 'rightAligned',
      },
      {
        headerName: 'آخرین گزارش واقعی',
        field: 'last_reported_date',
        width: 150,
        filter: 'agDateColumnFilter',
        filterParams: { inRangeInclusive: true, maxNumConditions: 2 },
        valueGetter: (p: ValueGetterParams<ProjectRow>) => p.data?.last_reported_date ?? null,
        valueFormatter: (p) => formatJalali(p.value),
        cellClassRules: { 'evm-cell-null': (p) => p.value == null },
      },
      ...(role === 'admin'
        ? [
            {
              headerName: 'عملیات',
              colId: '__actions',
              filter: false,
              sortable: false,
              width: 90,
              cellRenderer: (p: ICellRendererParams<ProjectRow>) =>
                p.data ? (
                  <button
                    title="حذف پروژه"
                    onClick={() => deleteProject(p.data!)}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ) : null,
            } satisfies ColDef<ProjectRow>,
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editable, role]
  );

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="پروژه‌ها"
        subtitle="فهرست پروژه‌ها — برای ویرایش نام یا تاریخ شروع، روی خانه دوبار کلیک کنید"
        actions={editable && <Button onClick={() => setAddOpen(true)}>+ افزودن پروژه</Button>}
      />
      <div className="evm-card overflow-hidden">
        <DataGrid<ProjectRow>
          columnDefs={columnDefs}
          rowData={rows}
          loading={loading}
          onGridReady={(g) => (apiRef.current = g)}
          onCellEdited={editable ? (row, col, val) => void onCellEdited(row, col, val) : undefined}
          heightClass="h-[calc(100vh-280px)] min-h-[320px]"
          pageSize={25}
        />
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="افزودن پروژه جدید">
        <div className="space-y-4">
          <Field label="نام پروژه">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className={inputCls} autoFocus />
          </Field>
          <Field label="تاریخ شروع پیمان (شمسی)">
            <JalaliDatePicker value={newDate} onChange={setNewDate} />
          </Field>
          <div className="flex justify-start">
            <Button onClick={addProject} disabled={busy}>ایجاد پروژه</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
