import React from 'react';
import {
  Plus,
  ArrowUpDown,
  Download,
  ChevronDown,
  PanelRight,
} from 'lucide-react';
import { TableFilterCondition } from './types';
import { ColumnMeta } from '../../types/database';
import { TableSearchInput } from './TableSearchInput';
import { TableFilterPopover } from './TableFilterPopover';
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from '../../components/ui/Dropdown';

export interface TableToolbarProps {
  tableName: string;
  columns: ColumnMeta[];
  rowCount: number;
  filterConditions: TableFilterCondition[];
  sortColumn: string;
  sortDirection: 'ASC' | 'DESC';
  searchQuery: string;
  isSearching: boolean;
  isDrawerOpen: boolean;
  onOpenInsertRowModal: () => void;
  onOpenAddColumnModal: () => void;
  onApplyFilters: (filters: TableFilterCondition[]) => void;
  onRemoveFilter: (id: string) => void;
  onResetFilters: () => void;
  onToggleSortDirection: () => void;
  onSearch: (value: string) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onExportSql: () => void;
  onToggleDrawer: () => void;
}

export const TableToolbar: React.FC<TableToolbarProps> = ({
  tableName,
  columns,
  rowCount,
  filterConditions,
  sortColumn,
  sortDirection,
  searchQuery,
  isSearching,
  isDrawerOpen,
  onOpenInsertRowModal,
  onOpenAddColumnModal,
  onApplyFilters,
  onRemoveFilter,
  onResetFilters,
  onToggleSortDirection,
  onSearch,
  onExportCsv,
  onExportJson,
  onExportSql,
  onToggleDrawer,
}) => {
  return (
    <div className="p-1.5 bg-surface-container-low rounded-xl shadow-sm flex flex-col gap-1.5 border border-surface-container-high/60">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Left Toolbar Actions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={onOpenInsertRowModal}
            className="flex items-center gap-1 px-2.5 py-1 bg-primary text-on-primary font-label-md text-xs font-semibold rounded-lg hover:bg-primary-fixed transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Insert Row</span>
          </button>

          <button
            type="button"
            onClick={onOpenAddColumnModal}
            className="flex items-center gap-1 px-2.5 py-1 bg-surface-container-high hover:bg-surface-variant text-primary font-label-md text-xs font-semibold rounded-lg transition-colors border border-primary/30 shadow-sm cursor-pointer"
            title="Add new column to table (ALTER TABLE)"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Insert Column</span>
          </button>

          <div className="h-3.5 w-px bg-surface-container-highest" />

          {/* Filter Component */}
          <TableFilterPopover
            tableName={tableName}
            columns={columns}
            filterConditions={filterConditions}
            onApplyFilters={onApplyFilters}
            onRemoveFilter={onRemoveFilter}
            onResetFilters={onResetFilters}
          />

          {/* Sort Indicator Button */}
          {sortColumn && (
            <button
              type="button"
              onClick={onToggleSortDirection}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-xs transition-colors cursor-pointer border border-surface-container-high"
              title="Click to toggle Sort direction"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-primary" />
              <span className="font-code-sm text-primary font-medium">
                {sortColumn} {sortDirection}
              </span>
            </button>
          )}
        </div>

        {/* Right Toolbar Tools */}
        <div className="flex items-center gap-2">
          {/* Search Box with Ctrl+F */}
          <TableSearchInput
            initialValue={searchQuery}
            rowCount={rowCount}
            isLoading={isSearching}
            onSearch={onSearch}
          />

          {/* Export Dropdown via Reusable UI Dropdown */}
          <Dropdown>
            <DropdownTrigger>
              <button
                type="button"
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-xs cursor-pointer border border-surface-container-high"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownTrigger>
            <DropdownMenu align="right" width="w-48">
              <DropdownItem
                onClick={onExportCsv}
                icon={<Download className="w-3 h-3 text-primary" />}
              >
                CSV (.csv)
              </DropdownItem>
              <DropdownItem
                onClick={onExportJson}
                icon={<Download className="w-3 h-3 text-secondary" />}
              >
                JSON Array
              </DropdownItem>
              <DropdownItem
                onClick={onExportSql}
                icon={<Download className="w-3 h-3 text-on-surface-variant" />}
              >
                SQL INSERTs
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>

          {/* Inspect Row Toggle */}
          <button
            type="button"
            onClick={onToggleDrawer}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-label-md text-xs transition-colors cursor-pointer border ${
              isDrawerOpen
                ? 'bg-surface-container-high text-primary border-primary/30'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface border-surface-container-high'
            }`}
            title={isDrawerOpen ? 'Close Inspect Row' : 'Open Inspect Row'}
          >
            <PanelRight className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Inspect</span>
          </button>
        </div>
      </div>
    </div>
  );
};
