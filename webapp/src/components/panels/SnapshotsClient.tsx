'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef, ColGroupDef, GridApi, GridOptions } from 'ag-grid-community';
import { DataGrid } from '@/components/grid/DataGrid';
import { snapshotColumns } from '@/components/grid/snapshot-columns';
import { SnapshotForm } from '@/components/forms/SnapshotForm';
import { Button, PageHeader, Modal, Select, inputCls } from '@/components/ui';
import { useToast, useConfirm } from '@/components/ui-providers';
import { JalaliDatePicker } from '@/components/jalali/JalaliDatePicker';
import { api, ApiError } from '@/lib/api-client';
import { formatJalali } from '@/lib/jalali';
import type { Project, Role, Snapshot } from '@/lib/types';

export function SnapshotsClient({ projects, role }: { projects: Project[]; role: Role }) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const editable = role === 'admin' || role === 'editor';

  const [rowData, setRowData] = useState<Snapshot[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);

  // toolbar state (state for UI + ref for the grid callbacks)
  const [fProject, setFProject] = useState<string>('');
  const [fFrom, setFFrom] = useState<string | null>(null);
  const [fTo, setFTo] = useState<string | null>(null);
  const [fActual, setFActual] = useState(false);
  const [quick, setQuick] = useState('');
  const st = useRef({ fProject, fFrom, fTo, fActual });
  st.current = { fProject, fFrom, fTo, fActual };

  const apiRef = useRef<GridApi<Snapshot> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ snapshots: Snapshot[] }>('/api/snapshots');
      setRowData(res.snapshots);
    } catch {
      toast('خطا در دریافت گزارش‌ها', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  const externalFiltersActive = useCallback(() => {
    const s = st.current;
    return Boolean(s.fProject || s.fFrom || s.fTo || s.fActual);
  }, []);

  const doesExternalFilterPass = useCallback((node: { data: Snapshot | undefined }) => {
    const s = st.current;
    const d = node.data;
    if (!d) return true;
    if (s.fProject && String(d.project_id) !== s.fProject) return false;
    if (s.fFrom && d.report_date < s.fFrom) return false;
    if (s.fTo && d.report_date > s.fTo) return false;
    if (s.fActual && !(d.progress_physical_actual != null || d.spi != null || d.ev != null || d.actual_cost != null)) return false;
    return true;
  }, []);

  const refreshToolbarFilter = () => apiRef.current?.onFilterChanged();

  const gridOptions = useMemo<GridOptions<Snapshot>>(
    () => ({
      isExternalFilterPresent: externalFiltersActive,
      doesExternalFilterPass: doesExternalFilterPass as GridOptions<Snapshot>['doesExternalFilterPass'],
      quickFilterText: quick,
    }),
    [externalFiltersActive, doesExternalFilterPass, quick]
  );

  async function onCellEdited(row: Snapshot, colId: string, newValue: unknown, gridApi: GridApi<Snapshot>) {
    if (!row.id) return;
    const body: Record<string, unknown> = { [colId]: newValue, updated_at: row.updated_at };
    try {
      const res = await api<{ snapshot: Snapshot }>(`/api/snapshots/${row.id}`, { method: 'PATCH', body });
      if (res.snapshot) gridApi.applyTransaction({ update: [res.snapshot] });
      toast('تغییر ذخیره شد', 'success');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'خطا در ذخیره تغییر', 'error');
      void load(); // revert to server truth
    }
  }

  async function deleteRow(row: Snapshot) {
    const ok = await confirm(
      `گزارش ${row.project_name} مورخ ${row.report_date} حذف شود؟ رکوردهای نیروی انسانی و پیشرفت ریوژن مرتبط هم حذف می‌شوند.`,
      true
    );
    if (!ok) return;
    try {
      await api(`/api/snapshots/${row.id}`, { method: 'DELETE' });
      toast('گزارش حذف شد', 'success');
      void load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'خطا در حذف', 'error');
    }
  }

  const columnDefs = useMemo<(ColDef<Snapshot> | ColGroupDef<Snapshot>)[]>(() => {
    const cols = snapshotColumns({ editable });
    if (!editable) return cols;
    return [
      ...cols,
      {
        headerName: 'عملیات',
        colId: '__actions',
        filter: false,
        sortable: false,
        resizable: false,
        pinned: 'left',
        width: 96,
        cellRenderer: (p: { data?: Snapshot }) =>
          p.data ? (
            <div className="flex h-full items-center gap-1">
              <button
                title="ویرایش کامل"
                onClick={() => setEditRow(p.data!)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-700"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                title="حذف"
                onClick={() => deleteRow(p.data!)}
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          ) : null,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  function exportCsv() {
    const gridApi = apiRef.current;
    if (!gridApi) return;
    const csv = gridApi.getDataAsCsv({ allColumns: false });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'evm-snapshots.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleAdd(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await api('/api/snapshots', { method: 'POST', body });
      toast('گزارش با موفقیت ثبت شد', 'success');
      setAddOpen(false);
      void load();
    } finally {
      setBusy(false);
    }
  }

  async function handleEdit(body: Record<string, unknown>) {
    if (!editRow?.id) return;
    setBusy(true);
    try {
      await api(`/api/snapshots/${editRow.id}`, { method: 'PATCH', body });
      toast('گزارش به‌روزرسانی شد', 'success');
      setEditRow(null);
      void load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1700px]">
      <PageHeader
        title="گزارش‌های دوره‌ای"
        subtitle="جدول کامل داده‌ها؛ برای ویرایش روی خانه دوبار کلیک کنید — فیلتر و مرتب‌سازی روی هر ستون فعال است"
        actions={
          <>
            {editable && <Button onClick={() => setAddOpen(true)}>+ افزودن گزارش</Button>}
            <Button variant="secondary" onClick={exportCsv}>خروجی CSV</Button>
          </>
        }
      />

      {/* toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2 evm-card p-3">
        <Select value={fProject} onChange={(e) => { setFProject(e.target.value); refreshToolbarFilter(); }} className="!w-52">
          <option value="">همه پروژه‌ها</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">از</span>
          <div className="w-36"><JalaliDatePicker value={fFrom} onChange={(v) => { setFFrom(v); refreshToolbarFilter(); }} placeholder="از تاریخ" /></div>
          <span className="text-xs text-slate-500">تا</span>
          <div className="w-36"><JalaliDatePicker value={fTo} onChange={(v) => { setFTo(v); refreshToolbarFilter(); }} placeholder="تا تاریخ" /></div>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
          <input type="checkbox" checked={fActual} onChange={(e) => { setFActual(e.target.checked); refreshToolbarFilter(); }} className="accent-blue-700" />
          فقط دوره‌های دارای گزارش واقعی
        </label>
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          placeholder="جستجوی سریع..."
          className={`${inputCls} !w-48`}
        />
        {rowData && (
          <span className="ms-auto text-xs text-slate-400">
            {rowData.length.toLocaleString('en-US')} ردیف
          </span>
        )}
      </div>

      <div className="evm-card overflow-hidden">
        <DataGrid<Snapshot>
          columnDefs={columnDefs}
          rowData={rowData}
          loading={loading}
          gridOptions={gridOptions}
          onGridReady={(g) => (apiRef.current = g)}
          onCellEdited={editable ? onCellEdited : undefined}
          heightClass="h-[calc(100vh-320px)] min-h-[420px]"
          pageSize={50}
        />
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="افزودن گزارش دوره‌ای" wide>
        <SnapshotForm projects={projects} onSubmit={handleAdd} busy={busy} />
      </Modal>

      <Modal open={!!editRow} onClose={() => setEditRow(null)} title={`ویرایش گزارش — ${editRow?.project_name ?? ''} (${editRow ? formatJalali(editRow.report_date) : ''})`} wide>
        {editRow && <SnapshotForm projects={projects} initial={editRow} onSubmit={handleEdit} busy={busy} submitLabel="ذخیره تغییرات" />}
      </Modal>
    </div>
  );
}
