import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

export interface TablePaginationBarProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalRowCount: number;
  filteredRowCount: number;
  selectedRowCount: number;
  onPageChange: (page: number | ((prev: number) => number)) => void;
  onPageSizeChange: (size: number) => void;
}

export const TablePaginationBar: React.FC<TablePaginationBarProps> = ({
  currentPage,
  totalPages,
  pageSize,
  totalRowCount,
  filteredRowCount,
  selectedRowCount,
  onPageChange,
  onPageSizeChange,
}) => {
  const startRow = filteredRowCount > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endRow = Math.min(currentPage * pageSize, filteredRowCount);

  return (
    <div className="p-2.5 bg-surface-container-low flex items-center justify-between gap-3 flex-wrap text-on-surface-variant font-code-sm text-xs border-t rounded-lg border-surface-container-high/60">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <span>Showing</span>
          <span className="text-on-surface font-semibold">
            {startRow} - {endRow}
          </span>
          <span>of</span>
          <span className="text-primary font-semibold">
            {filteredRowCount.toLocaleString()}
          </span>
          <span>filtered rows</span>
          <span className="text-on-surface-variant/60">
            (Total: {totalRowCount.toLocaleString()})
          </span>
        </div>
        <div className="h-3 w-px bg-surface-container-highest" />
        <div className="flex items-center gap-1.5">
          <span className="text-on-surface font-medium">
            {selectedRowCount > 0
              ? `${selectedRowCount} baris dipilih`
              : '0 baris dipilih'}
          </span>
        </div>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <span>Page</span>
          <span className="text-on-surface font-semibold">{currentPage}</span>
          <span>of</span>
          <span>{totalPages}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={currentPage <= 1}
            className="p-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant disabled:opacity-40 cursor-pointer"
            title="Halaman pertama"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onPageChange((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant disabled:opacity-40 cursor-pointer"
            title="Halaman sebelumnya"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <span className="px-2.5 py-0.5 rounded bg-primary text-on-primary font-semibold text-xs">
            {currentPage}
          </span>

          <button
            type="button"
            onClick={() => onPageChange((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="p-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant disabled:opacity-40 cursor-pointer"
            title="Halaman berikutnya"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage >= totalPages}
            className="p-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant disabled:opacity-40 cursor-pointer"
            title="Halaman terakhir"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-3 w-px bg-surface-container-highest" />

        <div className="flex items-center gap-1">
          <span>Limit:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-surface-container-lowest text-on-surface font-code-sm text-xs rounded px-1.5 py-0.5 focus:outline-none border border-surface-container-high cursor-pointer"
          >
            <option value="10">10 rows</option>
            <option value="25">25 rows</option>
            <option value="50">50 rows</option>
            <option value="100">100 rows</option>
          </select>
        </div>
      </div>
    </div>
  );
};
