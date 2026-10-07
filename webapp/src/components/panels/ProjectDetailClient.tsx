'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef, GridApi, ICellRendererParams } from 'ag-grid-community';
import { DataGrid } from '@/components/grid/DataGrid';
import { snapshotColumns } from '@/components/grid/snapshot-columns';
import { SnapshotForm } from '@/components/forms/SnapshotForm';
import { LineChart } from '@/components/charts/LineChart';
import { Badge, Button, Field, Modal, PageHeader, Tabs, inputCls } from '@/components/ui';
import { useToast, useConfirm } from '@/components/ui-providers';
import { JalaliDatePicker } from '@/components/jalali/JalaliDatePicker';
import { api, ApiError } from '@/lib/api-client';
import { formatJalali, formatJalaliDateTime } from '@/lib/jalali';
import { fmtMoney, fmtNum, fmtPct, parseNumInput } from '@/lib/format';
import type { ProjectDetail, Role, Snapshot } from '@/lib/types';

const TEAL = '#1D4ED8', AMBER = '#d97706', SLATE = '#64748B', BLUE = '#5B8DEF', RED = '#dc2626';

export function ProjectDetailClient({ initial, role }: { initial: ProjectDetail; role: Role }) {
  const [detail, setDetail] = useState<ProjectDetail>(initial);
  const [tab, setTab] = useState('snapshots');
  const { toast } = useToast();
  const editable = role === 'admin' || role === 'editor';
  const pid = initial.project.id;

  const reload = useCallback(async () => {
    try {
      const res = await api<ProjectDetail>(`/api/projects/${pid}`);
      setDetail(res);
    } catch {
      toast('خطا در نوسازی داده‌های پروژه', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);

  const lastActual = useMemo(
    () => [...detail.snapshots].reverse().find((s) => s.progress_physical_actual != null || s.spi != null),
    [detail.snapshots]
  );

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title={detail.project.name}
        subtitle={
          <>
            شروع پیمان: {formatJalali(detail.project.contract_start_date, { long: true }) || '—'}
            {' · '}
            {detail.snapshots.length.toLocaleString('en-US')} دوره ثبت‌شده
          </>
        }
        actions={<Button variant="secondary" onClick={() => { window.location.href = '/projects'; }}>بازگشت به فهرست</Button>}
      />

      {lastActual && (
        <div className="mb-4 flex flex-wrap items-center gap-2 evm-card px-4 py-3 text-sm">
          <span className="text-slate-500">آخرین گزارش واقعی ({formatJalali(lastActual.report_date)}):</span>
          <Badge tone="slate">پیشرفت فیزیکی: {fmtPct(lastActual.progress_physical_actual)}</Badge>
          <Badge tone={Number(lastActual.spi) < 0.9 ? 'red' : Number(lastActual.spi) > 1.05 ? 'green' : 'teal'}>SPI: {fmtNum(lastActual.spi)}</Badge>
          <Badge tone={Number(lastActual.cpi) < 0.9 ? 'red' : Number(lastActual.cpi) > 1.05 ? 'green' : 'teal'}>CPI: {fmtNum(lastActual.cpi)}</Badge>
          {lastActual.updated_at && <span className="ms-auto text-[11px] text-slate-400">آخرین ویرایش: {formatJalaliDateTime(lastActual.updated_at)}</span>}
        </div>
      )}

      <div className="evm-card">
        <div className="px-3 pt-2">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'snapshots', label: 'گزارش‌های دوره‌ای', badge: detail.snapshots.length },
              { id: 'contract', label: 'قرارداد', badge: detail.revisions.length + detail.extensions.length },
              { id: 'revprogress', label: 'پیشرفت بر اساس ریوژن', badge: detail.revisionProgress.length },
              { id: 'headcount', label: 'نیروی انسانی', badge: detail.headcount.length },
              { id: 'trend', label: 'نمودار روند' },
            ]}
          />
        </div>
        <div className="p-3">
          {tab === 'snapshots' && <SnapshotsTab detail={detail} editable={editable} reload={reload} />}
          {tab === 'contract' && <ContractTab detail={detail} editable={editable} reload={reload} />}
          {tab === 'revprogress' && <RevProgressTab detail={detail} editable={editable} reload={reload} />}
          {tab === 'headcount' && <HeadcountTab detail={detail} editable={editable} reload={reload} />}
          {tab === 'trend' && <TrendTab detail={detail} />}
        </div>
      </div>
    </div>
  );
}

