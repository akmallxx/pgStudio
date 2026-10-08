import React from 'react';
import { Key } from 'lucide-react';
import { TableMeta } from '../../types/database';

export interface TableSchemaViewProps {
  tableName: string;
  tableData: TableMeta;
  onOpenAddColumnModal: () => void;
}

export const TableSchemaView: React.FC<TableSchemaViewProps> = ({
  tableName,
  tableData,
  onOpenAddColumnModal,
}) => {
  return (
    <div className="bg-surface-container-low rounded-xl p-4 border border-surface-container-high/60 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-headline-sm text-sm sm:text-base text-on-surface font-semibold">
          Schema Structure: public.{tableName}
        </h3>
        <div className="flex items-center gap-3">
          <span className="font-code-sm text-xs text-primary">
            {tableData.columns.length} Columns • Total Size: {tableData.sizeFormatted}
          </span>
          <button
            type="button"
            onClick={onOpenAddColumnModal}
            className="flex items-center gap-1 px-3 py-1 bg-primary text-on-primary font-label-md text-xs font-semibold rounded-lg hover:bg-primary-fixed transition-colors shadow-sm cursor-pointer"
          >
            <span>+ Insert Column</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left font-code-sm text-xs border-collapse">
          <thead>
            <tr className="bg-surface-container text-on-surface-variant border-b border-surface-container-high">
              <th className="p-2.5">Column Name</th>
              <th className="p-2.5">Data Type</th>
              <th className="p-2.5">Key Constraint</th>
              <th className="p-2.5">Nullable</th>
              <th className="p-2.5">Default Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container-high/40 text-on-surface">
            {tableData.columns.map((col) => (
              <tr key={col.name} className="hover:bg-surface-container/50">
                <td className="p-2.5 font-medium text-primary">{col.name}</td>
                <td className="p-2.5 text-secondary">{col.type}</td>
                <td className="p-2.5">
                  {col.isPk ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 font-bold text-[10px] border border-yellow-500/30">
                      <Key className="w-3 h-3 text-yellow-400 fill-yellow-400/20" />
                      PRIMARY KEY
                    </span>
                  ) : col.isFk ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-300 font-medium text-[10px] border border-slate-500/30">
                      <Key className="w-3 h-3 text-slate-400 fill-slate-400/20" />
                      FOREIGN KEY -&gt; {col.fkTarget}
                    </span>
                  ) : col.isUnique ? (
                    <span className="px-1.5 py-0.5 rounded bg-tertiary/20 text-tertiary font-medium text-[10px]">
                      UNIQUE
                    </span>
                  ) : (
                    <span className="text-on-surface-variant/40">-</span>
                  )}
                </td>
                <td className="p-2.5 text-on-surface-variant">
                  {col.isNullable === false ? 'NO' : 'YES'}
                </td>
                <td className="p-2.5 text-tertiary">{col.defaultValue || 'NULL'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
