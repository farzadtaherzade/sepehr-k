#!/usr/bin/env python3
"""Generate a synthetic 'Master Database' Excel file that mimics the real wide
sheet (83 columns): Persian headers, REV0-REV3 amount/duration, extensions,
periodic snapshots with progress/EVM metrics, and ~17 contractor headcount
columns. Used for testing migrate.py end-to-end before the real file exists.

Usage: python make_sample_excel.py [output.xlsx]
"""
import sys
from pathlib import Path

import pandas as pd

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent / "sample_master_database.xlsx")

projects = [
    "برج مسکونی نگین", "مجتمع تجاری آپادانا", "برج اداری الماس",
]

trades = [
    "تجهیز کارگاه", "تخریب", "گودبرداری", "پایدارسازی", "اسکلت بتنی",
    "اسکلت فلزی", "سفت کاری", "ایزولاسیون", "تاسیسات برقی زیرکار",
    "تاسیسات مکانیکی زیرکار", "نازک کاری", "نما", "کاشی کاری", "درب و پنجره",
    "نقاشی", "برق نهایی", "مکانیک نهایی",
]

rows = []
for pi, pname in enumerate(projects):
    start = f"140{(1 + pi) % 10}/0{1 + pi}/15"
    for month in range(1, 5):  # 4 periodic reports per project
        row = {}
        row["نام پروژه"] = pname
        row["تاریخ شروع قرارداد"] = start
        for rev in range(4):
            row[f"مبلغ REV{rev}"] = (500 + rev * 120 + pi * 40) * 1e9
            row[f"مدت REV{rev}"] = 720 + rev * 60
        for ext in range(1, 3):
            row[f"تمدید {ext}"] = 90 * ext
        row["REV0"] = rev if (rev := month) else 0
        row["تاریخ گزارش"] = f"140{2 + pi}/0{month + 1}/30"
        row["پیشرفت فیزیکی واقعی"] = 0.12 * month + 0.05 * pi
        row["پیشرفت فیزیکی برنامه"] = 0.15 * month
        row["پیشرفت ریالی واقعی"] = 0.10 * month + 0.04 * pi
        row["پیشرفت ریالی برنامه"] = 0.14 * month
        row["روز سپری شده"] = 30 * month
        row["پیشرفت زمانی"] = 0.08 * month
        row["پرداختی ناخالص"] = (80 + 20 * month) * 1e9
        row["پرداختی خالص"] = (70 + 18 * month) * 1e9
        row["هزینه واقعی"] = (60 + 15 * month) * 1e9
        row["سربار"] = (10 + 2 * month) * 1e9
        row["ماشین آلات"] = (5 + month) * 1e9
        row["تعهدات"] = (20 + 3 * month) * 1e9
        row["درآمد"] = (90 + 22 * month) * 1e9
        row["تولید"] = (85 + 20 * month) * 1e9
        row["PV"] = (100 + 25 * month) * 1e9
        row["EV"] = (95 + 20 * month + 5 * pi) * 1e9
        row["SPI"] = round((95 + 20 * month) / (100 + 25 * month), 3)
        row["CPI"] = round((95 + 20 * month) / (60 + 15 * month), 3)
        for ti, trade in enumerate(trades):
            row[f"پرسنل پیمانکار - {trade}"] = max(0, 12 - ti + month + pi * 2)
        rows.append(row)

df = pd.DataFrame(rows)
df.to_excel(OUT, sheet_name="Master Database", index=False)
print(f"Wrote {OUT}  shape={df.shape}")