/* ================= Tab: snapshots ================= */

function SnapshotsTab({ detail, editable, reload }: { detail: ProjectDetail; editable: boolean; reload: () => Promise<void> }) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const columns = useMemo(() => snapshotColumns({ editable }), [editable]);

  async function onCellEdited(row: Snapshot, colId: string, newValue: unknown, gridApi: GridApi<Snapshot>) {
    if (!row.id) return;
    try {
      const res = await api<{ snapshot: Snapshot }>(`/api/snapshots/${row.id}`, {
        method: 'PATCH',
        body: { [colId]: newValue, updated_at: row.updated_at },
      });
      gridApi.applyTransaction({ update: [res.snapshot] });
      toast('تغییر ذخیره شد', 'success');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'خطا در ذخیره تغییر', 'error');
      void reload();
    }
  }

  async function handleAdd(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await api('/api/snapshots', { method: 'POST', body: { ...body, project_id: detail.project.id } });
      toast('گزارش ثبت شد', 'success');
      setAddOpen(false);
      await reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'خطا در ثبت گزارش', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {editable && (
        <div className="mb-2 flex justify-start">
          <Button onClick={() => setAddOpen(true)}>+ افزودن گزارش</Button>
        </div>
      )}
      <DataGrid<Snapshot>
        columnDefs={columns}
        rowData={detail.snapshots}
        onCellEdited={editable ? onCellEdited : undefined}
        heightClass="h-[560px]"
        pageSize={50}
      />
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="افزودن گزارش دوره‌ای" wide>
        <SnapshotForm projects={[detail.project]} onSubmit={handleAdd} busy={busy} />
      </Modal>
    </>
  );
}

/* ================= Tab: contract (revisions + extensions) ================= */

