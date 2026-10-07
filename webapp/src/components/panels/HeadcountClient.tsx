'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Field, Modal, PageHeader, Select, inputCls } from '@/components/ui';
import { useToast, useConfirm } from '@/components/ui-providers';
import { api, ApiError } from '@/lib/api-client';
import { formatJalali } from '@/lib/jalali';
import { fmtNum } from '@/lib/format';
import type { ContractorCategory, Project, Role } from '@/lib/types';

interface SnapRef { id: number; project_id: number; project_name: string; report_date: string }
interface HcRow { id: number; snapshot_id: number; contractor_category_id: number; headcount: string }

export function HeadcountClient({
  projects, categories, snapshots, headcount, role,
}: {
  projects: Project[]; categories: ContractorCategory[]; snapshots: SnapRef[]; headcount: HcRow[]; role: Role;
}) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const editable = role === 'admin' || role === 'editor';
  const isAdmin = role === 'admin';

  const [projectFilter, setProjectFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [catList, setCatList] = useState(categories);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [catForm, setCatForm] = useState({ title: '', title_fa: '', display_order: '' });
  const [busy, setBusy] = useState(false);

  const valueMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of headcount) m.set(`${h.snapshot_id}:${h.contractor_category_id}`, Number(h.headcount));
    return m;
  }, [headcount]);

  const cats = useMemo(
    () =>
      [...catList]
        .filter((c) => !catFilter || String(c.id) === catFilter)
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
    [catList, catFilter]
  );

  const rows = useMemo(
    () => [...snapshots].filter((s) => !projectFilter || String(s.project_id) === projectFilter).sort((a, b) => b.report_date.localeCompare(a.report_date)),
    [snapshots, projectFilter]
  );

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
          {[...catList].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)).map((c) => (
            <option key={c.id} value={c.id}>{c.title_fa || c.title}</option>
          ))}
        </Select>
        <span className="ms-auto text-xs text-slate-400">{rows.length.toLocaleString('en-US')} دوره</span>
      </div>

      <div className="evm-card overflow-x-auto p-3">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky start-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs text-slate-500">پروژه / تاریخ</th>
              {cats.map((c) => (
                <th key={c.id} className="border border-slate-200 px-3 py-2 text-xs text-slate-600" title={isAdmin ? 'برای تغییر، از صفحه مدیریت استفاده کنید' : undefined}>
                  {c.title_fa || c.title}
                  {c.title_fa && c.title && <span className="block text-[9px] font-normal text-slate-400" dir="ltr">{c.title}</span>}
                </th>
              ))}
              <th className="border border-slate-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">جمع</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              let total = 0;
              const cells = cats.map((c) => {
                const v = valueMap.get(`${s.id}:${c.id}`);
                if (v != null) total += v;
                return { c, v };
              });
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="sticky start-0 z-10 border border-slate-200 bg-white px-3 py-1.5">
                    <span className="font-medium text-blue-700">{s.project_name}</span>
                    <span className="block text-[11px] text-slate-400">{formatJalali(s.report_date)}</span>
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
                  <td className="border border-slate-200 bg-blue-50/50 px-3 py-1.5 text-center font-bold text-blue-900">{total ? fmtNum(total, 2) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="py-8 text-center text-sm text-slate-400">دوره‌ای یافت نشد</div>}
      </div>

      <Modal open={addCatOpen} onClose={() => setAddCatOpen(false)} title="افزودن دسته پیمانکار">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="عنوان لاتین (slug)"><input dir="ltr" className={inputCls} value={catForm.title} onChange={(e) => setCatForm({ ...catForm, title: e.target.value })} placeholder="e.g. waterproofing" /></Field>
          <Field label="عنوان فارسی"><input className={inputCls} value={catForm.title_fa} onChange={(e) => setCatForm({ ...catForm, title_fa: e.target.value })} /></Field>
          <Field label="ترتیب نمایش"><input type="number" dir="ltr" className={inputCls} value={catForm.display_order} onChange={(e) => setCatForm({ ...catForm, display_order: e.target.value })} /></Field>
        </div>
        <div className="mt-4"><Button onClick={addCategory} disabled={busy} className="!bg-blue-700 hover:!bg-blue-800">ذخیره دسته</Button></div>
      </Modal>

      {isAdmin && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {[...catList].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)).map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600">
              {c.title_fa || c.title}
              <Badge tone="slate">{c.display_order ?? '—'}</Badge>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
