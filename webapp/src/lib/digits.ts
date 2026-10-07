const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Convert Persian/Arabic digits to Latin — used before parsing any user input. */
export function faToEn(s: string): string {
  return s.replace(/[۰-۹٠-٩]/g, (d) => {
    const f = FA_DIGITS.indexOf(d);
    if (f > -1) return String(f);
    return String(AR_DIGITS.indexOf(d));
  });
}

/** Convert Latin digits to Persian — used for date display only. */
export function toFaDigits(s: string | number): string {
  return String(s).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}