function ContractTab({ detail, editable, reload }: { detail: ProjectDetail; editable: boolean; reload: () => Promise<void> }) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [revOpen, setRevOpen] = useState(false);
  const [extOpen, setExtOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revForm, setRevForm] = useState({ revision_no: '', amount: '', duration_days: '', effective_date: null as string | null });
  const [extForm, setExtForm] = useState({ extension_no: '', duration_days: '', effective_date: null as string | null });

  const saveRev = async () => {
    if (revForm.revision_no === '') { toast('شماره اصلاحیه الزامی است', 'error'); return; }
    setBusy(true);
    try {
      await api('/api/revisions', {
        method: 'POST',
        body: {
          project_id: detail.project.id,
          revision_no: Number(revForm.revision_no),
          amount: revForm.amount,
          duration_days: revForm.duration_days,
          effective_date: revForm.effective_date,
        },
      });
      toast('اصلاحیه ثبت شد', 'success');
      setRevOpen(false);
      setRevForm({ revision_no: '', amount: '', duration_days: '', effective_date: null });
      await reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'خطا در ثبت اصلاحیه', 'error');
    } finally { setBusy(false); }
  };

  const saveExt = async () => {
    if (extForm.extension_no === '') { toast('شماره تمدید الزامی است', 'error'); return; }
    setBusy(true);
    try {
      await api('/api/extensions', {
        method: 'POST',
        body: {
          project_id: detail.project.id,
          extension_no: Number(extForm.extension_no),
          duration_days: extForm.duration_days,
          effective_date: extForm.effective_date,
        },
      });
      toast('تمدید ثبت شد', 'success');
      setExtOpen(false);
      setExtForm({ extension_no: '', duration_days: '', effective_date: null });
      await reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'خطا در ثبت تمدید', 'error');
    } finally { setBusy(false); }
  };

  const revCols: ColDef[] = [
    { headerName: 'شماره اصلاحیه', field: 'revision_no', width: 130, type: 'rightAligned', filter: 'agNumberColumnFilter' },
    { headerName: 'مبلغ پیمان (ریال)', field: 'amount', width: 190, type: 'rightAligned', valueFormatter: (p) => fmtMoney(p.value), cellClassRules: { 'evm-cell-null': (p) => p.value == null }, filter: 'agNumberColumnFilter', editable, valueParser: (p) => parseNumInput(p.newValue) },
    { headerName: 'مدت (روز)', field: 'duration_days', width: 120, type: 'rightAligned', filter: 'agNumberColumnFilter', editable, valueParser: (p) => { const n = parseNumInput(p.newValue); return n == null ? null : Math.round(n); }, cellClassRules: { 'evm-cell-null': (p) => p.value == null } },
    { headerName: 'تاریخ ابطاق', field: 'effective_date', width: 140, filter: 'agDateColumnFilter', valueFormatter: (p) => formatJalali(p.value), cellClassRules: { 'evm-cell-null': (p) => p.value == null } },
    ...(editable ? [actionCol(async (row) => {
      const ok = await confirm(`اصلاحیه REV${row.revision_no} حذف شود؟`, true);
      if (!ok) return;
      try { await api(`/api/revisions/${row.id}`, { method: 'DELETE' }); toast('حذف شد', 'success'); await reload(); }
      catch (e) { toast(e instanceof ApiError ? e.message : 'خطا در حذف', 'error'); }
    })] : []),
  ];

  const extCols: ColDef[] = [
    { headerName: 'شماره تمدید', field: 'extension_no', width: 130, type: 'rightAligned', filter: 'agNumberColumnFilter' },
    { headerName: 'مدت تمدید (روز)', field: 'duration_days', width: 160, type: 'rightAligned', filter: 'agNumberColumnFilter', editable, valueParser: (p) => { const n = parseNumInput(p.newValue); return n == null ? null : Math.round(n); }, cellClassRules: { 'evm-cell-null': (p) => p.value == null } },
    { headerName: 'تاریخ ابلاغ', field: 'effective_date', width: 140, filter: 'agDateColumnFilter', valueFormatter: (p) => formatJalali(p.value), cellClassRules: { 'evm-cell-null': (p) => p.value == null } },
    ...(editable ? [actionCol(async (row) => {
      const ok = await confirm(`تمدید شماره ${row.extension_no} حذف شود؟`, true);
      if (!ok) return;
      try { await api(`/api/extensions/${row.id}`, { method: 'DELETE' }); toast('حذف شد', 'success'); await reload(); }
      catch (e) { toast(e instanceof ApiError ? e.message : 'خطا در حذف', 'error'); }
    })] : []),
  ];

  async function onRevEdit(row: Record<string, unknown>, colId: string) {
    try { await api(`/api/revisions/${row.id}`, { method: 'PATCH', body: { [colId]: row[colId] } }); toast('ذخیره شد', 'success'); await reload(); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'خطا', 'error'); await reload(); }
  }
  async function onExtEdit(row: Record<string, unknown>, colId: string) {
    try { await api(`/api/extensions/${row.id}`, { method: 'PATCH', body: { [colId]: row[colId] } }); toast('ذخیره شد', 'success'); await reload(); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'خطا', 'error'); await reload(); }
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700">اصلاحیه‌های قرارداد (REV)</h3>
          {editable && <Button variant="secondary" onClick={() => setRevOpen(true)}>+ اصلاحیه جدید</Button>}
        </div>
        <DataGrid
          columnDefs={revCols}
          rowData={detail.revisions}
          onCellEdited={editable ? (row, col) => void onRevEdit(row, col) : undefined}
          heightClass="h-[240px]"
          pageSize={10}
          gridOptions={{ getRowId: (p) => String(p.data?.id) }}
        />
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700">تمدیدهای پیمان</h3>
          {editable && <Button variant="secondary" onClick={() => setExtOpen(true)}>+ تمدید جدید</Button>}
        </div>
        <DataGrid
          columnDefs={extCols}
          rowData={detail.extensions}
          onCellEdited={editable ? (row, col) => void onExtEdit(row, col) : undefined}
          heightClass="h-[220px]"
          pageSize={10}
          gridOptions={{ getRowId: (p) => String(p.data?.id) }}
        />
      </section>

      <Modal open={revOpen} onClose={() => setRevOpen(false)} title="افزودن اصلاحیه قرارداد">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="شماره اصلاحیه (REV)"><input type="number" min={0} dir="ltr" className={inputCls} value={revForm.revision_no} onChange={(e) => setRevForm({ ...revForm, revision_no: e.target.value })} /></Field>
          <Field label="مبلغ پیمان (ریال)"><input dir="ltr" className={inputCls} value={revForm.amount} onChange={(e) => setRevForm({ ...revForm, amount: e.target.value })} placeholder="—"/></Field>
          <Field label="مدت (روز)"><input type="number" min={0} dir="ltr" className={inputCls} value={revForm.duration_days} onChange={(e) => setRevForm({ ...revForm, duration_days: e.target.value })} placeholder="—"/></Field>
          <Field label="تاریخ ابطاق (شمسی)"><JalaliDatePicker value={revForm.effective_date} onChange={(v) => setRevForm({ ...revForm, effective_date: v })} /></Field>
        </div>
        <div className="mt-4"><Button onClick={saveRev} disabled={busy}>ذخیره اصلاحیه</Button></div>
      </Modal>

      <Modal open={extOpen} onClose={() => setExtOpen(false)} title="افزودن تمدید پیمان">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="شماره تمدید"><input type="number" min={0} dir="ltr" className={inputCls} value={extForm.extension_no} onChange={(e) => setExtForm({ ...extForm, extension_no: e.target.value })} /></Field>
          <Field label="مدت تمدید (روز)"><input type="number" min={0} dir="ltr" className={inputCls} value={extForm.duration_days} onChange={(e) => setExtForm({ ...extForm, duration_days: e.target.value })} placeholder="—"/></Field>
          <Field label="تاریخ ابلاغ (شمسی)"><JalaliDatePicker value={extForm.effective_date} onChange={(v) => setExtForm({ ...extForm, effective_date: v })} /></Field>
        </div>
        <div className="mt-4"><Button onClick={saveExt} disabled={busy}>ذخیره تمدید</Button></div>
      </Modal>
    </div>
  );
}

