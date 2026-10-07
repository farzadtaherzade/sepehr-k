'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui-providers';
import type { Role } from '@/lib/types';

interface NavItem { href: string; label: string; icon: React.ReactNode; adminOnly?: boolean }

const icons = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  projects: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  snapshots: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M3 14h18M9 4v16M15 4v16" />
    </svg>
  ),
  headcount: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c.5-3.5 2.7-5.5 5.5-5.5s5 2 5.5 5.5" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.4" /><path d="M16 14.8c2.6.2 4 1.9 4.5 4.2" strokeLinecap="round" />
    </svg>
  ),
  users: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.5" /><path d="M5 20c.7-4 3.4-6 7-6s6.3 2 7 6" strokeLinecap="round" />
    </svg>
  ),
  audit: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 8v4l2.5 2.5" strokeLinecap="round" /><circle cx="12" cy="12" r="9" />
    </svg>
  ),
};

const NAV: NavItem[] = [
  { href: '/', label: 'داشبورد', icon: icons.dashboard },
  { href: '/projects', label: 'پروژه‌ها', icon: icons.projects },
  { href: '/snapshots', label: 'گزارش‌های دوره‌ای', icon: icons.snapshots },
  { href: '/headcount', label: 'نیروی انسانی', icon: icons.headcount },
  { href: '/admin/users', label: 'مدیریت کاربران', icon: icons.users, adminOnly: true },
  { href: '/admin/audit', label: 'گزارش تغییرات', icon: icons.audit, adminOnly: true },
];

const roleFa: Record<Role, string> = { admin: 'مدیر', editor: 'ویرایشگر', viewer: 'بازدیدکننده' };

const SIDEBAR_BG = 'bg-[linear-gradient(180deg,#0b1f3a_0%,#081428_100%)]';

export function Shell({ user, children }: { user: { name: string; username: string; role: Role }; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      toast('خطا در خروج از حساب', 'error');
    }
    router.push('/login');
    router.refresh();
  }

  const nav = NAV.filter((n) => !n.adminOnly || user.role === 'admin');

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');

  const pageTitle =
    NAV.find((n) => (n.href === '/' ? pathname === '/' : pathname === n.href || pathname.startsWith(n.href + '/')))
      ?.label ?? '';

  const initials = user.name.trim().charAt(0);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-slate-800/60 px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-700 text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3v18h18" strokeLinecap="round" /><path d="M7 15l4-5 3 3 5-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <div className="text-sm font-extrabold text-white">سامانه EVM</div>
          <div className="text-[11px] text-slate-400">مدیریت داده‌های پروژه</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition ${
                active ? 'bg-[#1b3a66] font-semibold text-white' : 'text-slate-300 hover:bg-[#12294d] hover:text-white'
              }`}
            >
              {item.icon}
              {item.label}
              {active && <span aria-hidden="true" className="absolute bottom-1 right-0 top-1 w-0.5 rounded-full bg-[#5B8DEF]" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* desktop sidebar (right side in RTL) */}
      <aside className={`sticky top-0 hidden h-screen w-60 shrink-0 md:block ${SIDEBAR_BG}`}>{sidebar}</aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* topbar: fixed on mobile (hosting the hamburger), sticky on desktop */}
        <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 md:sticky md:px-6">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 md:hidden"
              aria-label="منو"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              </svg>
            </button>
            <div className="truncate text-[15px] font-bold text-slate-900">{pageTitle}</div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <div
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-[12px] font-bold text-blue-700"
            >
              {initials}
            </div>
            <div className="hidden min-w-0 flex-col leading-tight sm:flex">
              <span className="truncate text-[13px] font-semibold text-slate-800">{user.name}</span>
              <span className="truncate text-[11px] text-slate-400">{roleFa[user.role]}</span>
            </div>
            <button
              onClick={logout}
              title="خروج از حساب"
              aria-label="خروج از حساب"
              className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 17l-5-5 5-5M5 12h11" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 pb-8 pt-[72px] md:px-6 md:pt-6">{children}</main>
      </div>

      {/* mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMenuOpen(false)}>
          <aside className={`absolute top-14 h-[calc(100%-3.5rem)] w-60 pt-2 ${SIDEBAR_BG}`}>{sidebar}</aside>
        </div>
      )}
    </div>
  );
}
