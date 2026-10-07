'use client';

import DatePicker, { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** ISO 'YYYY-MM-DD' → local Date for the picker. */
export function isoToDate(iso?: string | null): Date | undefined {
  if (!iso) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Picker value (Date | DateObject) → ISO date string (no timezone shifting). */
export function pickerValueToIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) {
    return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  }
  const d = v as { toDate?: () => Date };
  if (d.toDate) return pickerValueToIso(d.toDate());
  return null;
}

interface PickerProps {
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

/** Jalali (Persian) date picker bound to ISO Gregorian values. */
export function JalaliDatePicker({ value, onChange, disabled, className, placeholder }: PickerProps) {
  return (
    <DatePicker
      calendar={persian}
      locale={persian_fa}
      value={isoToDate(value)}
      onChange={(d) => onChange(pickerValueToIso(d))}
      disabled={disabled}
      calendarPosition="bottom-right"
      format="YYYY/MM/DD"
      placeholder={placeholder ?? '۱۴۰۴/۰۱/۰۱'}
      inputClass={
        className ??
        'evm-input w-full !ps-2 !pe-2 text-[13px] bg-white border border-slate-300 rounded-lg h-9 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100'
      }
      editable
    />
  );
}

export { DateObject };
