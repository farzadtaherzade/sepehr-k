'use client';

import { ReactNode, useEffect } from 'react';

/* ---------- Button ---------- */
type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export function Button({
  children, onClick, variant = 'primary', type = 'button', disabled, className = '', title,
}: {
  children: ReactNode; onClick?: () => void; variant?: BtnVariant; type?: 'button' | 'submit';
  disabled?: boolean; className?: string; title?: string;
}) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-blue-700 hover:bg-blue-800 text-white',
    secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    ghost: 'hover:bg-slate-100 text-slate-600',
  };
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 h-9 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/* ---------- Form fields ---------- */
export function Field({ label, children, error, className = '' }: { label: string; children: ReactNode; error?: string | null; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[13px] font-medium text-slate-600">{label}</span>
      {children}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </label>
  );
}

export const inputCls =
  'evm-input w-full text-[13px] bg-white border border-slate-300 rounded-lg h-9 px-2.5 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400';

/** Numeric inputs read LTR even in the RTL page. */
export const numInputCls = `${inputCls} !dir-ltr text-left`;

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input {...rest} className={`${props.type === 'number' ? numInputCls : inputCls} ${className}`} />;
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', ...rest } = props;
  return (
    <select {...rest} className={`${inputCls} ${className}`}>
      {children}
    </select>
  );
}

/* ---------- Card / Badge ---------- */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`evm-card ${className}`}>{children}</div>;
}

const badgeTones = {
  red: 'bg-red-50 text-red-700 border-red-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  teal: 'bg-sky-50 text-sky-700 border-sky-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
} as const;

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: keyof typeof badgeTones }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

/* ---------- Modal ---------- */
export function Modal({
  open, onClose, title, children, wide,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl shadow-xl border border-slate-200 w-full ${wide ? 'max-w-5xl' : 'max-w-2xl'} my-4`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="بستن">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Tabs ---------- */
export function Tabs({
  tabs, active, onChange,
}: { tabs: { id: string; label: string; badge?: ReactNode }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-slate-200 overflow-x-auto" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition ${
            active === t.id
              ? 'border-blue-700 text-blue-800 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {t.label}
          {t.badge != null && <span className="ms-1.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- misc ---------- */
export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-blue-700 border-t-transparent ${className}`} />;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
