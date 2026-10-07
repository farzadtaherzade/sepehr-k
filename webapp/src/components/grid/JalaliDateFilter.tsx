'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { IDoesFilterPassParams } from 'ag-grid-community';
import DatePicker from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { isoToDate, pickerValueToIso } from '@/components/jalali/JalaliDatePicker';

export interface JalaliDateModel {
  filterType: 'jalaliDate';
  from: string | null;
  to: string | null;
}

interface Props {
  colDef: { field?: string };
  filterChangedCallback: () => void;
}

/** Methods AG Grid calls on the ref (the React adapter supplies the DOM part). */
export interface JalaliFilterHandle {
  doesFilterPass(params: IDoesFilterPassParams): boolean;
  isFilterActive(): boolean;
  getModel(): JalaliDateModel | null;
  setModel(model: JalaliDateModel | null): void;
}

/**
 * Custom AG Grid filter with two Persian-calendar pickers (از / تا).
 * Grid values must be ISO 'YYYY-MM-DD' strings.
 */
export const JalaliDateFilter = forwardRef<JalaliFilterHandle, Props>(function JalaliDateFilter(props, ref) {
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);

  useEffect(() => {
    if (from || to) props.filterChangedCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  useImperativeHandle(
    ref,
    () => ({
      doesFilterPass(params) {
        const field = String(props.colDef.field ?? '');
        const v = params.data?.[field];
        if (!v) return false;
        const s = String(v).slice(0, 10);
        if (from && s < from) return false;
        if (to && s > to) return false;
        return true;
      },
      isFilterActive() {
        return Boolean(from || to);
      },
      getModel() {
        return from || to ? { filterType: 'jalaliDate', from, to } : null;
      },
      setModel(model: JalaliDateModel | null) {
        setFrom(model?.from ?? null);
        setTo(model?.to ?? null);
      },
    }),
    [from, to, props]
  );

  const inputCls =
    'evm-input w-full text-[12px] bg-white border border-slate-300 rounded-md h-8 outline-none focus:border-blue-700';

  return (
    <div dir="rtl" className="flex flex-col gap-2 p-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-500 w-8 shrink-0">از</span>
        <DatePicker
          calendar={persian}
          locale={persian_fa}
          value={isoToDate(from)}
          onChange={(d) => setFrom(pickerValueToIso(d))}
          calendarPosition="bottom-right"
          placeholder="از تاریخ"
          inputClass={inputCls}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-500 w-8 shrink-0">تا</span>
        <DatePicker
          calendar={persian}
          locale={persian_fa}
          value={isoToDate(to)}
          onChange={(d) => setTo(pickerValueToIso(d))}
          calendarPosition="bottom-right"
          placeholder="تا تاریخ"
          inputClass={inputCls}
        />
      </div>
      <button
        type="button"
        onClick={() => { setFrom(null); setTo(null); props.filterChangedCallback(); }}
        className="self-start rounded-md bg-slate-100 hover:bg-slate-200 px-3 py-1 text-[12px] text-slate-700"
      >
        پاک‌سازی فیلتر
      </button>
    </div>
  );
});
