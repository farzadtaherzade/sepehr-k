'use client';

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type ColGroupDef,
  type GridApi,
  type GridOptions,
  type GridReadyEvent,
} from 'ag-grid-community';
import { faLocaleText, gridTheme } from './grid-setup';

ModuleRegistry.registerModules([AllCommunityModule]);

export interface GridProps<T> {
  columnDefs: (ColDef<T> | ColGroupDef<T>)[];
  rowData: T[] | null;
  loading?: boolean;
  gridOptions?: GridOptions<T>;
  /** height class, default h-[70vh] */
  heightClass?: string;
  onGridReady?: (api: GridApi<T>) => void;
  onCellEdited?: (row: T, colId: string, newValue: unknown, api: GridApi<T>) => void;
  pageSize?: number;
}

export function DataGrid<T extends { id?: number | string }>({
  columnDefs,
  rowData,
  loading,
  gridOptions,
  heightClass = 'h-[70vh]',
  onGridReady,
  onCellEdited,
  pageSize = 50,
}: GridProps<T>) {
  const apiRef = useRef<GridApi<T> | null>(null);
  const [ready, setReady] = useState(false);

  const handleReady = useCallback(
    (e: GridReadyEvent<T>) => {
      apiRef.current = e.api;
      setReady(true);
      onGridReady?.(e.api);
    },
    [onGridReady]
  );

  useEffect(() => {
    if (ready && apiRef.current) onGridReady?.(apiRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const mergedOptions = useMemo<GridOptions<T>>(
    () => ({
      theme: gridTheme,
      localeText: faLocaleText,
      enableRtl: true,
      suppressDragLeaveHidesColumns: true,
      pagination: true,
      paginationPageSize: pageSize,
      paginationPageSizeSelector: [25, 50, 100, 500],
      rowSelection: undefined,
      defaultColDef: {
        resizable: true,
        sortable: true,
        filter: true,
        floatingFilter: false,
        minWidth: 90,
        headerClass: 'evm-header',
      },
      onCellValueChanged: (e) => {
        if (onCellEdited && e.colDef.field && e.data) {
          onCellEdited(e.data, String(e.colDef.field ?? e.colDef.colId ?? ''), e.value, e.api);
        }
      },
      ...gridOptions,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gridOptions, pageSize, onCellEdited]
  );

  return (
    <div className={`relative ${heightClass}`}>
      <AgGridReact<T>
        columnDefs={columnDefs}
        rowData={rowData ?? undefined}
        onGridReady={handleReady}
        {...mergedOptions}
      />
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
          <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-slate-600 shadow">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />
            در حال بارگذاری...
          </div>
        </div>
      )}
    </div>
  );
}

export type { ColDef };
