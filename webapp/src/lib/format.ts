import { faToEn } from './digits';

/** Parse a numeric user input (Persian or Latin digits, Persian/Latin separators) → number | null */
export function parseNumInput(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = faToEn(String(v)).trim();
  if (!s) return null;
  s = s.replace(/[٬,\s]/g, ''); // Persian + Latin thousand separators
  s = s.replace('٫', '.');      // Persian decimal separator
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Money (Rial) → '19,192,623,299' — Latin digits, thousands separators. */
export function fmtMoney(v: unknown): string {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return '';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Plain number → '17.37' */
export function fmtNum(v: unknown, decimals = 2): string {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return '';
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

/** Fraction (0.4520) → '45.2%' — progress/rate columns are stored as fractions. */
export function fmtPct(v: unknown, decimals = 2): string {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return '';
  return `${(n * 100).toLocaleString('en-US', { maximumFractionDigits: decimals })}٪`;
}

/** Ratio (SPI/CPI/…) → '0.89' */
export function fmtRatio(v: unknown, decimals = 2): string {
  return fmtNum(v, decimals);
}

/** Compact money for cards: ۱۹.۲ میلیارد */
export function fmtMoneyCompact(v: unknown): string {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toLocaleString('en-US', { maximumFractionDigits: 1 })} میلیارد`;
  if (abs >= 1e6) return `${(n / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })} میلیون`;
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
