'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Modal, PageHeader, Select, inputCls } from '@/components/ui';
import { useToast, useConfirm } from '@/components/ui-providers';
import { api, ApiError } from '@/lib/api-client';
import { formatJalaliDateTime } from '@/lib/jalali';
import type { AppUser, Role } from '@/lib/types';

const roleFa: Record<Role, string> = { admin: 'مدیر', editor: 'ویرایشگر', viewer: 'بازدیدکننده' };
const roleTone: Record<Role, 'red' | 'teal' | 'slate'> = { admin: 'red', editor: 'teal', viewer: 'slate' };

export function UsersClient({ currentUid }: { currentUid: number }) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [resetUser, setResetUser] = useState<AppUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ username: '', full_name: '', role: 'viewer' as Role, password: '' });
  const [resetPassword, setResetPassword] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api<{ users: AppUser[] }>('/api/users');
      setUsers(res.users);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'خطا در دریافت کاربران', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function addUser() {
    setBusy(true);
    try {
      await api('/api/users', { method: 'POST', body: form });
      toast('کاربر ایجاد شد؛ کاربر در ورود اول باید رمز خود را تغییر دهد', 'success');
      setAddOpen(false);
      setForm({ username: '', full_name: '', role: 'viewer', password: '' });
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'خطا در ایجاد کاربر', 'error');
    } finally { setBusy(false); }
  }

  async function patchUser(u: AppUser, body: Record<string, unknown>, message: string) {
    try {
      await api(`/api/users/${u.id}`, { method: 'PATCH', body });
      toast(message, 'success');
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'خطا', 'error');
    }
  }

  async function toggleActive(u: AppUser) {
    const target = !u.is_active;
    const ok = await confirm(target ? `حساب ${u.username} فعال شود؟` : `دسترسی حساب ${u.username} قطع شود؟`);
    if (!ok) return;
    await patchUser(u, { is_active: target }, 'وضعیت حساب تغییر کرد');
  }

  async function doResetPassword() {
    if (!resetUser) return;
    setBusy(true);
    try {
      await api(`/api/users/${resetUser.id}`, { method: 'PATCH', body: { password: resetPassword } });
      toast('رمز عبور بازنشانی شد؛ کاربر در ورود بعدی باید رمز جدید تنظیم کند', 'success');
      setResetUser(null);
      setResetPassword('');
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'خطا در بازنشانی', 'error');
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="مدیریت کاربران"
        subtitle="ساخت حساب، تعیین نقش و بازنشانی رمز عبور"
        actions={<Button onClick={() => setAddOpen(true)}>+ کاربر جدید</Button>}
      />

      <div className="evm-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-[11px] text-slate-500">
              <th className="px-4 py-2.5 text-right font-medium">نام کاربری</th>
              <th className="px-4 py-2.5 text-right font-medium">نام و نام خانوادگی</th>
              <th className="px-4 py-2.5 text-right font-medium">نقش</th>
              <th className="px-4 py-2.5 text-right font-medium">وضعیت</th>
              <th className="px-4 py-2.5 text-right font-medium">آخرین ورود</th>
              <th className="px-4 py-2.5 text-right font-medium">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-700" dir="ltr">{u.username}</td>
                <td className="px-4 py-2.5 text-slate-600">{u.full_name || '—'}</td>
                <td className="px-4 py-2.5">
                  {u.id === currentUid ? (
                    <Badge tone={roleTone[u.role]}>{roleFa[u.role]}</Badge>
                  ) : (
                    <select
                      value={u.role}
                      onChange={(e) => void patchUser(u, { role: e.target.value }, 'نقش کاربر تغییر کرد')}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      <option value="admin">مدیر</option>
                      <option value="editor">ویرایشگر</option>
                      <option value="viewer">بازدیدکننده</option>
                    </select>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={u.is_active ? 'green' : 'red'}>{u.is_active ? 'فعال' : 'غیرفعال'}</Badge>
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{u.last_login_at ? formatJalaliDateTime(u.last_login_at) : '—'}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1.5">
                    <Button variant="secondary" className="!h-8 !px-2.5 !text-xs" onClick={() => { setResetUser(u); setResetPassword(''); }}>
                      بازنشانی رمز
                    </Button>
                    {u.id !== currentUid && (
                      <Button
                        variant={u.is_active ? 'danger' : 'primary'}
                        className="!h-8 !px-2.5 !text-xs"
                        onClick={() => void toggleActive(u)}
                      >
                        {u.is_active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="ایجاد کاربر جدید">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="نام کاربری (لاتین)">
            <input dir="ltr" className={inputCls} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </Field>
          <Field label="نام و نام خانوادگی">
            <input className={inputCls} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </Field>
          <Field label="نقش">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="viewer">بازدیدکننده (فقط مشاهده)</option>
              <option value="editor">ویرایشگر (ثبت و ویرایش داده)</option>
              <option value="admin">مدیر (کامل)</option>
            </Select>
          </Field>
          <Field label="رمز عبور اولیه (حداقل ۸ نویسه)">
            <input dir="ltr" type="text" className={inputCls} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          رمز عبور اولیه فقط برای ورود اول است؛ کاربر مجبور به تغییر آن خواهد شد.
        </p>
        <div className="mt-4"><Button onClick={addUser} disabled={busy} className="!bg-blue-700 hover:!bg-blue-800">ایجاد کاربر</Button></div>
      </Modal>

      <Modal open={!!resetUser} onClose={() => setResetUser(null)} title={`بازنشانی رمز عبور — ${resetUser?.username ?? ''}`}>
        <Field label="رمز عبور جدید (حداقل ۸ نویسه)">
          <input dir="ltr" className={inputCls} value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} />
        </Field>
        <p className="mt-3 text-xs text-slate-400">کاربر در ورود بعدی باید این رمز را عوض کند.</p>
        <div className="mt-4"><Button onClick={doResetPassword} disabled={busy} className="!bg-blue-700 hover:!bg-blue-800">بازنشانی</Button></div>
      </Modal>
    </div>
  );
}
