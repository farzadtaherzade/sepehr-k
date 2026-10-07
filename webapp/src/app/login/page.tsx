'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui-providers';
import { Spinner } from '@/components/ui';

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ must_change_password: boolean }>('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      });
      if (res.must_change_password) {
        router.push('/change-password');
      } else {
        router.push('/');
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'خطا در برقراری ارتباط با سرور';
      setError(msg);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen bg-[#EEF2F7]">
      {/* form column — first in DOM, lands on the right in RTL */}
      <div className="flex w-full items-center justify-center p-4 lg:w-[60%]">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5"
        >
          <div className="mb-5">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-blue-700 text-white">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 3v18h18" />
                <path d="M7 15l4-5 3 3 5-7" />
              </svg>
            </div>
            <h1 className="text-lg font-extrabold text-slate-900">سامانه مدیریت داده‌های پروژه</h1>
            <p className="mt-1 text-[13px] font-medium text-slate-500">گزارش‌های دوره‌ای و شاخص‌های EVM</p>
          </div>

          <label className="mb-3 block">
            <span className="mb-1 block text-[13px] font-medium text-slate-700">نام کاربری</span>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputCls}
              autoComplete="username"
              dir="ltr"
            />
          </label>
          <label className="mb-4 block">
            <span className="mb-1 block text-[13px] font-medium text-slate-700">رمز عبور</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              autoComplete="current-password"
              dir="ltr"
            />
          </label>

          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
          >
            {busy && <Spinner className="h-4 w-4 !border-white" />}
            ورود به سامانه
          </button>
        </form>
      </div>

      {/* brand column — visually secondary (left in RTL), hidden below lg */}
      <div className="relative hidden w-[40%] flex-col justify-center overflow-hidden bg-[linear-gradient(180deg,#0b1f3a,#081428)] p-10 lg:flex xl:p-14">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-72 w-full opacity-[0.07]"
          viewBox="0 0 480 240"
          fill="none"
          preserveAspectRatio="none"
        >
          <rect x="24" y="170" width="30" height="70" fill="white" />
          <rect x="76" y="140" width="30" height="100" fill="white" />
          <rect x="128" y="155" width="30" height="85" fill="white" />
          <rect x="180" y="110" width="30" height="130" fill="white" />
          <rect x="232" y="125" width="30" height="115" fill="white" />
          <rect x="284" y="80" width="30" height="160" fill="white" />
          <rect x="336" y="95" width="30" height="145" fill="white" />
          <rect x="388" y="55" width="30" height="185" fill="white" />
          <polyline
            points="39,160 91,130 143,145 195,100 247,115 299,70 351,85 403,45"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points="39,205 91,195 143,185 195,180 247,165 299,155 351,140 403,130"
            stroke="white"
            strokeWidth="1.5"
            strokeDasharray="5 5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <div className="relative">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-700 text-white">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 3v18h18" />
              <path d="M7 15l4-5 3 3 5-7" />
            </svg>
          </div>
          <h2 className="text-[22px] font-extrabold leading-9 text-white">سامانه مدیریت داده‌های پروژه</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">گزارش‌های دوره‌ای و شاخص‌های EVM</p>
        </div>
      </div>
    </main>
  );
}
