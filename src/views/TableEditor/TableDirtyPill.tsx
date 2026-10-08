import React from 'react';
import { RotateCw, Save } from 'lucide-react';

export interface TableDirtyPillProps {
  hasUnsavedEdits: boolean;
  unsavedCellsCount: number;
  unsavedRowsCount: number;
  isSavingAllEdits: boolean;
  onCancelAll: () => void;
  onSaveAll: () => void;
}

export const TableDirtyPill: React.FC<TableDirtyPillProps> = ({
  hasUnsavedEdits,
  unsavedCellsCount,
  unsavedRowsCount,
  isSavingAllEdits,
  onCancelAll,
  onSaveAll,
}) => {
  if (!hasUnsavedEdits) return null;

  return (
    <div className="fixed bottom-9 left-1/2 -translate-x-1/2 z-40 max-w-[92vw] bg-surface-container-high/95 backdrop-blur-md border border-outline-variant/35 rounded-full pl-3.5 pr-2 py-1.5 shadow-2xl shadow-black/40 flex items-center gap-2.5 sm:gap-3 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-medium text-on-surface whitespace-nowrap">
          {unsavedCellsCount} perubahan belum disimpan
        </span>
        <span className="text-[11px] text-on-surface-variant/75 hidden sm:inline whitespace-nowrap">
          ({unsavedRowsCount} baris)
        </span>
      </div>

      <div className="h-3.5 w-px bg-outline-variant/30 shrink-0" />

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onCancelAll}
          disabled={isSavingAllEdits}
          className="px-2.5 py-1 rounded-full text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer disabled:opacity-50"
          title="Batalkan semua perubahan sel"
        >
          Batal
        </button>

        <button
          type="button"
          onClick={onSaveAll}
          disabled={isSavingAllEdits}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-primary text-on-primary hover:bg-primary/90 transition-all shadow-xs cursor-pointer disabled:opacity-50 active:scale-95"
          title="Simpan semua perubahan ke database (⌘S / Ctrl+S)"
        >
          {isSavingAllEdits ? (
            <>
              <RotateCw className="w-3.5 h-3.5 animate-spin" />
              <span>Menyimpan...</span>
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" />
              <span>Simpan</span>
              <kbd className="hidden sm:inline-block px-1 py-0.2 rounded bg-black/20 text-[10px] font-mono opacity-80 leading-none">
                ⌘S
              </kbd>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
