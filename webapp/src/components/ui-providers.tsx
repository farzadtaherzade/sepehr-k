'use client';

import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react';

/* ---------------- Toasts ---------------- */

type ToastTone = 'success' | 'error' | 'info';
interface Toast { id: number; tone: ToastTone; text: string }

const ToastCtx = createContext<{ toast: (text: string, tone?: ToastTone) => void }>({ toast: () => {} });
export const useToast = () => useContext(ToastCtx);

/* ---------------- Confirm dialog ---------------- */

interface ConfirmState {
  message: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}
const ConfirmCtx = createContext<{ confirm: (message: string, danger?: boolean) => Promise<boolean> }>({
  confirm: async () => false,
});
export const useConfirm = () => useContext(ConfirmCtx);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((text: string, tone: ToastTone = 'info') => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const confirm = useCallback(
    (message: string, danger = false) =>
      new Promise<boolean>((resolve) => setConfirmState({ message, danger, resolve })),
    []
  );

  const close = (ok: boolean) => {
    confirmState?.resolve(ok);
    setConfirmState(null);
  };

  return (
    <ToastCtx.Provider value={{ toast }}>
      <ConfirmCtx.Provider value={{ confirm }}>
        {children}

        {/* toasts */}
        <div className="fixed bottom-4 left-4 z-[100] flex flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className={`rounded-xl px-4 py-3 text-sm shadow-lg border max-w-sm ${
                t.tone === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : t.tone === 'error'
                    ? 'bg-red-50 border-red-300 text-red-800'
                    : 'bg-slate-50 border-blue-200 text-slate-800'
              }`}
            >
              {t.text}
            </div>
          ))}
        </div>

        {/* confirm dialog */}
        {confirmState && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => close(false)}>
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm text-slate-800 leading-7">{confirmState.message}</p>
              <div className="mt-4 flex justify-start gap-2">
                <button
                  onClick={() => close(true)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${confirmState.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-700 hover:bg-blue-800'}`}
                >
                  تأیید
                </button>
                <button onClick={() => close(false)} className="rounded-lg px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700">
                  انصراف
                </button>
              </div>
            </div>
          </div>
        )}
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}
