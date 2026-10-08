import React from 'react';
import {
  Download,
  Trash2,
  Key,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Plus,
  Copy,
  Edit3,
  Table as TableIcon,
} from 'lucide-react';
import { TableMeta, TableRow } from '../../types/database';
import { TableFilterCondition } from './types';

export interface TableDataGridProps {
  tableData: TableMeta;
  paginatedRows: TableRow[];
  selectedRowIds: Set<string>;
  selectedRowId: string;
  headerCheckboxRef: React.RefObject<HTMLInputElement | null>;
  isAllCurrentSelected: boolean;
  sortColumn: string;
  sortDirection: 'ASC' | 'DESC';
  editingCell: { rowKey: string; colName: string } | null;
  editingCellValue: string;
  unsavedRowEdits: Record<string, { changes: Record<string, any> }>;
  pendingModifiedRowIds: Set<string>;
  pendingInsertedRowIds: Set<string>;
  pendingDeletedRowIds: Set<string>;
  getRowKey: (row: TableRow) => string;
  onToggleSelectAll: () => void;
  onToggleRowSelection: (row: TableRow, e: React.ChangeEvent<HTMLInputElement>) => void;
  onSort: (columnName: string) => void;
  onOpenAddColumnModal: () => void;
  onOpenInsertRowModal?: () => void;
  searchQuery?: string;
  filterConditions?: TableFilterCondition[];
  onSelectRow: (row: TableRow, openDrawer?: boolean) => void;
  onStartCellEdit: (row: TableRow, colName: string, val: any) => void;
  onCommitCellEdit: () => void;
  onCancelCellEdit: () => void;
  onEditingCellValueChange: (val: string) => void;
  onExportSelectedRows: () => void;
  onDeleteSelectedRows: () => void;
  onClearRowSelection: () => void;
  onJumpToTable?: (name: string) => void;
  onShowToast: (message: string, icon?: string, isError?: boolean) => void;
}

