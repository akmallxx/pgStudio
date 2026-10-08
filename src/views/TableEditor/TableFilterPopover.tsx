import React, { useState, useEffect } from 'react';
import { Filter, X, Trash2, Plus, Check } from 'lucide-react';
import { TableFilterCondition } from './types';
import { ColumnMeta } from '../../types/database';

export interface TableFilterPopoverProps {
  tableName: string;
  columns: ColumnMeta[];
  filterConditions: TableFilterCondition[];
  onApplyFilters: (filters: TableFilterCondition[]) => void;
  onRemoveFilter: (id: string) => void;
  onResetFilters: () => void;
}

export const TableFilterPopover: React.FC<TableFilterPopoverProps> = ({
  tableName,
  columns,
  filterConditions,
  onApplyFilters,
  onRemoveFilter,
  onResetFilters,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<TableFilterCondition[]>([]);

  // Sync draft filters when popover is opened
  const handleOpen = () => {
    if (!isOpen) {
      setDraftFilters(
        filterConditions.length > 0
          ? [...filterConditions]
          : [
              {
                id: `flt_${Date.now()}`,
                column: columns[0]?.name || 'id',
                operator: 'contains',
                value: '',
              },
            ]
      );
    }
    setIsOpen(!isOpen);
  };

  const handleAddCondition = () => {
    setDraftFilters((prev) => [
      ...prev,
      {
        id: `flt_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        column: columns[0]?.name || 'id',
        operator: 'contains',
        value: '',
      },
    ]);
  };

  const handleApply = () => {
    const valid = draftFilters.filter(
      (c) => c.operator === 'is_null' || c.operator === 'is_not_null' || c.value.trim() !== ''
    );
    onApplyFilters(valid);
    setIsOpen(false);
  };

  const handleReset = () => {
    setDraftFilters([]);
    onResetFilters();
    setIsOpen(false);
  };

  return (
    <div className="relative flex items-center gap-1.5 flex-wrap">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={handleOpen}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-label-md text-xs transition-colors cursor-pointer border ${
          filterConditions.length > 0
            ? 'bg-primary/15 text-primary border-primary/40 font-bold shadow-xs'
            : isOpen
            ? 'bg-surface-container-high text-primary border-primary/30'
            : 'bg-surface-container text-on-surface border-surface-container-high hover:bg-surface-container-high'
        }`}
        title="Filter data tabel"
      >
        <Filter className={`w-3.5 h-3.5 ${filterConditions.length > 0 ? 'text-primary' : 'text-secondary'}`} />
        <span>Filter</span>
        {filterConditions.length > 0 ? (
          <span className="w-4 h-4 rounded-full bg-primary text-on-primary text-center text-[10px] leading-4 font-bold">
            {filterConditions.length}
          </span>
        ) : (
          <span className="w-3.5 h-3.5 rounded-full bg-secondary/20 text-secondary text-center text-[9px] leading-3.5 font-bold">
            0
          </span>
        )}
      </button>

      {/* Popover Card */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-2 w-80 sm:w-96 bg-surface-container-low border border-surface-container-highest rounded-xl shadow-2xl p-3.5 z-50 animate-in fade-in zoom-in-95 duration-150 flex flex-col gap-3 font-sans">
          <div className="flex items-center justify-between pb-2 border-b border-surface-container-highest/60">
            <div className="flex items-center gap-1.5 font-semibold text-xs text-on-surface">
              <Filter className="w-3.5 h-3.5 text-primary" />
              <span>Filter Tabel {tableName}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-surface-container text-on-surface-variant hover:text-on-surface rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Conditions list */}
          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {draftFilters.length === 0 ? (
              <div className="text-center py-3 text-on-surface-variant text-xs italic">
                Belum ada kondisi filter. Klik &quot;+ Tambah Kondisi&quot; di bawah.
              </div>
            ) : (
              draftFilters.map((cond, idx) => (
                <div key={cond.id} className="flex items-center gap-1.5 flex-wrap text-xs">
                  {idx > 0 && (
                    <span className="text-[10px] font-bold text-primary uppercase w-full">AND</span>
                  )}
                  <select
                    value={cond.column}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDraftFilters((prev) =>
                        prev.map((c) => (c.id === cond.id ? { ...c, column: val } : c))
                      );
                    }}
                    className="flex-1 min-w-[90px] px-2 py-1 rounded bg-surface-container-lowest text-on-surface border border-surface-container-high text-xs font-mono"
                  >
                    {columns.map((col) => (
                      <option key={col.name} value={col.name}>
                        {col.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={cond.operator}
                    onChange={(e) => {
                      const op = e.target.value as any;
                      setDraftFilters((prev) =>
                        prev.map((c) => (c.id === cond.id ? { ...c, operator: op } : c))
                      );
                    }}
                    className="w-24 px-1.5 py-1 rounded bg-surface-container-lowest text-on-surface border border-surface-container-high text-xs font-mono"
                  >
                    <option value="contains">mengandung</option>
                    <option value="=">=</option>
                    <option value="!=">!=</option>
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<=">&lt;=</option>
                    <option value="starts_with">diawali</option>
                    <option value="is_null">IS NULL</option>
                    <option value="is_not_null">IS NOT NULL</option>
                  </select>

                  {cond.operator !== 'is_null' && cond.operator !== 'is_not_null' && (
                    <input
                      type="text"
                      placeholder="Nilai..."
                      value={cond.value}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraftFilters((prev) =>
                          prev.map((c) => (c.id === cond.id ? { ...c, value: v } : c))
                        );
                      }}
                      className="flex-1 min-w-[75px] px-2 py-1 rounded bg-surface-container-lowest text-on-surface border border-surface-container-high text-xs font-mono outline-none focus:border-primary"
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => setDraftFilters((prev) => prev.filter((c) => c.id !== cond.id))}
                    className="p-1 text-on-surface-variant hover:text-error hover:bg-surface-container rounded cursor-pointer"
                    title="Hapus kondisi"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={handleAddCondition}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium py-0.5 cursor-pointer w-fit"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Kondisi</span>
          </button>

          <div className="flex items-center justify-between pt-2 border-t border-surface-container-highest/60">
            <button
              type="button"
              onClick={handleReset}
              className="px-2.5 py-1 rounded text-xs text-on-surface-variant hover:text-error hover:bg-surface-container transition-colors cursor-pointer"
            >
              Reset
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2.5 py-1 rounded text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="px-3 py-1 rounded bg-primary text-on-primary font-semibold text-xs shadow-sm hover:opacity-90 transition-all cursor-pointer flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Terapkan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Filter Chips */}
      {filterConditions.map((cond) => (
        <div
          key={cond.id}
          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-container-high text-on-surface font-code-sm text-xs border border-primary/30 animate-in fade-in"
        >
          <span className="text-primary font-medium">{cond.column}</span>
          <span className="text-on-surface-variant text-[10px] font-bold uppercase">{cond.operator}</span>
          {cond.operator !== 'is_null' && cond.operator !== 'is_not_null' && (
            <span className="text-secondary font-mono max-w-[85px] truncate">
              &apos;{cond.value}&apos;
            </span>
          )}
          <button
            type="button"
            onClick={() => onRemoveFilter(cond.id)}
            className="text-on-surface-variant hover:text-error ml-0.5 flex items-center cursor-pointer"
            title="Hapus filter ini"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
};
