'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Field, Modal, PageHeader, Select, inputCls } from '@/components/ui';
import { useToast } from '@/components/ui-providers';
import { api, ApiError } from '@/lib/api-client';
import { formatJalali } from '@/lib/jalali';
import { fmtNum } from '@/lib/format';
import type { ContractorCategory, Project, Role } from '@/lib/types';

interface SnapRef { id: number; project_id: number; project_name: string; report_date: string }
interface HcRow { id: number; snapshot_id: number; contractor_category_id: number; headcount: string }

const COLS_PER_PAGE = 8;
const PAGE_SIZES: { value: string; label: string }[] = [
  { value: '12', label: '۱۲' },
  { value: '24', label: '۲۴' },
  { value: '48', label: '۴۸' },
  { value: '0', label: 'همه' },
];

/** Persian pager shared by both axes. */
function Pager({
  page, pageCount, onPage, prevLabel, nextLabel, indicator,
}: {
  page: number; pageCount: number; onPage: (p: number) => void;
  prevLabel: string; nextLabel: string; indicator: string;
}) {
  const btn = 'rounded-lg border border-slate-300 bg-white px-2.5 h-8 text-xs text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={btn} disabled={page === 0} onClick={() => onPage(0)} title="اولین صفحه">
        ⟪
      </button>
      <button type="button" className={btn} disabled={page === 0} onClick={() => onPage(page - 1)}>
        {prevLabel}
      </button>
      <span className="min-w-28 text-center text-xs text-slate-500">{indicator}</span>
      <button type="button" className={btn} disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>
        {nextLabel}
      </button>
      <button type="button" className={btn} disabled={page >= pageCount - 1} onClick={() => onPage(pageCount - 1)} title="آخرین صفحه">
        ⟫
      </button>
    </div>
  );
}

