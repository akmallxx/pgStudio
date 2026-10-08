import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Table as TableIcon,
  RotateCw,
  GitFork,
  Code2,
  Search,
  X,
} from 'lucide-react';
import { AvailableTableItem, TableSubView } from './types';
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownHeader,
  DropdownDivider,
} from '../../components/ui/Dropdown';

export interface TableEditorHeaderProps {
  tableName: string;
  rowCount: number;
  availableTables: AvailableTableItem[];
  isRefreshing: boolean;
  subView: TableSubView;
  onRefresh: () => void;
  onSelectTable?: (name: string) => void;
  onSelectSubView: (view: TableSubView) => void;
}

export const TableEditorHeader: React.FC<TableEditorHeaderProps> = ({
  tableName,
  rowCount,
  availableTables,
  isRefreshing,
  subView,
  onRefresh,
  onSelectTable,
  onSelectSubView,
}) => {
  const [tableSearchFilter, setTableSearchFilter] = useState('');

  const filteredTables = availableTables.filter((t) =>
    t.name.toLowerCase().includes(tableSearchFilter.toLowerCase())
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pb-0.5">
      {/* Breadcrumb & Stats Meta with Real-Time Table Switcher */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 font-code-sm text-xs text-on-surface-variant">
          <span className="text-tertiary">public</span>
          <ChevronRight className="w-3 h-3 text-on-surface-variant/60" />
          <span className="text-on-surface-variant">tables</span>
          <ChevronRight className="w-3 h-3 text-on-surface-variant/60" />

          {/* Table Switcher via Reusable UI Dropdown */}
          <Dropdown>
            <DropdownTrigger>
              <button
                type="button"
                className="flex items-center gap-1.5 font-semibold text-primary px-2.5 py-1 rounded-lg bg-surface-container-high border border-primary/30 hover:border-primary transition-all cursor-pointer shadow-sm text-xs font-code-sm"
                title="Pilih tabel lain di database ini"
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>{tableName}</span>
                <ChevronDown className="w-3 h-3 text-on-surface-variant" />
              </button>
            </DropdownTrigger>

            <DropdownMenu align="left" width="w-72">
              <DropdownHeader>
                <div className="flex items-center justify-between">
                  <span>Daftar Tabel ({availableTables.length})</span>
                </div>
              </DropdownHeader>

              {/* Table search filter */}
              <div className="px-2 py-1.5 border-b border-surface-container-highest/40 bg-surface-container-low">
                <div className="flex items-center gap-1 px-2 py-1 rounded bg-surface-container-lowest text-on-surface-variant text-xs border border-outline-variant/30">
                  <Search className="w-3 h-3 shrink-0" />
                  <input
                    value={tableSearchFilter}
                    onChange={(e) => setTableSearchFilter(e.target.value)}
                    placeholder="Cari tabel..."
                    className="w-full bg-transparent text-on-surface outline-none text-[11px]"
                  />
                  {tableSearchFilter && (
                    <button
                      type="button"
                      onClick={() => setTableSearchFilter('')}
                      className="text-on-surface-variant hover:text-on-surface text-xs cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Table list */}
              <div className="overflow-y-auto max-h-56 p-1 space-y-0.5">
                {filteredTables.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-on-surface-variant/60 text-center italic">
                    Tidak ditemukan tabel cocok
                  </div>
                ) : (
                  filteredTables.map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => onSelectTable?.(t.name)}
                      className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left transition-colors cursor-pointer text-xs ${
                        t.name === tableName
                          ? 'bg-primary/15 text-primary font-bold border border-primary/25'
                          : 'hover:bg-surface-container-high text-on-surface'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <TableIcon className="w-3 h-3 text-primary shrink-0" />
                        <span className="truncate">{t.name}</span>
                      </div>
                      <span className="text-[10px] text-on-surface-variant font-mono shrink-0 ml-2">
                        {t.rows > 1000 ? `${(t.rows / 1000).toFixed(1)}k` : t.rows} baris
                      </span>
                    </button>
                  ))
                )}
              </div>
            </DropdownMenu>
          </Dropdown>
        </div>

        {/* Row count stats badge */}
        <div className="flex items-center gap-1.5 font-label-sm text-[10px] text-on-surface-variant px-2 py-1 rounded-lg bg-surface-container-low border border-surface-container-high">
          <span className="text-on-surface font-semibold">
            {rowCount.toLocaleString()}
          </span>
          <span>rows</span>
        </div>

        {/* Real-time Refresh Button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-all border border-surface-container-highest cursor-pointer font-code-sm text-[11px] disabled:opacity-50"
          title="Muat ulang data live dari database"
        >
          <RotateCw
            className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-primary' : ''}`}
          />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* View Mode Selector Switch */}
      <div className="flex items-center p-0.5 bg-surface-container-lowest rounded-lg border border-surface-container-high shadow-sm">
        <button
          type="button"
          onClick={() => onSelectSubView('grid')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-label-md transition-all cursor-pointer ${
            subView === 'grid'
              ? 'bg-surface-container-high text-primary font-semibold shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <TableIcon className="w-3.5 h-3.5" />
          <span>Data Grid View</span>
        </button>
        <button
          type="button"
          onClick={() => onSelectSubView('schema')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-label-md transition-all cursor-pointer ${
            subView === 'schema'
              ? 'bg-surface-container-high text-primary font-semibold shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <GitFork className="w-3.5 h-3.5" />
          <span>Schema Structure</span>
        </button>
        <button
          type="button"
          onClick={() => onSelectSubView('ddl')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-label-md transition-all cursor-pointer ${
            subView === 'ddl'
              ? 'bg-surface-container-high text-primary font-semibold shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Definition DDL</span>
        </button>
      </div>
    </div>
  );
};