/* ================= Tab: revision progress ================= */

function RevProgressTab({ detail, editable, reload }: { detail: ProjectDetail; editable: boolean; reload: () => Promise<void> }) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ snapshot_id: '', revision_no: '', ppa: '', ppp: '', pra: '', prp: '', ev: '', pv: '' });

  const columns: ColDef[] = useMemo(
    () => [
      { headerName: 'تاریخ گزارش', field: 'report_date', width: 120, filter: 'agDateColumnFilter', valueFormatter: (p) => formatJalali(p.value) },
      { headerName: 'ریوژن', field: 'revision_no', width: 90, type: 'rightAligned', filter: 'agNumberColumnFilter' },
      { headerName: 'پیشرفت فیزیکی واقعی', field: 'progress_physical_actual', width: 150, type: 'rightAligned', valueFormatter: (p) => fmtPct(p.value), cellClassRules: { 'evm-cell-null': (p) => p.value == null }, filter: 'agNumberColumnFilter', editable, valueParser: (p) => { const n = parseNumInput(p.newValue); return n == null ? null : n / 100; } },
      { headerName: 'پیشرفت فیزیکی برنامه', field: 'progress_physical_planned', width: 150, type: 'rightAligned', valueFormatter: (p) => fmtPct(p.value), cellClassRules: { 'evm-cell-null': (p) => p.value == null }, filter: 'agNumberColumnFilter', editable, valueParser: (p) => { const n = parseNumInput(p.newValue); return n == null ? null : n / 100; } },
      { headerName: 'پیشرفت ریالی واقعی', field: 'progress_rial_actual', width: 150, type: 'rightAligned', valueFormatter: (p) => fmtPct(p.value), cellClassRules: { 'evm-cell-null': (p) => p.value == null }, filter: 'agNumberColumnFilter', editable, valueParser: (p) => { const n = parseNumInput(p.newValue); return n == null ? null : n / 100; } },
      { headerName: 'پیشرفت ریالی برنامه', field: 'progress_rial_planned', width: 150, type: 'rightAligned', valueFormatter: (p) => fmtPct(p.value), cellClassRules: { 'evm-cell-null': (p) => p.value == null }, filter: 'agNumberColumnFilter', editable, valueParser: (p) => { const n = parseNumInput(p.newValue); return n == null ? null : n / 100; } },
      { headerName: 'EV (ریال)', field: 'ev', width: 170, type: 'rightAligned', valueFormatter: (p) => fmtMoney(p.value), cellClassRules: { 'evm-cell-null': (p) => p.value == null }, filter: 'agNumberColumnFilter', editable, valueParser: (p) => parseNumInput(p.newValue) },
      { headerName: 'PV (ریال)', field: 'pv', width: 170, type: 'rightAligned', valueFormatter: (p) => fmtMoney(p.value), cellClassRules: { 'evm-cell-null': (p) => p.value == null }, filter: 'agNumberColumnFilter', editable, valueParser: (p) => parseNumInput(p.newValue) },
      { headerName: 'SPI ریوژن', colId: 'revision_spi', width: 110, type: 'rightAligned', filter: 'agNumberColumnFilter', valueGetter: (p) => { const ev = Number(p.data?.ev), pv = Number(p.data?.pv); return ev && pv ? ev / pv : null; }, valueFormatter: (p) => fmtNum(p.value) },
      ...(editable ? [actionCol(async (row) => {
        const ok = await confirm(`ردیف پیشرفت ریوژن ${row.revision_no} مورخ ${formatJalali(row.report_date as string | null)} حذف شود؟`, true);
        if (!ok) return;
        try { await api(`/api/revision-progress/${row.id}`, { method: 'DELETE' }); toast('حذف شد', 'success'); await reload(); }
        catch (e) { toast(e instanceof ApiError ? e.message : 'خطا در حذف', 'error'); }
      })] : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editable]
  );

  async function onCellEdited(row: Record<string, unknown>, colId: string, newValue: unknown) {
    try {
      await api('/api/revision-progress', {
        method: 'POST',
        body: {
          snapshot_id: row.snapshot_id,
          revision_no: row.revision_no,
          [colId]: newValue,
        },
      });
      toast('ذخیره شد', 'success');
      await reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'خطا در ذخیره', 'error');
      await reload();
    }
  }

  async function save() {
    if (form.snapshot_id === '' || form.revision_no === '') { toast('انتخاب تاریخ گزارش و شماره ریوژن الزامی است', 'error'); return; }
    setBusy(true);
    try {
      await api('/api/revision-progress', {
        method: 'POST',
        body: {
          snapshot_id: Number(form.snapshot_id),
          revision_no: Number(form.revision_no),
          progress_physical_actual: form.ppa,
          progress_physical_planned: form.ppp,
          progress_rial_actual: form.pra,
          progress_rial_planned: form.prp,
          ev: form.ev,
          pv: form.pv,
        },
      });
      toast('ردیف پیشرفت ریوژن ذخیره شد', 'success');
      setAddOpen(false);
      setForm({ snapshot_id: '', revision_no: '', ppa: '', ppp: '', pra: '', prp: '', ev: '', pv: '' });
      await reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'خطا در ذخیره', 'error');
    } finally { setBusy(false); }
  }

  return (
    <>
      {editable && (
        <div className="mb-2 flex justify-start">
          <Button onClick={() => setAddOpen(true)}>+ افزودن/به‌روزرسانی ردیف</Button>
        </div>
      )}
      <DataGrid
        columnDefs={columns}
        rowData={detail.revisionProgress}
        onCellEdited={editable ? (row, col, val) => void onCellEdited(row, col, val) : undefined}
        heightClass="h-[480px]"
        pageSize={25}
        gridOptions={{ getRowId: (p) => String(p.data?.id) }}
      />
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="افزودن/به‌روزرسانی پیشرفت بر اساس ریوژن">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="تاریخ گزارش">
            <select className={inputCls} value={form.snapshot_id} onChange={(e) => setForm({ ...form, snapshot_id: e.target.value })}>
              <option value="">— انتخاب دوره —</option>
              {[...detail.snapshots].reverse().map((s) => (
                <option key={s.id} value={s.id}>{formatJalali(s.report_date)} (REV{s.revision_no ?? '—'})</option>
              ))}
            </select>
          </Field>
          <Field label="شماره ریوژن"><input type="number" min={0} dir="ltr" className={inputCls} value={form.revision_no} onChange={(e) => setForm({ ...form, revision_no: e.target.value })} /></Field>
          <Field label="پیشرفت فیزیکی واقعی (٪)"><input dir="ltr" className={inputCls} value={form.ppa} onChange={(e) => setForm({ ...form, ppa: e.target.value })} placeholder="مثلاً 45.2" /></Field>
          <Field label="پیشرفت فیزیکی برنامه (٪)"><input dir="ltr" className={inputCls} value={form.ppp} onChange={(e) => setForm({ ...form, ppp: e.target.value })} /></Field>
          <Field label="پیشرفت ریالی واقعی (٪)"><input dir="ltr" className={inputCls} value={form.pra} onChange={(e) => setForm({ ...form, pra: e.target.value })} /></Field>
          <Field label="پیشرفت ریالی برنامه (٪)"><input dir="ltr" className={inputCls} value={form.prp} onChange={(e) => setForm({ ...form, prp: e.target.value })} /></Field>
          <Field label="EV (ریال)"><input dir="ltr" className={inputCls} value={form.ev} onChange={(e) => setForm({ ...form, ev: e.target.value })} /></Field>
          <Field label="PV (ریال)"><input dir="ltr" className={inputCls} value={form.pv} onChange={(e) => setForm({ ...form, pv: e.target.value })} /></Field>
        </div>
        <div className="mt-4"><Button onClick={save} disabled={busy}>ذخیره</Button></div>
      </Modal>
    </>
  );
}

