'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui-providers';

export default function ChangePasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError('تکرار رمز عبور جدید مطابقت ندارد');
      return;
    }
    setBusy(true);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      toast('رمز عبور با موفقیت تغییر کرد', 'success');
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در برقراری ارتباط');
      setBusy(false);
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100';

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#EEF2F7] p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
        <h1 className="mb-1 text-lg font-extrabold text-slate-900">تغییر رمز عبور</h1>
        <p className="mb-5 text-[13px] text-slate-500">
          برای ادامه باید رمز عبور حساب خود را تغییر دهید.
        </p>
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            type="password" placeholder="رمز عبور فعلی" value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)} className={inputCls} autoComplete="current-password" dir="ltr"
          />
          <input
            type="password" placeholder="رمز عبور جدید (حداقل ۸ نویسه)" value={newPassword}
            onChange={(e) => setNew(e.target.value)} className={inputCls} autoComplete="new-password" dir="ltr"
          />
          <input
            type="password" placeholder="تکرار رمز عبور جدید" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} className={inputCls} autoComplete="new-password" dir="ltr"
          />
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
          <button
            type="submit" disabled={busy}
            className="h-11 w-full rounded-lg bg-blue-700 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
          >
            ذخیره رمز عبور جدید
          </button>
        </form>
      </div>
    </main>
  );
}
