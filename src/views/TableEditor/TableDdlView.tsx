import React from 'react';
import { Copy } from 'lucide-react';
import { TableMeta } from '../../types/database';

export interface TableDdlViewProps {
  tableName: string;
  tableData: TableMeta;
  onShowToast: (message: string, icon?: string, isError?: boolean) => void;
}

export function generateTableDdl(meta: TableMeta): string {
  const colLines = meta.columns.map((c) => {
    let line = `    ${c.name} ${c.type}`;
    if (c.isPk) line += ' PRIMARY KEY';
    if (c.isUnique) line += ' UNIQUE';
    if (c.isNullable === false) line += ' NOT NULL';
    if (c.defaultValue) line += ` DEFAULT ${c.defaultValue}`;
    if (c.isFk && c.fkTarget) line += ` REFERENCES ${c.fkTarget}(id) ON DELETE CASCADE`;
    return line;
  });

  return `-- Table DDL: public.${meta.name}
CREATE TABLE public.${meta.name} (
${colLines.join(',\n')}
);

-- Primary indexes
CREATE INDEX idx_${meta.name}_created ON public.${meta.name} (created_at DESC);`;
}

export const TableDdlView: React.FC<TableDdlViewProps> = ({
  tableName,
  tableData,
  onShowToast,
}) => {
  const ddlSql = generateTableDdl(tableData);

  const handleCopy = () => {
    navigator.clipboard?.writeText(ddlSql);
    onShowToast('DDL copied to clipboard', 'content_copy');
  };

  return (
    <div className="bg-surface-container-low rounded-xl p-4 border border-surface-container-high/60 shadow-sm space-y-3 font-mono">
      <div className="flex items-center justify-between">
        <span className="font-code-sm text-xs text-secondary font-semibold">
          PostgreSQL 16.2 Generated DDL: public.{tableName}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-code-sm text-xs cursor-pointer border border-surface-container-high transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
          <span>Copy DDL</span>
        </button>
      </div>
      <pre className="p-4 bg-surface-container-lowest rounded-lg text-on-surface text-xs leading-relaxed overflow-x-auto border border-surface-container-high">
        {ddlSql}
      </pre>
    </div>
  );
};