/* ================= Tab: headcount matrix ================= */

function HeadcountTab({ detail, editable, reload }: { detail: ProjectDetail; editable: boolean; reload: () => Promise<void> }) {
  const { toast } = useToast();
  const cats = [...detail.categories].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  const snapshotsDesc = [...detail.snapshots].sort((a, b) => b.report_date.localeCompare(a.report_date));

  const valueMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of detail.headcount) m.set(`${h.snapshot_id}:${h.contractor_category_id}`, Number(h.headcount));
    return m;
  }, [detail.headcount]);

  async function setCell(snapshotId: number, catId: number, input: string) {
    try {
      await api('/api/headcount', {
        method: 'POST',
        body: { snapshot_id: snapshotId, contractor_category_id: catId, headcount: input },
      });
      await reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'خطا در ذخیره', 'error');
      await reload();
    }
  }

  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-xs text-slate-500">
        میانگین نیروی انسانی پیمانکار در ماه به تفکیک دسته — برای ویرایش، مقدار را در خانه وارد کنید و از آن خارج شوید
        {!editable && ' (فقط نمایش)'}
      </p>
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50">
            <th className="sticky start-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs text-slate-500">تاریخ گزارش</th>
            {cats.map((c) => (
              <th key={c.id} className="border border-slate-200 px-3 py-2 text-xs text-slate-600">{c.title_fa || c.title}</th>
            ))}
            <th className="border border-slate-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">جمع</th>
          </tr>
        </thead>
        <tbody>
          {snapshotsDesc.map((s) => {
            let total = 0;
            const cells = cats.map((c) => {
              const v = valueMap.get(`${s.id}:${c.id}`);
              if (v != null) total += v;
              return { c, v };
            });
            return (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="sticky start-0 z-10 border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700">
                  {formatJalali(s.report_date)}
                </td>
                {cells.map(({ c, v }) => (
                  <td key={c.id} className="border border-slate-200 p-0">
                    <input
                      defaultValue={v != null ? String(v) : ''}
                      onBlur={(e) => {
                        const input = e.target.value;
                        const before = v != null ? String(v) : '';
                        if (input !== before) void setCell(s.id, c.id, input);
                      }}
                      disabled={!editable}
                      dir="ltr"
                      inputMode="decimal"
                      className="h-9 w-full min-w-[72px] bg-transparent px-2 text-center text-[13px] outline-none focus:bg-blue-50"
                      placeholder="—"
                    />
                  </td>
                ))}
                <td className="border border-slate-200 bg-blue-50/50 px-3 py-1.5 text-center font-bold text-blue-900">
                  {total ? fmtNum(total, 2) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {snapshotsDesc.length === 0 && <div className="py-8 text-center text-sm text-slate-400">گزارشی ثبت نشده است</div>}
    </div>
  );
}

/* ================= Tab: trend charts ================= */

function TrendTab({ detail }: { detail: ProjectDetail }) {
  const actual = detail.snapshots.filter((s) => s.progress_physical_actual != null || s.spi != null);
  return (
    <div className="space-y-8">
      <LineChart
        title="پیشرفت فیزیکی: واقعی در برابر برنامه (٪)"
        percent
        series={[
          { name: 'واقعی', color: TEAL, points: actual.filter((s) => s.progress_physical_actual != null).map((s) => ({ x: s.report_date, y: Number(s.progress_physical_actual) })) },
          { name: 'برنامه', color: AMBER, points: actual.filter((s) => s.progress_physical_planned != null).map((s) => ({ x: s.report_date, y: Number(s.progress_physical_planned) })) },
        ]}
      />
      <LineChart
        title="شاخص‌های EVM: SPI و CPI"
        series={[
          { name: 'SPI', color: BLUE, points: actual.filter((s) => s.spi != null).map((s) => ({ x: s.report_date, y: Number(s.spi) })) },
          { name: 'CPI', color: RED, points: actual.filter((s) => s.cpi != null).map((s) => ({ x: s.report_date, y: Number(s.cpi) })) },
        ]}
      />
      <LineChart
        title="ارزش کسب‌شده (EV) و ارزش برنامه‌ای (PV) — ریال"
        series={[
          { name: 'EV', color: TEAL, points: actual.filter((s) => s.ev != null).map((s) => ({ x: s.report_date, y: Number(s.ev) })) },
          { name: 'PV', color: SLATE, points: actual.filter((s) => s.pv != null).map((s) => ({ x: s.report_date, y: Number(s.pv) })) },
        ]}
      />
    </div>
  );
}

/* ================= shared ================= */

function actionCol(onDelete: (row: Record<string, unknown>) => Promise<void>): ColDef {
  return {
    headerName: 'عملیات',
    colId: '__actions',
    filter: false,
    sortable: false,
    width: 84,
    cellRenderer: (p: ICellRendererParams) =>
      p.data ? (
        <button
          title="حذف"
          onClick={() => void onDelete(p.data as Record<string, unknown>)}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null,
  };
}
