'use client';

import type { ColDef, ColGroupDef } from 'ag-grid-community';
import { fmtMoney, fmtNum, fmtPct, fmtRatio, parseNumInput } from '@/lib/format';
import { formatJalali } from '@/lib/jalali';
import type { Snapshot } from '@/lib/types';

export interface ColFactoryOpts {
  editable: boolean;
}

const pct = (field: keyof Snapshot, header: string, editable: boolean): ColDef<Snapshot> => ({
  headerName: header,
  field,
  valueGetter: (p) => {
    const v = p.data?.[field];
    return v == null || v === '' ? null : Number(v) * 100;
  },
  valueSetter: (p) => {
    if (!p.data) return false;
    const n = parseNumInput(p.newValue);
    (p.data[field] as unknown) = n == null ? null : n / 100;
    return true;
  },
  valueFormatter: (p) => (p.value == null ? '' : fmtPct(p.value / 100)),
  editable,
  filter: 'agNumberColumnFilter',
  filterParams: { inRangeInclusive: true, maxNumConditions: 2 },
  cellEditor: 'agNumberCellEditor',
  cellEditorParams: { step: 'any' },
  cellClassRules: {
    'evm-cell-null': (p) => p.value == null,
  },
  type: 'rightAligned',
  width: 132,
});

const money = (field: keyof Snapshot, header: string, editable: boolean): ColDef<Snapshot> => ({
  headerName: header,
  field,
  valueFormatter: (p) => fmtMoney(p.value),
  valueParser: (p) => parseNumInput(p.newValue),
  editable,
  filter: 'agNumberColumnFilter',
  filterParams: { inRangeInclusive: true, maxNumConditions: 2 },
  cellEditor: 'agNumberCellEditor',
  cellEditorParams: { step: 'any' },
  cellClassRules: { 'evm-cell-null': (p) => p.value == null },
  type: 'rightAligned',
  width: 150,
});

const ratio = (field: keyof Snapshot, header: string, editable: boolean, decimals = 2): ColDef<Snapshot> => ({
  headerName: header,
  field,
  valueFormatter: (p) => fmtRatio(p.value, decimals),
  valueParser: (p) => parseNumInput(p.newValue),
  editable,
  filter: 'agNumberColumnFilter',
  filterParams: { inRangeInclusive: true, maxNumConditions: 2 },
  cellEditor: 'agNumberCellEditor',
  cellEditorParams: { step: 'any' },
  cellClassRules: { 'evm-cell-null': (p) => p.value == null },
  type: 'rightAligned',
  width: 120,
});

const intCol = (field: keyof Snapshot, header: string, editable: boolean): ColDef<Snapshot> => ({
  headerName: header,
  field,
  editable,
  filter: 'agNumberColumnFilter',
  filterParams: { inRangeInclusive: true, maxNumConditions: 2 },
  valueParser: (p) => {
    const n = parseNumInput(p.newValue);
    return n == null ? null : Math.round(n);
  },
  cellClassRules: { 'evm-cell-null': (p) => p.value == null },
  type: 'rightAligned',
  width: 130,
});

/** Full Excel-like column set for project_snapshot. */
export function snapshotColumns(opts: ColFactoryOpts): (ColDef<Snapshot> | ColGroupDef<Snapshot>)[] {
  const ed = opts.editable;
  return [
    {
      headerName: 'پروژه',
      field: 'project_name',
      pinned: 'left',
      width: 150,
      filter: 'agSetColumnFilter',
      editable: false,
      cellRenderer: (p: { value?: string; data?: Snapshot }) =>
        p.data ? (
          <a href={`/projects/${p.data.project_id}`} className="text-blue-700 hover:underline font-medium">
            {p.value}
          </a>
        ) : (
          p.value
        ),
    },
    {
      headerName: 'تاریخ گزارش',
      field: 'report_date',
      pinned: 'left',
      width: 120,
      editable: false,
      filter: 'agDateColumnFilter',
      filterParams: { inRangeInclusive: true, maxNumConditions: 2 },
      valueFormatter: (p) => formatJalali(p.value),
      sort: 'desc',
      sortIndex: 0,
    },
    intCol('revision_no', 'ریوژن پایه', ed),

    /* ---- پیشرفت ---- */
    {
      headerName: 'پیشرفت',
      children: [
        pct('progress_physical_actual', 'فیزیکی واقعی', ed),
        pct('progress_physical_planned', 'فیزیکی برنامه', ed),
        pct('progress_rial_actual', 'ریالی واقعی', ed),
        pct('progress_rial_planned', 'ریالی برنامه', ed),
      ],
    },

    /* ---- زمان ---- */
    {
      headerName: 'زمان',
      children: [intCol('time_elapsed_days', 'روزهای سپری‌شده', ed), pct('time_progress_pct', 'پیشرفت زمان', ed)],
    },

    /* ---- مالی (ریال) ---- */
    {
      headerName: 'مالی (ریال)',
      children: [
        money('gross_payment', 'پرداخت ناخالص', ed),
        money('net_payment', 'پرداخت خالص', ed),
        money('actual_cost', 'هزینه واقعی (AC)', ed),
        money('overhead_cost', 'هزینه بالاسری', ed),
        money('equipment_cost', 'هزینه تجهیزات', ed),
        money('commitments', 'تعهدات', ed),
        money('revenue', 'درآمد', ed),
        money('production', 'تولید', ed),
        money('last_progress_statement', 'آخرین صورت‌وضعیت کارکرد', ed),
        money('last_adjustment_statement', 'آخرین صورت‌وضعیت تعدیل', ed),
      ],
    },

    /* ---- ارزش‌گذاری ---- */
    {
      headerName: 'ارزش‌گذاری',
      children: [
        money('pv', 'ارزش برنامه‌ای (PV)', ed),
        money('ev', 'ارزش کسب‌شده (EV)', ed),
        ratio('spi', 'SPI (زمان‌بند)', ed),
        ratio('cpi', 'CPI (هزینه)', ed),
      ],
    },

    /* ---- نسبت‌ها ---- */
    {
      headerName: 'نسبت‌ها و شاخص‌های تکمیلی',
      children: [
        ratio('revenue_to_cost_ratio', 'درآمد به هزینه', ed),
        ratio('overhead_to_production_ratio', 'بالاسری به تولید', ed),
        ratio('equipment_to_production_ratio', 'تجهیزات به تولید', ed),
        ratio('commitments_to_production_ratio', 'تعهدات به تولید', ed),
        pct('collection_rate', 'درصد وصول مطالبات', ed),
        {
          headerName: 'متوسط نیروی انسانی',
          field: 'avg_monthly_headcount',
          valueFormatter: (p) => fmtNum(p.value, 2),
          valueParser: (p) => parseNumInput(p.newValue),
          editable: ed,
          filter: 'agNumberColumnFilter',
          filterParams: { inRangeInclusive: true, maxNumConditions: 2 },
          cellClassRules: { 'evm-cell-null': (p) => p.value == null },
          type: 'rightAligned',
          width: 140,
        },
      ],
    },
  ];
}