export function HeadcountClient({
  projects, categories, snapshots, headcount, role,
}: {
  projects: Project[]; categories: ContractorCategory[]; snapshots: SnapRef[]; headcount: HcRow[]; role: Role;
}) {
  const { toast } = useToast();
  const editable = role === 'admin' || role === 'editor';
  const isAdmin = role === 'admin';

  const [projectFilter, setProjectFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [catList, setCatList] = useState(categories);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [catForm, setCatForm] = useState({ title: '', title_fa: '', display_order: '' });
  const [busy, setBusy] = useState(false);

  // pagination: vertical (period rows) + horizontal (category columns)
  const [rowPage, setRowPage] = useState(0);
  const [pageSize, setPageSize] = useState('12');
  const [colPage, setColPage] = useState(0);

  const valueMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of headcount) m.set(`${h.snapshot_id}:${h.contractor_category_id}`, Number(h.headcount));
    return m;
  }, [headcount]);

  const sortedCats = useMemo(
    () => [...catList].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
    [catList]
  );

  const cats = useMemo(
    () => sortedCats.filter((c) => !catFilter || String(c.id) === catFilter),
    [sortedCats, catFilter]
  );

  const rows = useMemo(
    () => [...snapshots].filter((s) => !projectFilter || String(s.project_id) === projectFilter).sort((a, b) => b.report_date.localeCompare(a.report_date)),
    [snapshots, projectFilter]
  );

  // reset pagers when filters or data shape change
  useEffect(() => { setRowPage(0); }, [projectFilter, pageSize, rows.length]);
  useEffect(() => { setColPage(0); }, [catFilter, catList.length]);

  const ps = Number(pageSize);
  const rowPageCount = Math.max(1, Math.ceil(rows.length / (ps === 0 ? rows.length || 1 : ps)));
  const rp = Math.min(rowPage, rowPageCount - 1);
  const pagedRows = ps === 0 ? rows : rows.slice(rp * ps, rp * ps + ps);

  const colPageCount = Math.max(1, Math.ceil(cats.length / COLS_PER_PAGE));
  const cp = Math.min(colPage, colPageCount - 1);
  const pagedCats = cats.slice(cp * COLS_PER_PAGE, cp * COLS_PER_PAGE + COLS_PER_PAGE);
  const colFrom = cats.length === 0 ? 0 : cp * COLS_PER_PAGE + 1;
  const colTo = Math.min(cats.length, cp * COLS_PER_PAGE + COLS_PER_PAGE);

  const reloadCats = useCallback(async () => {
    try {
      const res = await api<{ categories: ContractorCategory[] }>('/api/categories');
      setCatList(res.categories);
    } catch {
      /* keep old */
    }
  }, []);

  async function setCell(snapshotId: number, catId: number, input: string) {
    try {
      await api('/api/headcount', { method: 'POST', body: { snapshot_id: snapshotId, contractor_category_id: catId, headcount: input } });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'خطا در ذخیره', 'error');
    }
  }

  async function addCategory() {
    if (!catForm.title.trim()) { toast('عنوان لاتین الزامی است', 'error'); return; }
    setBusy(true);
    try {
      await api('/api/categories', {
        method: 'POST',
        body: {
          title: catForm.title.trim(),
          title_fa: catForm.title_fa.trim() || null,
          display_order: catForm.display_order === '' ? null : Number(catForm.display_order),
          aliases: catForm.title_fa.trim() ? [catForm.title_fa.trim()] : [],
        },
      });
      toast('دسته جدید اضافه شد', 'success');
      setAddCatOpen(false);
      setCatForm({ title: '', title_fa: '', display_order: '' });
      await reloadCats();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'خطا در افزودن دسته', 'error');
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="نیروی انسانی پیمانکار"
        subtitle="ماتریس میانگین نیروی انسانی ماهانه به تفکیک دسته پیمانکار — مقادیر اعشاری مجاز است"
        actions={isAdmin && <Button variant="secondary" onClick={() => setAddCatOpen(true)}>+ دسته پیمانکار جدید</Button>}
      />

      <div className="evm-card mb-3 flex flex-wrap items-center gap-2 p-3">
        <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="!w-52">
          <option value="">همه پروژه‌ها</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="!w-56">
          <option value="">همه دسته‌ها</option>
          {sortedCats.map((c) => (
            <option key={c.id} value={c.id}>{c.title_fa || c.title}</option>
          ))}
        </Select>
        <span className="ms-auto text-xs text-slate-400">{rows.length.toLocaleString('en-US')} دوره</span>
      </div>

      {/* quick-access category chips — click to filter, click again to clear */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setCatFilter('')}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition ${
            catFilter === ''
              ? 'border-blue-700 bg-blue-700 text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
          }`}
        >
          همه دسته‌ها
        </button>
        {sortedCats.map((c) => {
          const active = catFilter === String(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCatFilter(active ? '' : String(c.id))}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition ${
                active
                  ? 'border-blue-700 bg-blue-700 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
              }`}
            >
              {c.title_fa || c.title}
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                active ? 'border-blue-400 bg-blue-600 text-white' : 'border-slate-200 bg-slate-100 text-slate-600'
              }`}>
                {c.display_order ?? '—'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="evm-card p-3">
        {/* vertical pager (period rows) */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Pager
            page={rp}
            pageCount={rowPageCount}
            onPage={setRowPage}
            prevLabel="قبلی"
            nextLabel="بعدی"
            indicator={`صفحه ${(rp + 1).toLocaleString('en-US')} از ${rowPageCount.toLocaleString('en-US')}`}
          />
          <span className="text-xs text-slate-500">تعداد ردیف:</span>
          <Select value={pageSize} onChange={(e) => setPageSize(e.target.value)} className="!w-24">
            {PAGE_SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="sticky start-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs text-slate-500">پروژه / تاریخ</th>
                {pagedCats.map((c) => (
                  <th key={c.id} className="border border-slate-200 px-3 py-2 text-xs text-slate-600">
                    {c.title_fa || c.title}
                    {c.title_fa && c.title && <span className="block text-[9px] font-normal text-slate-400" dir="ltr">{c.title}</span>}
                  </th>
                ))}
                <th className="border border-slate-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">جمع</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((s) => {
                let total = 0;
                const cells = cats.map((c) => {
                  const v = valueMap.get(`${s.id}:${c.id}`);
                  if (v != null) total += v;
                  return { c, v };
                });
                const visible = new Set(pagedCats.map((c) => c.id));
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="sticky start-0 z-10 border border-slate-200 bg-white px-3 py-1.5">
                      <span className="font-medium text-blue-700">{s.project_name}</span>
                      <span className="block text-[11px] text-slate-400">{formatJalali(s.report_date)}</span>
                    </td>
                    {cells.filter(({ c }) => visible.has(c.id)).map(({ c, v }) => (
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
                    <td className="border border-slate-200 bg-blue-50/50 px-3 py-1.5 text-center font-bold text-blue-900">{total ? fmtNum(total, 2) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className="py-8 text-center text-sm text-slate-400">دوره‌ای یافت نشد</div>}
        </div>

        {/* horizontal pager (category columns) */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pager
            page={cp}
            pageCount={colPageCount}
            onPage={setColPage}
            prevLabel="ستون‌های قبلی"
            nextLabel="ستون‌های بعدی"
            indicator={`ستون ${colFrom.toLocaleString('en-US')} تا ${colTo.toLocaleString('en-US')} از ${cats.length.toLocaleString('en-US')}`}
          />
        </div>
      </div>

      <Modal open={addCatOpen} onClose={() => setAddCatOpen(false)} title="افزودن دسته پیمانکار">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="عنوان لاتین (slug)"><input dir="ltr" className={inputCls} value={catForm.title} onChange={(e) => setCatForm({ ...catForm, title: e.target.value })} placeholder="e.g. waterproofing" /></Field>
          <Field label="عنوان فارسی"><input className={inputCls} value={catForm.title_fa} onChange={(e) => setCatForm({ ...catForm, title_fa: e.target.value })} /></Field>
          <Field label="ترتیب نمایش"><input type="number" dir="ltr" className={inputCls} value={catForm.display_order} onChange={(e) => setCatForm({ ...catForm, display_order: e.target.value })} /></Field>
        </div>
        <div className="mt-4"><Button onClick={addCategory} disabled={busy} className="!bg-blue-700 hover:!bg-blue-800">ذخیره دسته</Button></div>
      </Modal>
    </div>
  );
}
