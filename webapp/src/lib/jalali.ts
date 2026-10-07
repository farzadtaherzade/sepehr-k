import jalaali from 'jalaali-js';
import { toFaDigits, faToEn } from './digits';

export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

export interface JDate { jy: number; jm: number; jd: number }

/** 'YYYY-MM-DD' (or Date) → Jalali parts. Date objects are taken as local dates. */
export function isoToJalali(iso: string | Date | null | undefined): JDate | null {
  if (!iso) return null;
  let gy: number, gm: number, gd: number;
  if (iso instanceof Date) {
    gy = iso.getFullYear(); gm = iso.getMonth() + 1; gd = iso.getDate();
  } else {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return null;
    gy = Number(m[1]); gm = Number(m[2]); gd = Number(m[3]);
  }
  try {
    return jalaali.toJalaali(gy, gm, gd);
  } catch {
    return null;
  }
}

/** Jalali parts → 'YYYY-MM-DD' Gregorian (stored form). */
export function jalaliToIso(jy: number, jm: number, jd: number): string | null {
  if (!jalaali.isValidJalaaliDate(jy, jm, jd)) return null;
  const g = jalaali.toGregorian(jy, jm, jd);
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Format an ISO date as Jalali: '۱۴۰۴/۰۸/۱۵' (Persian digits by default)
 * or long form: '۱۵ آبان ۱۴۰۴'. Empty → ''.
 */
export function formatJalali(
  iso: string | Date | null | undefined,
  opts?: { digits?: 'fa' | 'en'; long?: boolean }
): string {
  const j = isoToJalali(iso);
  if (!j) return '';
  const fa = (opts?.digits ?? 'fa') === 'fa';
  const d = (x: number) => (fa ? toFaDigits(pad2(x)) : pad2(x));
  const y = fa ? toFaDigits(j.jy) : String(j.jy);
  if (opts?.long) return `${d(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${y}`;
  return `${y}/${d(j.jm)}/${d(j.jd)}`;
}

/** Parse a user-typed Jalali date ('۱۴۰۴/۰۷/۱۴', '1404-7-14', …) → 'YYYY-MM-DD'. */
export function parseJalaliString(input: string): string | null {
  const s = faToEn(input.trim()).replace(/[.\-/\\ ]+/g, '/');
  const m = /^(\d{3,4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (!m) return null;
  return jalaliToIso(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** Timestamp (timestamptz string) → '۱۴۰۴/۰۸/۱۵ ۱۳:۴۵' in Asia/Tehran. */
export function formatJalaliDateTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const j = isoToJalali(`${get('year')}-${get('month')}-${get('day')}`);
  if (!j) return '';
  return `${toFaDigits(j.jy)}/${toFaDigits(pad2(j.jm))}/${toFaDigits(pad2(j.jd))} - ${toFaDigits(get('hour'))}:${toFaDigits(get('minute'))}`;
}

/** Today's date as ISO (Tehran). */
export function todayIso(): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
  return p; // en-CA gives YYYY-MM-DD
}
