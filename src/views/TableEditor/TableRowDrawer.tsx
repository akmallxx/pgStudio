import React from 'react';
import {
  PanelRight,
  Copy,
  X,
  Key,
  Lock,
  Braces,
  Trash2,
  Save,
} from 'lucide-react';
import { ColumnMeta, TableRow } from '../../types/database';

export interface TableRowDrawerProps {
  isOpen: boolean;
  tableName: string;
  columns: ColumnMeta[];
  formValues: TableRow;
  onFormValuesChange: (values: TableRow) => void;
  onSaveRow: () => void;
  onDeleteRow: () => void;
  onClose: () => void;
  onJumpToTable?: (name: string) => void;
  onShowToast: (message: string, icon?: string, isError?: boolean) => void;
}

export const TableRowDrawer: React.FC<TableRowDrawerProps> = ({
  isOpen,
  tableName,
  columns,
  formValues,
  onFormValuesChange,
  onSaveRow,
  onDeleteRow,
  onClose,
  onJumpToTable,
  onShowToast,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed xl:sticky right-2 top-14 bottom-10 xl:bottom-auto xl:top-14 z-40 w-72 lg:w-80 xl:w-84 shrink-0 bg-surface-container-low rounded-xl shadow-2xl xl:shadow-lg flex flex-col overflow-hidden border border-surface-container-high animate-in slide-in-from-right duration-200 max-h-[calc(100vh-11.5rem)]">
      {/* Drawer Header */}
      <div className="p-2.5 bg-surface-container flex items-center justify-between gap-1.5 border-b border-surface-container-high shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <PanelRight className="w-4 h-4 text-secondary shrink-0" />
          <div className="flex flex-col truncate">
            <span className="font-headline-sm text-sm text-on-surface font-semibold truncate leading-snug">
              Inspect & Edit Row
            </span>
            <span className="font-code-sm text-primary truncate leading-tight text-xs">
              {formValues.id != null
                ? `#${String(formValues.id).slice(0, 16)} (${tableName})`
                : 'Select a row'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(JSON.stringify(formValues, null, 2));
              onShowToast('Row copied as JSON', 'content_copy');
            }}
            className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface cursor-pointer"
            title="Copy as JSON"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface cursor-pointer"
            title="Close drawer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Drawer Record Body */}
      <div className="p-3.5 space-y-3 overflow-y-auto flex-1 min-h-0">
        {/* Dynamic inputs based on table columns */}
        {columns.map((col) => {
          const isPk = col.isPk;
          const isFk = col.isFk;
          const val = formValues[col.name];

          if (isPk) {
            return (
              <div key={col.name} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-label-sm text-xs font-semibold text-on-surface flex items-center gap-1.5">
                    <span title="Primary Key" className="inline-flex items-center">
                      <Key className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400/25 shrink-0" />
                    </span>
                    <span>{col.name}</span>
                  </label>
                  <span className="font-code-sm text-[10px] text-on-surface-variant">
                    {col.type} (read-only)
                  </span>
                </div>
                <div className="relative">
                  <input
                    readOnly
                    value={val != null ? String(val) : ''}
                    className="w-full px-2.5 py-1.5 rounded bg-surface-container-lowest text-on-surface-variant font-code-sm text-xs focus:outline-none cursor-not-allowed opacity-90 border border-surface-container-high"
                  />
                  <Lock className="w-3.5 h-3.5 absolute right-2.5 top-2 text-on-surface-variant" />
                </div>
              </div>
            );
          }

          if (isFk) {
            return (
              <div key={col.name} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-label-sm text-xs font-semibold text-on-surface flex items-center gap-1">
                    <span className="px-1 py-0.2 rounded bg-secondary/20 text-secondary font-code-sm text-[9px]">
                      FK
                    </span>
                    <span>{col.name}</span>
                  </label>
                  <span className="font-code-sm text-[10px] text-tertiary">
                    -&gt; {col.fkTarget}
                  </span>
                </div>
                <input
                  value={val != null ? String(val) : ''}
                  onChange={(e) =>
                    onFormValuesChange({ ...formValues, [col.name]: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 rounded bg-surface-container-lowest text-on-surface font-code-sm text-xs focus:outline-none focus:bg-surface-container-high border border-surface-container-high"
                />
                {col.fkTarget === 'public.customers' && (
                  <div className="p-2 rounded bg-surface-container flex items-center justify-between gap-2 border border-surface-container-highest/60 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-5 h-5 rounded-full bg-secondary-container/30 text-secondary font-code-sm text-[10px] flex items-center justify-center font-bold">
                        DV
                      </div>
                      <span className="font-semibold text-on-surface truncate">Devon Vance</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (onJumpToTable) onJumpToTable('customers');
                        onShowToast('Inspecting customer Devon Vance', 'person');
                      }}
                      className="text-secondary text-[11px] hover:underline cursor-pointer shrink-0"
                    >
                      Inspect
                    </button>
                  </div>
                )}
              </div>
            );
          }

          if (col.type === 'enum' || col.name === 'status') {
            return (
              <div key={col.name} className="space-y-1">
                <label className="font-label-sm text-xs font-semibold text-on-surface">
                  {col.name}
                </label>
                <select
                  value={String(val || 'completed')}
                  onChange={(e) =>
                    onFormValuesChange({ ...formValues, [col.name]: e.target.value })
                  }
                  className="w-full px-2 py-1.5 rounded bg-surface-container-lowest text-primary font-code-sm text-xs focus:outline-none border border-surface-container-high cursor-pointer font-medium"
                >
                  <option value="completed">completed</option>
                  <option value="pending">pending</option>
                  <option value="processing">processing</option>
                  <option value="cancelled">cancelled</option>
                  <option value="refunded">refunded</option>
                </select>
              </div>
            );
          }

          if (col.type === 'jsonb' || col.type === 'json') {
            return (
              <div key={col.name} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-label-sm text-xs font-semibold text-on-surface flex items-center gap-1">
                    <Braces className="w-3.5 h-3.5 text-tertiary" />
                    <span>{col.name}</span>
                  </label>
                  <span className="font-code-sm text-[10px] text-tertiary">jsonb</span>
                </div>
                <textarea
                  rows={3}
                  value={typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val || '{}')}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      onFormValuesChange({ ...formValues, [col.name]: parsed });
                    } catch {
                      // Keep string until valid
                    }
                  }}
                  className="w-full p-2 rounded bg-surface-container-lowest text-on-surface font-mono text-xs focus:outline-none border border-surface-container-high"
                />
              </div>
            );
          }

          return (
            <div key={col.name} className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="font-label-sm text-xs font-semibold text-on-surface">
                  {col.name}
                </label>
                <span className="font-code-sm text-[10px] text-on-surface-variant">
                  {col.type}
                </span>
              </div>
              <input
                value={val != null ? String(val) : ''}
                onChange={(e) =>
                  onFormValuesChange({ ...formValues, [col.name]: e.target.value })
                }
                className="w-full px-2.5 py-1.5 rounded bg-surface-container-lowest text-on-surface font-code-sm text-xs focus:outline-none focus:bg-surface-container-high border border-surface-container-high"
              />
            </div>
          );
        })}
      </div>

      {/* Drawer Action Footer */}
      <div className="p-3 bg-surface-container flex items-center justify-between gap-2 border-t border-surface-container-high shrink-0">
        <button
          type="button"
          onClick={onDeleteRow}
          className="flex items-center gap-1 px-2.5 py-1.5 text-error hover:bg-error/10 font-label-md text-xs rounded-lg transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSaveRow}
            className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-xs font-semibold hover:bg-primary-fixed transition-colors shadow-sm cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save</span>
            <kbd className="ml-1 px-1 py-0.2 rounded bg-on-primary/20 text-on-primary font-code-sm text-[9px]">
              ⌘S
            </kbd>
          </button>
        </div>
      </div>
    </div>
  );
};
