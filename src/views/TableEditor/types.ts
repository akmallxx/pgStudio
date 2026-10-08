import { TableMeta, TableRow, ColumnMeta, ActiveTransaction } from '../../types/database';

export interface TableFilterCondition {
  id: string;
  column: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'starts_with' | 'is_null' | 'is_not_null';
  value: string;
}

export type TableSubView = 'grid' | 'schema' | 'ddl';

export interface TableEditorProps {
  tableName: string;
  activeDatabase?: string;
  onJumpToTable?: (tableName: string) => void;
  onShowToast: (message: string, icon?: string, isError?: boolean) => void;
  autocommit?: boolean;
  onToggleAutocommit?: () => void;
  activeTransaction?: ActiveTransaction | null;
  setActiveTransaction?: React.Dispatch<React.SetStateAction<ActiveTransaction | null>>;
  transactionHistory?: ActiveTransaction[];
  setTransactionHistory?: React.Dispatch<React.SetStateAction<ActiveTransaction[]>>;
  onRegisterTransactionHandlers?: (commitFn: () => Promise<void>, rollbackFn: () => Promise<void>) => void;
}

export interface AvailableTableItem {
  name: string;
  rows: number;
  size: string;
  type: string;
}