export const TableDataGrid: React.FC<TableDataGridProps> = ({
  tableData,
  paginatedRows,
  selectedRowIds,
  selectedRowId,
  headerCheckboxRef,
  isAllCurrentSelected,
  sortColumn,
  sortDirection,
  editingCell,
  editingCellValue,
  unsavedRowEdits,
  pendingModifiedRowIds,
  pendingInsertedRowIds,
  pendingDeletedRowIds,
  getRowKey,
  onToggleSelectAll,
  onToggleRowSelection,
  onSort,
  onOpenAddColumnModal,
  onOpenInsertRowModal,
  searchQuery = '',
  filterConditions = [],
  onSelectRow,
  onStartCellEdit,
  onCommitCellEdit,
  onCancelCellEdit,
  onEditingCellValueChange,
  onExportSelectedRows,
  onDeleteSelectedRows,
  onClearRowSelection,
  onJumpToTable,
  onShowToast,
}) => {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-surface-container-lowest rounded-xl shadow-md overflow-hidden border border-surface-container-high/60">
      {/* Bulk Action Bar when rows are selected */}
      {selectedRowIds.size > 0 && (
        <div
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
            borderColor: 'color-mix(in srgb, var(--color-primary) 28%, transparent)',
          }}
          className="px-3.5 py-2 border-b flex items-center justify-between gap-2 flex-wrap text-xs animate-in fade-in duration-150"
        >
          <div className="flex items-center gap-2">
            <span
              style={{
                backgroundColor: 'var(--color-primary)',
                color: 'var(--color-on-primary)',
              }}
              className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full font-bold text-[11px] shadow-xs"
            >
              {selectedRowIds.size}
            </span>
            <span className="font-semibold text-on-surface">baris dipilih</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExportSelectedRows}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-colors cursor-pointer border border-surface-container-highest text-xs font-medium"
              title="Export baris terpilih ke CSV"
            >
              <Download className="w-3.5 h-3.5 text-primary" />
              <span>Export CSV ({selectedRowIds.size})</span>
            </button>
            <button
              type="button"
              onClick={onDeleteSelectedRows}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-error/15 hover:bg-error/25 text-error transition-colors cursor-pointer border border-error/30 text-xs font-semibold"
              title="Hapus baris terpilih dari database"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus ({selectedRowIds.size})</span>
            </button>
            <button
              type="button"
              onClick={onClearRowSelection}
              className="px-2 py-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer text-xs"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      <div className="overflow-auto w-full max-h-[calc(100vh-14rem)] relative">
        <table className="w-full text-left border-collapse select-none min-w-full">
          <thead className="sticky top-0 z-20 bg-surface-container-low shadow-xs">
            <tr className="bg-surface-container-low text-on-surface-variant font-code-sm text-xs border-b border-surface-container-high/60 shadow-xs">
              <th className="w-10 px-3 py-2 text-center bg-surface-container-low sticky left-0 top-0 z-30">
                <input
                  ref={headerCheckboxRef as any}
                  type="checkbox"
                  checked={isAllCurrentSelected}
                  onChange={onToggleSelectAll}
                  className="theme-checkbox"
                  title={isAllCurrentSelected ? 'Batal pilih semua di halaman ini' : 'Pilih semua baris di halaman ini'}
                />
              </th>

              {(tableData?.columns || []).map((col) => {
                const isSorted = sortColumn === col.name;
                return (
                  <th
                    key={col.name}
                    onClick={() => onSort(col.name)}
                    className="px-3.5 py-2.5 font-semibold tracking-tight text-on-surface hover:bg-surface-container transition-colors cursor-pointer bg-surface-container-low sticky top-0 z-20 whitespace-nowrap min-w-[150px]"
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {col.isPk && (
                          <span title="Primary Key" className="inline-flex items-center shrink-0">
                            <Key className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400/25 shrink-0" />
                          </span>
                        )}
                        {col.isFk && (
                          <span
                            title={`Foreign Key${col.fkTarget ? `: ${col.fkTarget}` : ''}`}
                            className="inline-flex items-center shrink-0"
                          >
                            <Key className="w-3.5 h-3.5 text-slate-400 fill-slate-400/25 shrink-0" />
                          </span>
                        )}
                        <span className="font-code-md text-xs truncate">{col.name}</span>
                        <span className="px-1 py-0.2 rounded bg-surface-container-high text-on-surface-variant text-[10px] shrink-0 font-mono">
                          {col.type}
                        </span>
                      </div>
                      <div className="shrink-0 ml-1">
                        {isSorted && sortDirection === 'DESC' ? (
                          <ArrowDown className="w-3 h-3 text-primary font-bold" />
                        ) : isSorted && sortDirection === 'ASC' ? (
                          <ArrowUp className="w-3 h-3 text-primary font-bold" />
                        ) : (
                          <ChevronsUpDown className="w-3 h-3 text-on-surface-variant/40" />
                        )}
                      </div>
                    </div>
                  </th>
                );
              })}

              {(tableData?.columns || []).length === 0 && (
                <th className="px-4 py-2.5 text-on-surface-variant font-medium text-xs whitespace-nowrap">
                  Belum ada kolom terdefinisi
                </th>
              )}

              <th className="w-12 px-2 py-2 text-center sticky right-0 top-0 bg-surface-container-low z-30">
                <button
                  type="button"
                  onClick={onOpenAddColumnModal}
                  className="p-1 rounded hover:bg-surface-container-high text-primary hover:text-primary-fixed transition-colors cursor-pointer"
                  title="Insert New Column (ALTER TABLE)"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-surface-container-high/30 font-code-sm text-xs">
            {paginatedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(1, (tableData?.columns?.length || 0) + 2)}
                  className="py-16 px-6 text-center text-on-surface-variant text-xs"
                >
                  <div className="flex flex-col items-center justify-center gap-2.5 max-w-md mx-auto">
                    <div className="w-12 h-12 rounded-2xl bg-surface-container-high/80 border border-surface-container-highest flex items-center justify-center text-on-surface-variant/70 shadow-xs mb-1">
                      <TableIcon className="w-6 h-6 text-primary/80" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-on-surface text-sm">
                        {searchQuery || (filterConditions && filterConditions.length > 0)
                          ? 'Tidak ada data yang cocok'
                          : 'Tabel ini belum memiliki data'}
                      </p>
                      <p className="text-on-surface-variant text-xs leading-relaxed max-w-sm mx-auto">
                        {searchQuery || (filterConditions && filterConditions.length > 0)
                          ? 'Tidak ditemukan baris yang cocok dengan kata kunci pencarian atau filter aktif saat ini.'
                          : `Tabel "${tableData?.name || ''}" belum memiliki rekaman baris di database.`}
                      </p>
                    </div>

                    {!searchQuery && (!filterConditions || filterConditions.length === 0) && (
                      <div className="flex items-center gap-2 mt-2">
                        {onOpenInsertRowModal && (
                          <button
                            type="button"
                            onClick={onOpenInsertRowModal}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary-fixed transition-colors shadow-xs cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Insert Row Pertama</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={onOpenAddColumnModal}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-medium border border-surface-container-highest transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 text-primary" />
                          <span>Tambah Kolom</span>
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedRows.map((row) => {
                const rowKey = getRowKey(row);
                const isRowChecked = selectedRowIds.has(rowKey);
                const isSelected = String(rowKey) === String(selectedRowId);
                const isUnsavedRow = !!unsavedRowEdits[rowKey];
                const isModified = isUnsavedRow || pendingModifiedRowIds.has(String(row.id)) || pendingModifiedRowIds.has(rowKey);
                const isInserted = pendingInsertedRowIds.has(String(row.id)) || pendingInsertedRowIds.has(rowKey);
                const isDeleted = pendingDeletedRowIds.has(String(row.id)) || pendingDeletedRowIds.has(rowKey);

                return (
                  <tr
                    key={rowKey}
                    onClick={() => onSelectRow(row, false)}
                    style={{
                      backgroundColor: isRowChecked
                        ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)'
                        : undefined,
                    }}
                    className={`transition-colors cursor-pointer group ${
                      isUnsavedRow
                        ? 'border-l-4 border-l-amber-400 bg-amber-500/10 hover:bg-amber-500/15'
                        : isModified
                        ? 'border-l-4 border-l-amber-400 bg-amber-500/10 hover:bg-amber-500/15'
                        : isInserted
                        ? 'border-l-4 border-l-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15'
                        : isDeleted
                        ? 'border-l-4 border-l-rose-400 bg-rose-500/10 hover:bg-rose-500/15 opacity-60'
                        : isRowChecked
                        ? 'text-on-surface'
                        : isSelected
                        ? 'bg-surface-container-high/90 text-on-surface'
                        : 'hover:bg-surface-container text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <td
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        backgroundColor: isRowChecked
                          ? 'color-mix(in srgb, var(--color-primary) 22%, transparent)'
                          : undefined,
                      }}
                      className={`w-10 px-3 py-2 text-center sticky left-0 z-10 ${
                        isRowChecked
                          ? ''
                          : isSelected
                          ? 'bg-surface-container-high/90'
                          : 'bg-surface-container-lowest group-hover:bg-surface-container'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isRowChecked}
                        onChange={(e) => onToggleRowSelection(row, e)}
                        className="theme-checkbox"
                      />
                    </td>

                    {(tableData?.columns || []).map((col) => {
                      const val = row[col.name];
                      const isCustomerCol = col.name === 'customer_id';
                      const isStatusCol = col.name === 'status';
                      const isJson = typeof val === 'object' && val !== null;
                      const isEditingThisCell = editingCell?.rowKey === rowKey && editingCell?.colName === col.name;
                      const isCellEdited = unsavedRowEdits[rowKey]?.changes[col.name] !== undefined;

                      if (isEditingThisCell) {
                        return (
                          <td
                            key={col.name}
                            className="p-1 whitespace-nowrap min-w-[150px] bg-surface-container-lowest/80"
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                          >
                            <input
                              autoFocus
                              type="text"
                              value={editingCellValue}
                              onChange={(e) => onEditingCellValueChange(e.target.value)}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter') {
                                  onCommitCellEdit();
                                } else if (e.key === 'Escape') {
                                  onCancelCellEdit();
                                }
                              }}
                              onBlur={onCommitCellEdit}
                              className="w-full min-w-[120px] px-2 py-1 text-xs font-mono bg-surface-container-highest text-on-surface border border-primary/70 rounded shadow-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary font-medium transition-all"
                            />
                          </td>
                        );
                      }

                      return (
                        <td
                          key={col.name}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            onStartCellEdit(row, col.name, val);
                          }}
                          title={!col.isPk ? 'Double click untuk edit' : 'Primary Key'}
                          className={`px-3.5 py-2 whitespace-nowrap min-w-[150px] transition-colors relative ${
                            isCellEdited
                              ? 'bg-amber-500/20 text-amber-300 font-semibold border-y border-amber-400/40'
                              : ''
                          } ${!col.isPk ? 'cursor-pointer hover:bg-surface-container-high/40' : ''}`}
                        >
                          {val == null ? (
                            <span className="text-on-surface-variant/40 italic font-mono text-[10px]">
                              NULL
                            </span>
                          ) : col.isPk ? (
                            <div className="flex items-center gap-1.5 text-primary font-medium">
                              <span className="truncate max-w-[170px]">{String(val)}</span>
                              {isInserted && (
                                <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 uppercase tracking-wider">
                                  NEW
                                </span>
                              )}
                              {isDeleted && (
                                <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-rose-500/20 text-rose-400 uppercase tracking-wider">
                                  DELETED
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard?.writeText(String(val));
                                  onShowToast('Copied ID', 'content_copy');
                                }}
                                className="text-on-surface-variant/40 hover:text-primary transition-colors cursor-pointer"
                                title="Copy ID"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          ) : typeof val === 'boolean' ? (
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                                val
                                  ? 'bg-primary/15 text-primary border border-primary/20'
                                  : 'bg-surface-container-highest text-on-surface-variant'
                              }`}
                            >
                              {val ? 'TRUE' : 'FALSE'}
                            </span>
                          ) : isCustomerCol ? (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onJumpToTable) onJumpToTable('mst_customers');
                              }}
                              className="text-tertiary hover:underline cursor-pointer"
                            >
                              {String(val)}
                            </span>
                          ) : isStatusCol ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                                String(val).toLowerCase().includes('success') ||
                                String(val).toLowerCase().includes('completed') ||
                                String(val).toLowerCase().includes('paid')
                                  ? 'bg-primary/10 text-primary border border-primary/20'
                                  : String(val).toLowerCase().includes('cancel')
                                  ? 'bg-error/10 text-error border border-error/20'
                                  : 'bg-secondary/10 text-secondary border border-secondary/20'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  String(val).toLowerCase().includes('success') ||
                                  String(val).toLowerCase().includes('completed') ||
                                  String(val).toLowerCase().includes('paid')
                                    ? 'bg-primary'
                                    : String(val).toLowerCase().includes('cancel')
                                    ? 'bg-error'
                                    : 'bg-secondary'
                                }`}
                              />
                              {String(val)}
                            </span>
                          ) : isJson ? (
                            <span
                              className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[11px] font-mono truncate max-w-[180px] inline-block"
                              title={JSON.stringify(val)}
                            >
                              {JSON.stringify(val)}
                            </span>
                          ) : (
                            <span className="text-on-surface">{String(val)}</span>
                          )}
                        </td>
                      );
                    })}

                    <td
                      className={`w-12 px-2 py-2 text-right sticky right-0 z-10 ${
                        isSelected
                          ? 'bg-surface-container-high/90'
                          : 'bg-surface-container-lowest group-hover:bg-surface-container'
                      }`}
                    >
                      <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectRow(row, true);
                          }}
                          className="p-1 hover:bg-surface-container text-on-surface-variant hover:text-primary rounded cursor-pointer transition-colors"
                          title="Edit row (Inspect Drawer)"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
