import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Table as TableIcon,
  GitFork,
  Code2,
  Plus,
  Filter,
  X,
  ArrowUpDown,
  Search,
  Download,
  ChevronDown,
  PanelRight,
  Copy,
  Lock,
  Braces,
  Trash2,
  Save,
  PlusSquare,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Edit3,
  RotateCw,
  Database,
  Server,
  ScrollText,
  RotateCcw,
  Check,
  Key,
} from 'lucide-react';
import { ALL_TABLES_MAP, INITIAL_ORDERS } from '../../data/mockDatabase';
import { TableMeta, TableRow, ActiveTransaction, TransactionStatement } from '../../types/database';
import { api } from '../../services/api';
import { InsertColumnModal } from './InsertColumnModal';
import { CreateTableModal } from './CreateTableModal';

export interface TableFilterCondition {
  id: string;
  column: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'starts_with' | 'is_null' | 'is_not_null';
  value: string;
}

interface TableEditorProps {
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

export const TableEditor: React.FC<TableEditorProps> = ({
  tableName = 'orders',
  activeDatabase,
  onJumpToTable,
  onShowToast,
  autocommit = true,
  onToggleAutocommit,
  activeTransaction: externalActiveTransaction,
  setActiveTransaction: externalSetActiveTransaction,
  transactionHistory: externalTransactionHistory,
  setTransactionHistory: externalSetTransactionHistory,
  onRegisterTransactionHandlers,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Sub-view synced with URL query param ?view=grid|schema|ddl
  const subView = (searchParams.get('view') as 'grid' | 'schema' | 'ddl') || 'grid';
  const setSubView = (newView: 'grid' | 'schema' | 'ddl') => {
    const next = new URLSearchParams(searchParams);
    next.set('view', newView);
    setSearchParams(next);
  };

  // Pagination synced with URL query param ?page=1
  const currentPage = parseInt(searchParams.get('page') || '1', 10) || 1;
  const setCurrentPage = (val: number | ((p: number) => number)) => {
    const nextVal = typeof val === 'function' ? val(currentPage) : val;
    const next = new URLSearchParams(searchParams);
    next.set('page', nextVal.toString());
    setSearchParams(next);
  };

  // Search query synced with URL query param ?search=...
  const searchQuery = searchParams.get('search') || '';
  const setSearchQuery = (val: string | ((s: string) => string)) => {
    const nextVal = typeof val === 'function' ? val(searchQuery) : val;
    const next = new URLSearchParams(searchParams);
    if (nextVal) next.set('search', nextVal);
    else next.delete('search');
    setSearchParams(next);
  };

  const [tableData, setTableData] = useState<TableMeta>(
    ALL_TABLES_MAP[tableName] || INITIAL_ORDERS
  );
  const [selectedRowId, setSelectedRowId] = useState<string>('');
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [filterConditions, setFilterConditions] = useState<TableFilterCondition[]>([]);
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<TableFilterCondition[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [isInsertModalOpen, setIsInsertModalOpen] = useState(false);
  const [isAddColumnModalOpen, setIsAddColumnModalOpen] = useState(false);
  const [isCreateTableModalOpen, setIsCreateTableModalOpen] = useState(false);
  const [pageSize, setPageSize] = useState(25);

  // Real-time synchronization state
  const [isLive, setIsLive] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [availableTables, setAvailableTables] = useState<
    Array<{ name: string; rows: number; size: string; type: string }>
  >([]);
  const [isTableMenuOpen, setIsTableMenuOpen] = useState(false);
  const [tableSearchFilter, setTableSearchFilter] = useState('');

  // Sorting
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('DESC');

  // DBeaver-style Transaction Management State (Synced with Navbar in App)
  const [localActiveTransaction, setLocalActiveTransaction] = useState<ActiveTransaction | null>(null);
  const [localTransactionHistory, setLocalTransactionHistory] = useState<ActiveTransaction[]>([]);

  const activeTransaction = externalActiveTransaction !== undefined ? externalActiveTransaction : localActiveTransaction;
  const setActiveTransaction = externalSetActiveTransaction || setLocalActiveTransaction;
  const transactionHistory = externalTransactionHistory !== undefined ? externalTransactionHistory : localTransactionHistory;
  const setTransactionHistory = externalSetTransactionHistory || setLocalTransactionHistory;
  const [isCommitting, setIsCommitting] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);

  // Staged / dirty row tracking
  const [pendingModifiedRowIds, setPendingModifiedRowIds] = useState<Set<string>>(new Set());
  const [pendingInsertedRowIds, setPendingInsertedRowIds] = useState<Set<string>>(new Set());
  const [pendingDeletedRowIds, setPendingDeletedRowIds] = useState<Set<string>>(new Set());
  const originalRowsSnapshot = useRef<TableRow[]>([]);

  // Robust row key resolver (handles tables with PK other than 'id', e.g. 'key', 'code')
  const getRowKey = (row: TableRow): string => {
    if (!row) return '';
    const pk = tableData?.columns?.find((c) => c.isPk)?.name || 'id';
    if (row[pk] !== undefined && row[pk] !== null) return String(row[pk]);
    if (row.id !== undefined && row.id !== null) return String(row.id);
    const firstCol = tableData?.columns?.[0]?.name;
    if (firstCol && row[firstCol] !== undefined && row[firstCol] !== null) return String(row[firstCol]);
    return JSON.stringify(row);
  };

  // Inline cell editing and unsaved edits state
  const [editingCell, setEditingCell] = useState<{ rowKey: string; colName: string } | null>(null);
  const [editingCellValue, setEditingCellValue] = useState<string>('');
  const [unsavedRowEdits, setUnsavedRowEdits] = useState<
    Record<string, { originalRow: TableRow; changes: Record<string, any> }>
  >({});
  const [isSavingAllEdits, setIsSavingAllEdits] = useState(false);

  // References to avoid stale closures in event listeners
  const unsavedRowEditsRef = useRef(unsavedRowEdits);
  unsavedRowEditsRef.current = unsavedRowEdits;

  const editingCellRef = useRef(editingCell);
  editingCellRef.current = editingCell;

  const editingCellValueRef = useRef(editingCellValue);
  editingCellValueRef.current = editingCellValue;

  const hasUnsavedEdits = Object.keys(unsavedRowEdits).length > 0;
  const unsavedCellsCount = Object.values(unsavedRowEdits).reduce(
    (acc, item) => acc + Object.keys(item.changes).length,
    0
  );

  const pendingCount = activeTransaction
    ? activeTransaction.statements.filter((s) => s.status === 'PENDING').length
    : 0;

  const generateUpdateSql = (tbl: string, pkCol: string, rowId: any, changes: Record<string, any>) => {
    const setClauses: string[] = [];
    for (const [k, v] of Object.entries(changes)) {
      if (k === pkCol || k === 'id') continue;
      if (v === null || v === undefined) {
        setClauses.push(`${k} = NULL`);
      } else if (typeof v === 'number' || typeof v === 'boolean') {
        setClauses.push(`${k} = ${v}`);
      } else if (typeof v === 'object') {
        setClauses.push(`${k} = '${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`);
      } else {
        setClauses.push(`${k} = '${String(v).replace(/'/g, "''")}'`);
      }
    }
    const idVal = typeof rowId === 'number' ? rowId : `'${String(rowId).replace(/'/g, "''")}'`;
    return `UPDATE ${tbl} SET ${setClauses.join(', ')} WHERE ${pkCol} = ${idVal};`;
  };

  const generateInsertSql = (tbl: string, data: Record<string, any>) => {
    const cols = Object.keys(data);
    const vals = cols.map((c) => {
      const v = data[c];
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'number' || typeof v === 'boolean') return `${v}`;
      if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
      return `'${String(v).replace(/'/g, "''")}'`;
    });
    return `INSERT INTO ${tbl} (${cols.join(', ')}) VALUES (${vals.join(', ')});`;
  };

  const generateDeleteSql = (tbl: string, pkCol: string, rowId: any) => {
    const idVal = typeof rowId === 'number' ? rowId : `'${String(rowId).replace(/'/g, "''")}'`;
    return `DELETE FROM ${tbl} WHERE ${pkCol} = ${idVal};`;
  };

  const handleManualCommit = async () => {
    if (!activeTransaction || activeTransaction.statements.length === 0) {
      try {
        setIsCommitting(true);
        if (isLive) {
          await api.executeQuery('COMMIT;');
        }
        onShowToast('COMMIT transaksi berhasil dijalankan', 'check_circle');
      } catch (err: any) {
        onShowToast(`COMMIT error: ${err?.message || 'Database error'}`, 'error', true);
      } finally {
        setIsCommitting(false);
      }
      return;
    }

    try {
      setIsCommitting(true);
      const pendingStmts = activeTransaction.statements.filter((s) => s.status === 'PENDING');
      for (const stmt of pendingStmts) {
        if (stmt.type === 'UPDATE' && stmt.rowId && stmt.payload) {
          await api.updateTableRow(tableName, stmt.rowId, stmt.payload);
        } else if (stmt.type === 'INSERT' && stmt.payload) {
          await api.insertTableRow(tableName, stmt.payload);
        } else if (stmt.type === 'DELETE' && stmt.rowId) {
          await api.deleteTableRow(tableName, stmt.rowId);
        }
        stmt.status = 'SUCCESS';
      }

      if (isLive) {
        await api.executeQuery('COMMIT;').catch(() => {});
      }

      const committedTx: ActiveTransaction = {
        ...activeTransaction,
        status: 'COMMITTED',
      };
      setTransactionHistory((prev) => [committedTx, ...prev]);
      setActiveTransaction(null);
      setPendingModifiedRowIds(new Set());
      setPendingInsertedRowIds(new Set());
      setPendingDeletedRowIds(new Set());
      originalRowsSnapshot.current = [];

      onShowToast(`Semua perubahan (${pendingStmts.length} statement) berhasil di-COMMIT!`, 'check_circle');
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      onShowToast(`Gagal melakukan COMMIT: ${err?.message || 'Database error'}`, 'error', true);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleRollback = async () => {
    try {
      setIsRollingBack(true);
      if (isLive) {
        await api.executeQuery('ROLLBACK;').catch(() => {});
      }

      if (activeTransaction) {
        const rolledBackTx: ActiveTransaction = {
          ...activeTransaction,
          status: 'ROLLED_BACK',
        };
        setTransactionHistory((prev) => [rolledBackTx, ...prev]);
      }

      if (originalRowsSnapshot.current.length > 0) {
        setTableData((prev) => ({
          ...prev,
          rows: originalRowsSnapshot.current,
          rowCount: originalRowsSnapshot.current.length,
        }));
      } else {
        setRefreshKey((k) => k + 1);
      }

      setActiveTransaction(null);
      setPendingModifiedRowIds(new Set());
      setPendingInsertedRowIds(new Set());
      setPendingDeletedRowIds(new Set());
      originalRowsSnapshot.current = [];

      onShowToast('Transaksi berhasil di-ROLLBACK (seluruh perubahan dibatalkan)', 'undo');
    } catch (err: any) {
      onShowToast(`Gagal melakukan ROLLBACK: ${err?.message || 'Database error'}`, 'error', true);
    } finally {
      setIsRollingBack(false);
    }
  };

  // Register commit and rollback handlers with Navbar in App
  useEffect(() => {
    if (onRegisterTransactionHandlers) {
      onRegisterTransactionHandlers(handleManualCommit, handleRollback);
    }
  }, [handleManualCommit, handleRollback, onRegisterTransactionHandlers]);

  // Discover all tables in schema for dropdown switcher
  useEffect(() => {
    let cancelled = false;
    api
      .getCatalogSchema()
      .then((res) => {
        if (!cancelled && res && res.tables && res.tables.length > 0) {
          setAvailableTables(
            res.tables.map((t) => ({
              name: t.name,
              rows: t.rows,
              size: t.size,
              type: t.type,
            }))
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tableName, refreshKey]);

  // Load real data from PostgreSQL Go backend or fallback to demo
  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      if (!tableName) {
        setIsLive(true);
        setTableData({
          name: '',
          schema: 'public',
          rowCount: 0,
          sizeFormatted: '0 kB',
          heapSize: '0 kB',
          toastSize: '0 kB',
          columns: [],
          rows: [],
        });
        return;
      }
      try {
        const res = await api.getTableRows(tableName, {
          page: currentPage,
          limit: pageSize,
          sort: sortColumn,
          direction: sortDirection,
          search: searchQuery,
          filter: filterConditions.length > 0 ? JSON.stringify(filterConditions) : undefined,
        });

        if (cancelled) return;

        if (res && res.is_live && res.rows) {
          setIsLive(true);
          const colDefs = (res.columns || []).map((c) => ({
            name: c.name,
            type: c.type,
            isPk: c.is_pk ?? (c.name === 'id' || c.name === 'ID'),
            isNullable: c.is_nullable,
            defaultValue: c.default,
          }));

          const pkField = colDefs.find((c) => c.isPk)?.name || 'id';

          const mappedRows: TableRow[] = (res.rows || []).map((r, i) => ({
            id: String(r[pkField] ?? r.id ?? r.ID ?? i + 1),
            ...r,
          }));

          setTableData({
            name: tableName,
            schema: 'public',
            rowCount: res.total_count,
            sizeFormatted: `${res.total_count} baris`,
            heapSize: 'PostgreSQL Live',
            toastSize: '0 kB',
            columns:
              colDefs.length > 0
                ? colDefs
                : ALL_TABLES_MAP[tableName]?.columns || INITIAL_ORDERS.columns,
            rows: mappedRows,
          });

          if (mappedRows[0]) {
            const firstId = mappedRows[0].id;
            setSelectedRowId(firstId);
            setFormValues(mappedRows[0]);
          }
          return;
        }
      } catch {
        // Fallback to local mock data
      }

      if (cancelled) return;
      setIsLive(false);
      const nextTable = ALL_TABLES_MAP[tableName] || INITIAL_ORDERS;
      setTableData(nextTable);
      if (nextTable.rows[0]) {
        setSelectedRowId(nextTable.rows[0].id);
        setFormValues(nextTable.rows[0]);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [tableName, currentPage, pageSize, sortColumn, sortDirection, searchQuery, filterConditions, refreshKey]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => {
      setIsRefreshing(false);
      onShowToast(`Data tabel ${tableName} berhasil dimuat ulang secara real-time!`, 'refresh');
    }, 450);
  };

  const selectedRow =
    tableData.rows.find((r) => String(r.id) === selectedRowId) || tableData.rows[0];

  // Inspect drawer form state
  const [formValues, setFormValues] = useState<TableRow>(selectedRow || { id: '' });

  const handleSelectRow = (row: TableRow, openDrawer: boolean = false) => {
    const rowKey = getRowKey(row);
    setSelectedRowId(rowKey);
    setFormValues({ ...row });
    if (openDrawer) {
      setIsDrawerOpen(true);
    }
  };

  // Helper to parse cell edits into appropriate column data types
  const parseCellValue = (colName: string, rawVal: string) => {
    const colMeta = tableData.columns.find((c) => c.name === colName);
    const lowerType = (colMeta?.type || '').toLowerCase();

    if (rawVal.trim().toUpperCase() === 'NULL' || (rawVal === '' && !lowerType.includes('varchar') && !lowerType.includes('text'))) {
      return null;
    }
    if (lowerType.includes('int') || lowerType.includes('serial') || lowerType.includes('bigint')) {
      const num = parseInt(rawVal, 10);
      return isNaN(num) ? rawVal : num;
    }
    if (
      lowerType.includes('numeric') ||
      lowerType.includes('decimal') ||
      lowerType.includes('float') ||
      lowerType.includes('double') ||
      lowerType.includes('real')
    ) {
      const num = parseFloat(rawVal);
      return isNaN(num) ? rawVal : num;
    }
    if (lowerType.includes('bool')) {
      if (rawVal.toLowerCase() === 'true' || rawVal === '1' || rawVal.toLowerCase() === 't') {
        return true;
      }
      if (rawVal.toLowerCase() === 'false' || rawVal === '0' || rawVal.toLowerCase() === 'f') {
        return false;
      }
    }
    if (lowerType.includes('json')) {
      try {
        return JSON.parse(rawVal);
      } catch {
        return rawVal;
      }
    }
    return rawVal;
  };

  // Start double-click cell editing
  const handleStartCellEdit = (row: TableRow, colName: string, currentValue: any) => {
    const colMeta = tableData.columns.find((c) => c.name === colName);
    if (colMeta?.isPk) {
      onShowToast('Kolom Primary Key tidak dapat diedit langsung', 'lock', true);
      return;
    }
    // Commit any active cell edit before switching cells
    if (editingCellRef.current) {
      handleCommitCellEdit();
    }
    const rowKey = getRowKey(row);
    setSelectedRowId(rowKey);
    setFormValues({ ...row });
    setEditingCell({ rowKey, colName });
    setEditingCellValue(currentValue === null || currentValue === undefined ? '' : String(currentValue));
  };

  // Commit current cell edit into unsavedRowEdits
  const handleCommitCellEdit = () => {
    const active = editingCellRef.current;
    if (!active) return;
    const { rowKey, colName } = active;
    const rawVal = editingCellValueRef.current;

    const targetRow = tableData.rows.find((r) => getRowKey(r) === rowKey);
    if (!targetRow) {
      setEditingCell(null);
      return;
    }

    const existingEdit = unsavedRowEditsRef.current[rowKey];
    const originalRow = existingEdit?.originalRow || { ...targetRow };
    const originalVal = originalRow[colName];

    const parsedVal = parseCellValue(colName, rawVal);
    const isChanged = String(parsedVal) !== String(originalVal);

    if (!isChanged) {
      setUnsavedRowEdits((prev) => {
        if (!prev[rowKey]) return prev;
        const nextChanges = { ...prev[rowKey].changes };
        delete nextChanges[colName];
        if (Object.keys(nextChanges).length === 0) {
          const next = { ...prev };
          delete next[rowKey];
          return next;
        }
        return {
          ...prev,
          [rowKey]: {
            originalRow: prev[rowKey].originalRow,
            changes: nextChanges,
          },
        };
      });

      setTableData((prev) => ({
        ...prev,
        rows: prev.rows.map((r) =>
          getRowKey(r) === rowKey ? { ...r, [colName]: originalVal } : r
        ),
      }));
    } else {
      setUnsavedRowEdits((prev) => {
        const existing = prev[rowKey] || { originalRow, changes: {} };
        return {
          ...prev,
          [rowKey]: {
            originalRow: existing.originalRow,
            changes: {
              ...existing.changes,
              [colName]: parsedVal,
            },
          },
        };
      });

      setTableData((prev) => ({
        ...prev,
        rows: prev.rows.map((r) =>
          getRowKey(r) === rowKey ? { ...r, [colName]: parsedVal } : r
        ),
      }));
    }

    setEditingCell(null);
  };

  const handleCancelCellEdit = () => {
    setEditingCell(null);
  };

  // Discard all unsaved edits and restore table data
  const handleCancelAllUnsavedEdits = () => {
    setTableData((prev) => {
      const nextRows = prev.rows.map((row) => {
        const rowKey = getRowKey(row);
        if (unsavedRowEditsRef.current[rowKey]) {
          return { ...unsavedRowEditsRef.current[rowKey].originalRow };
        }
        return row;
      });
      return { ...prev, rows: nextRows };
    });

    setUnsavedRowEdits({});
    setEditingCell(null);
    onShowToast('Semua perubahan dibatalkan', 'rotate_left');
  };

  // Save all modified rows to database or active transaction
  const handleSaveAllUnsavedEdits = async () => {
    // Flush active cell into a working changes copy
    let currentEdits = { ...unsavedRowEditsRef.current };
    if (editingCellRef.current) {
      const { rowKey, colName } = editingCellRef.current;
      const rawVal = editingCellValueRef.current;
      const targetRow = tableData.rows.find((r) => getRowKey(r) === rowKey);
      if (targetRow) {
        const existingEdit = currentEdits[rowKey];
        const originalRow = existingEdit?.originalRow || { ...targetRow };
        const originalVal = originalRow[colName];
        const parsedVal = parseCellValue(colName, rawVal);
        const isChanged = String(parsedVal) !== String(originalVal);

        if (isChanged) {
          const existing = currentEdits[rowKey] || { originalRow, changes: {} };
          currentEdits = {
            ...currentEdits,
            [rowKey]: {
              originalRow: existing.originalRow,
              changes: {
                ...existing.changes,
                [colName]: parsedVal,
              },
            },
          };
          setTableData((prev) => ({
            ...prev,
            rows: prev.rows.map((r) =>
              getRowKey(r) === rowKey ? { ...r, [colName]: parsedVal } : r
            ),
          }));
        }
      }
      setEditingCell(null);
    }

    const editedRowKeys = Object.keys(currentEdits);
    if (editedRowKeys.length === 0) return;

    setIsSavingAllEdits(true);
    try {
      const pkCol = tableData.columns.find((c) => c.isPk)?.name || 'id';

      if (!autocommit) {
        // Manual commit mode: stage changes into activeTransaction
        if (originalRowsSnapshot.current.length === 0) {
          originalRowsSnapshot.current = [...tableData.rows];
        }

        const statements: TransactionStatement[] = [];
        const modifiedIds: string[] = [];

        for (const rowKey of editedRowKeys) {
          const { originalRow, changes } = currentEdits[rowKey];
          const rowId = originalRow[pkCol] ?? originalRow.id ?? rowKey;
          const updateSql = generateUpdateSql(tableName, pkCol, rowId, changes);

          const statement: TransactionStatement = {
            id: `stmt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            type: 'UPDATE',
            sql: updateSql,
            tableName,
            rowId,
            rowsAffected: 1,
            durationMs: 0.5,
            status: 'PENDING',
            timestamp: new Date().toISOString(),
            payload: changes,
            originalData: originalRow,
          };
          statements.push(statement);
          modifiedIds.push(String(rowId));
        }

        setActiveTransaction((prev) => {
          const base = prev || {
            id: `tx_${Date.now()}`,
            database: activeDatabase || 'postgres',
            tableName,
            status: 'ACTIVE',
            startedAt: new Date().toISOString(),
            statements: [],
          };
          return {
            ...base,
            statements: [...base.statements, ...statements],
          };
        });

        setPendingModifiedRowIds((prev) => {
          const next = new Set(prev);
          modifiedIds.forEach((id) => next.add(id));
          return next;
        });

        setUnsavedRowEdits({});
        onShowToast(
          `${editedRowKeys.length} baris diubah (Pending Commit di Transaction Log)`,
          'schedule'
        );
        return;
      }

      // Autocommit mode: persist directly to DB API
      for (const rowKey of editedRowKeys) {
        const { originalRow, changes } = currentEdits[rowKey];
        const rowId = originalRow[pkCol] ?? originalRow.id ?? rowKey;
        await api.updateTableRow(tableName, rowId, changes);

        const updateSql = generateUpdateSql(tableName, pkCol, rowId, changes);
        setTransactionHistory((prev) => [
          {
            id: `tx_${Date.now()}`,
            database: activeDatabase || 'postgres',
            tableName,
            status: 'COMMITTED',
            startedAt: new Date().toISOString(),
            statements: [
              {
                id: `stmt_${Date.now()}`,
                type: 'UPDATE',
                sql: updateSql,
                tableName,
                rowId,
                rowsAffected: 1,
                durationMs: 0.8,
                status: 'SUCCESS',
                timestamp: new Date().toISOString(),
                payload: changes,
              },
            ],
          },
          ...prev,
        ]);
      }

      setUnsavedRowEdits({});
      onShowToast(`Berhasil menyimpan ${editedRowKeys.length} baris ke database!`, 'check_circle');
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      onShowToast(`Gagal menyimpan perubahan: ${err?.message || 'Database error'}`, 'error', true);
    } finally {
      setIsSavingAllEdits(false);
    }
  };

  const handleSaveRow = async () => {
    try {
      const pkCol = tableData.columns.find((c) => c.isPk)?.name || 'id';
      const rowId = formValues[pkCol] ?? formValues.id;

      // Filter payload to only include actual table columns
      const payload: Record<string, any> = {};
      if (tableData.columns.length > 0) {
        tableData.columns.forEach((col) => {
          if (col.name in formValues) {
            payload[col.name] = formValues[col.name];
          }
        });
      }
      const dataToSend = Object.keys(payload).length > 0 ? payload : formValues;

      if (!autocommit) {
        // Manual mode: stage changes into active transaction
        if (originalRowsSnapshot.current.length === 0) {
          originalRowsSnapshot.current = [...tableData.rows];
        }

        const updateSql = generateUpdateSql(tableName, pkCol, rowId, dataToSend);
        const statement: TransactionStatement = {
          id: `stmt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          type: 'UPDATE',
          sql: updateSql,
          tableName,
          rowId,
          rowsAffected: 1,
          durationMs: 0.5,
          status: 'PENDING',
          timestamp: new Date().toISOString(),
          payload: dataToSend,
          originalData: tableData.rows.find((r) => String(r.id) === String(formValues.id)),
        };

        setActiveTransaction((prev) => {
          const base = prev || {
            id: `tx_${Date.now()}`,
            database: activeDatabase || 'postgres',
            tableName,
            status: 'ACTIVE',
            startedAt: new Date().toISOString(),
            statements: [],
          };
          return {
            ...base,
            statements: [...base.statements, statement],
          };
        });

        setTableData((prev) => ({
          ...prev,
          rows: prev.rows.map((r) =>
            String(r.id) === String(formValues.id) ? { ...r, ...formValues } : r
          ),
        }));
        setPendingModifiedRowIds((prev) => new Set(prev).add(String(rowId)));
        onShowToast(`Baris #${String(rowId)} diubah (Pending Commit di Transaction Log)`, 'schedule');
        setIsDrawerOpen(false);
        return;
      }

      await api.updateTableRow(tableName, rowId, dataToSend);
      setTableData((prev) => ({
        ...prev,
        rows: prev.rows.map((r) =>
          String(r.id) === String(formValues.id) ? { ...r, ...formValues } : r
        ),
      }));

      // Record to transaction history
      const updateSql = generateUpdateSql(tableName, pkCol, rowId, dataToSend);
      setTransactionHistory((prev) => [
        {
          id: `tx_${Date.now()}`,
          database: activeDatabase || 'postgres',
          tableName,
          status: 'COMMITTED',
          startedAt: new Date().toISOString(),
          statements: [
            {
              id: `stmt_${Date.now()}`,
              type: 'UPDATE',
              sql: updateSql,
              tableName,
              rowId,
              rowsAffected: 1,
              durationMs: 0.8,
              status: 'SUCCESS',
              timestamp: new Date().toISOString(),
              payload: dataToSend,
            },
          ],
        },
        ...prev,
      ]);

      onShowToast(`Baris #${String(rowId)} berhasil disimpan ke database!`, 'check_circle');
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      if (isLive) {
        onShowToast(`Gagal menyimpan baris: ${err?.message || 'Database error'}`, 'error', true);
        return;
      }
      setTableData((prev) => ({
        ...prev,
        rows: prev.rows.map((r) => (String(r.id) === String(formValues.id) ? formValues : r)),
      }));
      onShowToast(`Baris tersimpan (Demo Mode)`, 'check_circle');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        if (Object.keys(unsavedRowEditsRef.current).length > 0 || editingCellRef.current) {
          e.preventDefault();
          handleSaveAllUnsavedEdits();
        } else if (isDrawerOpen) {
          e.preventDefault();
          handleSaveRow();
        }
      } else if (e.key === 'Escape') {
        if (editingCellRef.current) {
          e.preventDefault();
          handleCancelCellEdit();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen, formValues, tableData, tableName, isLive, autocommit]);

  const handleDeleteRow = async () => {
    const pkCol = tableData.columns.find((c) => c.isPk)?.name || 'id';
    const deletedId = formValues[pkCol] ?? formValues.id;
    if (!deletedId) return;

    if (!autocommit) {
      // Manual mode: stage changes into active transaction
      if (originalRowsSnapshot.current.length === 0) {
        originalRowsSnapshot.current = [...tableData.rows];
      }

      const deleteSql = generateDeleteSql(tableName, pkCol, deletedId);
      const statement: TransactionStatement = {
        id: `stmt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: 'DELETE',
        sql: deleteSql,
        tableName,
        rowId: deletedId,
        rowsAffected: 1,
        durationMs: 0.4,
        status: 'PENDING',
        timestamp: new Date().toISOString(),
        originalData: formValues,
      };

      setActiveTransaction((prev) => {
        const base = prev || {
          id: `tx_${Date.now()}`,
          database: activeDatabase || 'postgres',
          tableName,
          status: 'ACTIVE',
          startedAt: new Date().toISOString(),
          statements: [],
        };
        return {
          ...base,
          statements: [...base.statements, statement],
        };
      });

      setTableData((prev) => {
        const remaining = prev.rows.filter((r) => String(r.id) !== String(deletedId));
        return {
          ...prev,
          rows: remaining,
          rowCount: Math.max(0, prev.rowCount - 1),
        };
      });
      setPendingDeletedRowIds((prev) => new Set(prev).add(String(deletedId)));
      onShowToast(`Baris #${String(deletedId).slice(0, 12)} ditandai hapus (Pending Commit)`, 'delete');
      setIsDrawerOpen(false);
      return;
    }

    try {
      await api.deleteTableRow(tableName, deletedId);
      setRefreshKey((k) => k + 1);

      const deleteSql = generateDeleteSql(tableName, pkCol, deletedId);
      setTransactionHistory((prev) => [
        {
          id: `tx_${Date.now()}`,
          database: activeDatabase || 'postgres',
          tableName,
          status: 'COMMITTED',
          startedAt: new Date().toISOString(),
          statements: [
            {
              id: `stmt_${Date.now()}`,
              type: 'DELETE',
              sql: deleteSql,
              tableName,
              rowId: deletedId,
              rowsAffected: 1,
              durationMs: 0.8,
              status: 'SUCCESS',
              timestamp: new Date().toISOString(),
            },
          ],
        },
        ...prev,
      ]);
    } catch {
      // Demo fallback
    }
    setTableData((prev) => {
      const remaining = prev.rows.filter((r) => String(r.id) !== String(deletedId));
      return {
        ...prev,
        rows: remaining,
        rowCount: Math.max(0, prev.rowCount - 1),
      };
    });
    onShowToast(`Baris ${String(deletedId).slice(0, 12)}... dihapus dari database`, 'delete', true);
    setIsDrawerOpen(false);
  };

  // Insert Row Handler
  const [newRowInputs, setNewRowInputs] = useState<Record<string, string>>({});
  const handleInsertRowSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!autocommit) {
      // Manual mode: stage changes into active transaction
      const newId = newRowInputs.id || `${tableName.slice(0, 3)}_${Math.random().toString(36).substring(2, 8)}`;
      const newRow: TableRow = {
        id: newId,
        ...newRowInputs,
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
      };

      if (originalRowsSnapshot.current.length === 0) {
        originalRowsSnapshot.current = [...tableData.rows];
      }

      const insertSql = generateInsertSql(tableName, { ...newRowInputs, id: newId });
      const statement: TransactionStatement = {
        id: `stmt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: 'INSERT',
        sql: insertSql,
        tableName,
        rowId: newId,
        rowsAffected: 1,
        durationMs: 0.6,
        status: 'PENDING',
        timestamp: new Date().toISOString(),
        payload: { ...newRowInputs, id: newId },
      };

      setActiveTransaction((prev) => {
        const base = prev || {
          id: `tx_${Date.now()}`,
          database: activeDatabase || 'postgres',
          tableName,
          status: 'ACTIVE',
          startedAt: new Date().toISOString(),
          statements: [],
        };
        return {
          ...base,
          statements: [...base.statements, statement],
        };
      });

      setTableData((prev) => ({
        ...prev,
        rows: [newRow, ...prev.rows],
        rowCount: prev.rowCount + 1,
      }));
      setPendingInsertedRowIds((prev) => new Set(prev).add(String(newId)));
      setIsInsertModalOpen(false);
      setNewRowInputs({});
      onShowToast(`Baris baru ditambahkan (Pending Commit di Transaction Log)`, 'add');
      return;
    }

    try {
      const res = await api.insertTableRow(tableName, newRowInputs);
      setIsInsertModalOpen(false);
      setNewRowInputs({});
      setRefreshKey((k) => k + 1);

      const insertSql = generateInsertSql(tableName, newRowInputs);
      setTransactionHistory((prev) => [
        {
          id: `tx_${Date.now()}`,
          database: activeDatabase || 'postgres',
          tableName,
          status: 'COMMITTED',
          startedAt: new Date().toISOString(),
          statements: [
            {
              id: `stmt_${Date.now()}`,
              type: 'INSERT',
              sql: insertSql,
              tableName,
              rowsAffected: 1,
              durationMs: 0.8,
              status: 'SUCCESS',
              timestamp: new Date().toISOString(),
              payload: newRowInputs,
            },
          ],
        },
        ...prev,
      ]);

      onShowToast(`Baris baru berhasil ditambahkan ke tabel ${tableName}!`, 'add');
    } catch {
      const newId = `${tableName.slice(0, 3)}_${Math.random().toString(36).substring(2, 10)}`;
      const newRow: TableRow = {
        id: newId,
        ...newRowInputs,
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
      };
      setTableData((prev) => ({
        ...prev,
        rows: [newRow, ...prev.rows],
        rowCount: prev.rowCount + 1,
      }));
      setIsInsertModalOpen(false);
      setNewRowInputs({});
      handleSelectRow(newRow);
      onShowToast(`Baris baru ditambahkan ke ${tableName} (Demo)`, 'add');
    }
  };

  // Insert Column Handler (ALTER TABLE)
  const handleAddColumn = async (newCol: {
    name: string;
    type: string;
    defaultValue?: string;
    isNullable: boolean;
    isUnique: boolean;
    comment?: string;
  }) => {
    try {
      const res = await api.addTableColumn(tableName, {
        name: newCol.name,
        type: newCol.type,
        default_value: newCol.defaultValue,
        is_nullable: newCol.isNullable,
        is_unique: newCol.isUnique,
        comment: newCol.comment,
      });

      setTableData((prev) => {
        const updatedColumns = [
          ...prev.columns,
          {
            name: newCol.name,
            type: newCol.type,
            isPk: false,
            isNullable: newCol.isNullable,
            isUnique: newCol.isUnique,
            defaultValue: newCol.defaultValue,
          },
        ];

        const updatedRows = prev.rows.map((row) => ({
          ...row,
          [newCol.name]: newCol.defaultValue ?? null,
        }));

        return {
          ...prev,
          columns: updatedColumns,
          rows: updatedRows,
        };
      });

      onShowToast(
        res?.message || `Kolom "${newCol.name}" berhasil ditambahkan ke ${tableName}`,
        'add_column'
      );
    } catch {
      // In demo / fallback mode if backend returns error or demo data
      setTableData((prev) => {
        const updatedColumns = [
          ...prev.columns,
          {
            name: newCol.name,
            type: newCol.type,
            isPk: false,
            isNullable: newCol.isNullable,
            isUnique: newCol.isUnique,
            defaultValue: newCol.defaultValue,
          },
        ];
        const updatedRows = prev.rows.map((row) => ({
          ...row,
          [newCol.name]: newCol.defaultValue ?? null,
        }));
        return {
          ...prev,
          columns: updatedColumns,
          rows: updatedRows,
        };
      });
      onShowToast(`Kolom "${newCol.name}" ditambahkan (ALTER TABLE)`, 'add_column');
    }
  };

  // Real Export to CSV
  const handleExportCsv = () => {
    setExportOpen(false);
    if (!tableData.rows.length) return;
    const headers = tableData.columns.map((c) => c.name).join(',');
    const rows = tableData.rows
      .map((r) =>
        tableData.columns
          .map((c) => {
            const val = r[c.name];
            if (typeof val === 'object' && val !== null) {
              return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
            }
            return `"${val ?? ''}"`;
          })
          .join(',')
      )
      .join('\n');
    const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${tableName}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast(`Exported ${tableData.rows.length} rows to CSV`, 'download');
  };

  // Real Export to JSON
  const handleExportJson = () => {
    setExportOpen(false);
    const blob = new Blob([JSON.stringify(tableData.rows, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${tableName}_export.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast(`Exported ${tableData.rows.length} rows to JSON`, 'download');
  };

  // Handle Column Header Sort Click
  const handleSort = (columnName: string) => {
    if (sortColumn === columnName) {
      setSortDirection((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortColumn(columnName);
      setSortDirection('ASC');
    }
  };

  // Filter & Sort rows
  let filteredRows = [...tableData.rows];
  if (!isLive) {
    filteredRows = filteredRows.filter((row) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const stringified = JSON.stringify(row).toLowerCase();
        if (!stringified.includes(q)) return false;
      }
      for (const cond of filterConditions) {
        const rowVal = row[cond.column];
        const valStr = String(rowVal ?? '').toLowerCase();
        const targetStr = cond.value.toLowerCase();
        switch (cond.operator) {
          case 'contains':
            if (!valStr.includes(targetStr)) return false;
            break;
          case '=':
            if (String(rowVal ?? '') !== cond.value) return false;
            break;
          case '!=':
            if (String(rowVal ?? '') === cond.value) return false;
            break;
          case '>':
            if (!(Number(rowVal) > Number(cond.value))) return false;
            break;
          case '<':
            if (!(Number(rowVal) < Number(cond.value))) return false;
            break;
          case '>=':
            if (!(Number(rowVal) >= Number(cond.value))) return false;
            break;
          case '<=':
            if (!(Number(rowVal) <= Number(cond.value))) return false;
            break;
          case 'starts_with':
            if (!valStr.startsWith(targetStr)) return false;
            break;
          case 'is_null':
            if (rowVal !== null && rowVal !== undefined) return false;
            break;
          case 'is_not_null':
            if (rowVal === null || rowVal === undefined) return false;
            break;
        }
      }
      return true;
    });

    filteredRows.sort((a, b) => {
      const valA = a[sortColumn];
      const valB = b[sortColumn];
      if (valA === valB) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'ASC' ? valA - valB : valB - valA;
      }
      return sortDirection === 'ASC'
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }

  // Live PostgreSQL pagination: backend applies LIMIT/OFFSET directly
  const totalPages = isLive
    ? Math.max(1, Math.ceil(tableData.rowCount / pageSize))
    : Math.max(1, Math.ceil(filteredRows.length / pageSize));

  const paginatedRows = isLive
    ? filteredRows
    : filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Clear row selections and unsaved edits when changing table or page
  useEffect(() => {
    setSelectedRowIds(new Set());
    setUnsavedRowEdits({});
    setEditingCell(null);
  }, [tableName, currentPage]);

  // Clear filters when switching table
  useEffect(() => {
    setFilterConditions([]);
    setIsFilterPopoverOpen(false);
  }, [tableName]);

  const isAllCurrentSelected =
    paginatedRows.length > 0 && paginatedRows.every((r) => selectedRowIds.has(getRowKey(r)));
  const isSomeCurrentSelected =
    paginatedRows.some((r) => selectedRowIds.has(getRowKey(r))) && !isAllCurrentSelected;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = isSomeCurrentSelected;
    }
  }, [isSomeCurrentSelected]);

  const handleToggleSelectAll = () => {
    if (isAllCurrentSelected) {
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        paginatedRows.forEach((r) => next.delete(getRowKey(r)));
        return next;
      });
    } else {
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        paginatedRows.forEach((r) => next.add(getRowKey(r)));
        return next;
      });
    }
  };

  const handleToggleRowSelection = (row: TableRow, e?: React.MouseEvent | React.ChangeEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const key = getRowKey(row);
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleExportSelectedRows = () => {
    const selectedRowsList = tableData.rows.filter((r) => selectedRowIds.has(getRowKey(r)));
    if (!selectedRowsList.length) return;
    const headers = tableData.columns.map((c) => c.name).join(',');
    const rows = selectedRowsList
      .map((r) =>
        tableData.columns
          .map((c) => {
            const val = r[c.name];
            if (typeof val === 'object' && val !== null) {
              return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
            }
            return `"${val ?? ''}"`;
          })
          .join(',')
      )
      .join('\n');
    const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${tableName}_selected_${selectedRowIds.size}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast(`Berhasil mengekspor ${selectedRowIds.size} baris terpilih ke CSV`, 'download');
  };

  const handleDeleteSelectedRows = async () => {
    if (!window.confirm(`Yakin ingin menghapus ${selectedRowIds.size} baris yang dipilih dari tabel ${tableName}?`)) {
      return;
    }
    const idsToDelete = Array.from(selectedRowIds);
    for (const id of idsToDelete) {
      try {
        await api.deleteTableRow(tableName, id);
      } catch (err) {
        console.error('Delete row error:', err);
      }
    }
    setTableData((prev) => {
      const remaining = prev.rows.filter((r) => !selectedRowIds.has(getRowKey(r)));
      return {
        ...prev,
        rows: remaining,
        rowCount: Math.max(0, prev.rowCount - idsToDelete.length),
      };
    });
    setSelectedRowIds(new Set());
    setRefreshKey((k) => k + 1);
    onShowToast(`${idsToDelete.length} baris berhasil dihapus dari tabel ${tableName}`, 'delete', true);
  };

  if (!tableName) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[460px] p-8 bg-surface-container-lowest rounded-xl border border-surface-container-high/60 shadow-md text-center space-y-4 my-4 animate-in fade-in duration-200">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-inner">
          <Database className="w-8 h-8" />
        </div>
        <div className="max-w-md space-y-1.5">
          <h2 className="text-lg font-bold text-on-surface">
            Database "{activeDatabase || 'postgres'}" Belum Memiliki Tabel
          </h2>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Koneksi ke database PostgreSQL aktif dan terhubung. Belum ada tabel user di skema <code className="px-1.5 py-0.5 rounded bg-surface-container font-mono text-primary text-[11px]">public</code>.
          </p>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={() => setIsCreateTableModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-on-primary font-semibold text-xs transition-colors cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Tabel Baru</span>
          </button>
          <button
            onClick={() => window.location.href = '/connections'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-medium transition-colors cursor-pointer border border-surface-container-highest"
          >
            <Server className="w-4 h-4" />
            <span>Pilih Database / Koneksi Lain</span>
          </button>
        </div>

        <CreateTableModal
          isOpen={isCreateTableModalOpen}
          onClose={() => setIsCreateTableModalOpen(false)}
          onTableCreated={(newTbl) => {
            setIsCreateTableModalOpen(false);
            if (onJumpToTable) onJumpToTable(newTbl);
          }}
          onShowToast={onShowToast}
          existingTableNames={availableTables.map((t) => t.name)}
        />
      </div>
    );
  }

  return (
    <div className={`flex flex-col w-full space-y-2 ${hasUnsavedEdits ? 'pb-24' : ''}`}>
      {/* 1. Header Breadcrumbs & View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-0.5">
        {/* Breadcrumb & Stats Meta with Real-Time Table Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 font-code-sm text-xs text-on-surface-variant">
            <span className="text-tertiary">public</span>
            <ChevronRight className="w-3 h-3 text-on-surface-variant/60" />
            <span className="text-on-surface-variant">tables</span>
            <ChevronRight className="w-3 h-3 text-on-surface-variant/60" />

            {/* Table Dropdown Switcher */}
            <div className="relative">
              <button
                onClick={() => setIsTableMenuOpen(!isTableMenuOpen)}
                className="flex items-center gap-1.5 font-semibold text-primary px-2.5 py-1 rounded-lg bg-surface-container-high border border-primary/30 hover:border-primary transition-all cursor-pointer shadow-sm text-xs font-code-sm"
                title="Pilih tabel lain di database ini"
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>{tableName}</span>
                <ChevronDown className="w-3 h-3 text-on-surface-variant" />
              </button>

              {isTableMenuOpen && (
                <div className="absolute left-0 mt-1 w-72 max-h-80 overflow-hidden bg-surface-container-low border border-surface-container-highest rounded-xl shadow-2xl z-50 font-code-sm text-xs flex flex-col animate-in fade-in zoom-in-95 duration-100">
                  <div className="p-2 border-b border-surface-container-highest/60 bg-surface-container-lowest flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
                      Daftar Tabel ({availableTables.length})
                    </span>
                    <button
                      onClick={() => setIsTableMenuOpen(false)}
                      className="text-on-surface-variant hover:text-on-surface cursor-pointer text-xs"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="px-2 py-1.5 border-b border-surface-container-highest/40 bg-surface-container-low">
                    <div className="flex items-center gap-1 px-2 py-1 rounded bg-surface-container-lowest text-on-surface-variant text-xs border border-outline-variant/30">
                      <Search className="w-3 h-3 shrink-0" />
                      <input
                        value={tableSearchFilter}
                        onChange={(e) => setTableSearchFilter(e.target.value)}
                        placeholder="Cari tabel..."
                        className="w-full bg-transparent text-on-surface outline-none text-[11px]"
                      />
                    </div>
                  </div>

                  <div className="overflow-y-auto max-h-56 p-1 space-y-0.5">
                    {availableTables
                      .filter((t) =>
                        t.name.toLowerCase().includes(tableSearchFilter.toLowerCase())
                      )
                      .map((t) => (
                        <button
                          key={t.name}
                          onClick={() => {
                            setIsTableMenuOpen(false);
                            if (onJumpToTable) onJumpToTable(t.name);
                          }}
                          className={`w-full px-2 py-1.5 rounded flex items-center justify-between text-left transition-colors cursor-pointer ${
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
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 font-label-sm text-[10px] text-on-surface-variant px-2 py-1 rounded-lg bg-surface-container-low border border-surface-container-high">
            <span className="text-on-surface font-semibold">
              {tableData.rowCount.toLocaleString()}
            </span>
            <span>rows</span>
          </div>

          {/* Real-time Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-all border border-surface-container-highest cursor-pointer font-code-sm text-[11px]"
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
            onClick={() => setSubView('grid')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-label-md transition-all cursor-pointer ${subView === 'grid'
                ? 'bg-surface-container-high text-primary font-semibold shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
              }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>Data Grid View</span>
          </button>
          <button
            onClick={() => setSubView('schema')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-label-md transition-all cursor-pointer ${subView === 'schema'
                ? 'bg-surface-container-high text-primary font-semibold shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
              }`}
          >
            <GitFork className="w-3.5 h-3.5" />
            <span>Schema Structure</span>
          </button>
          <button
            onClick={() => setSubView('ddl')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-label-md transition-all cursor-pointer ${subView === 'ddl'
                ? 'bg-surface-container-high text-primary font-semibold shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
              }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Definition DDL</span>
          </button>
        </div>
      </div>

      {subView === 'grid' ? (
        <>
          {/* 2. Main Toolbar */}
          <div className="p-1.5 bg-surface-container-low rounded-xl shadow-sm flex flex-col gap-1.5 border border-surface-container-high/60">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {/* Left Toolbar Actions */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setIsInsertModalOpen(true)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-primary text-on-primary font-label-md text-xs font-semibold rounded-lg hover:bg-primary-fixed transition-colors shadow-sm cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Insert Row</span>
                </button>

                <button
                  onClick={() => setIsAddColumnModalOpen(true)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-surface-container-high hover:bg-surface-variant text-primary font-label-md text-xs font-semibold rounded-lg transition-colors border border-primary/30 shadow-sm cursor-pointer"
                  title="Add new column to table (ALTER TABLE)"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Insert Column</span>
                </button>

                <div className="h-3.5 w-px bg-surface-container-highest"></div>

                {/* Filter Button & Popover */}
                <div className="relative flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => {
                      if (!isFilterPopoverOpen) {
                        setDraftFilters(
                          filterConditions.length > 0
                            ? [...filterConditions]
                            : [
                                {
                                  id: `flt_${Date.now()}`,
                                  column: tableData.columns[0]?.name || 'id',
                                  operator: 'contains',
                                  value: '',
                                },
                              ]
                        );
                      }
                      setIsFilterPopoverOpen(!isFilterPopoverOpen);
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-label-md text-xs transition-colors cursor-pointer border ${
                      filterConditions.length > 0
                        ? 'bg-primary/15 text-primary border-primary/40 font-bold shadow-xs'
                        : isFilterPopoverOpen
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

                  {/* Filter Popover Dropdown */}
                  {isFilterPopoverOpen && (
                    <div className="absolute left-0 top-full mt-2 w-80 sm:w-96 bg-surface-container-low border border-surface-container-highest rounded-xl shadow-2xl p-3.5 z-50 animate-in fade-in zoom-in-95 duration-150 flex flex-col gap-3 font-sans">
                      <div className="flex items-center justify-between pb-2 border-b border-surface-container-highest/60">
                        <div className="flex items-center gap-1.5 font-semibold text-xs text-on-surface">
                          <Filter className="w-3.5 h-3.5 text-primary" />
                          <span>Filter Tabel {tableName}</span>
                        </div>
                        <button
                          onClick={() => setIsFilterPopoverOpen(false)}
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
                                {tableData.columns.map((col) => (
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
                        onClick={() => {
                          setDraftFilters((prev) => [
                            ...prev,
                            {
                              id: `flt_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
                              column: tableData.columns[0]?.name || 'id',
                              operator: 'contains',
                              value: '',
                            },
                          ]);
                        }}
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium py-0.5 cursor-pointer w-fit"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Kondisi</span>
                      </button>

                      <div className="flex items-center justify-between pt-2 border-t border-surface-container-highest/60">
                        <button
                          onClick={() => {
                            setDraftFilters([]);
                            setFilterConditions([]);
                            setIsFilterPopoverOpen(false);
                            setCurrentPage(1);
                            onShowToast('Filter direset', 'rotate_left');
                          }}
                          className="px-2.5 py-1 rounded text-xs text-on-surface-variant hover:text-error hover:bg-surface-container transition-colors cursor-pointer"
                        >
                          Reset
                        </button>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setIsFilterPopoverOpen(false)}
                            className="px-2.5 py-1 rounded text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                          >
                            Tutup
                          </button>
                          <button
                            onClick={() => {
                              const valid = draftFilters.filter(
                                (c) => c.operator === 'is_null' || c.operator === 'is_not_null' || c.value.trim() !== ''
                              );
                              setFilterConditions(valid);
                              setIsFilterPopoverOpen(false);
                              setCurrentPage(1);
                              onShowToast(`Filter diterapkan (${valid.length} kondisi)`, 'filter_alt');
                            }}
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
                        onClick={() => {
                          setFilterConditions((prev) => prev.filter((c) => c.id !== cond.id));
                          setCurrentPage(1);
                        }}
                        className="text-on-surface-variant hover:text-error ml-0.5 flex items-center cursor-pointer"
                        title="Hapus filter ini"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Sort Indicator Button */}
                <button
                  onClick={() => setSortDirection((d) => (d === 'ASC' ? 'DESC' : 'ASC'))}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-xs transition-colors cursor-pointer border border-surface-container-high"
                  title="Click to toggle Sort direction"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-primary" />
                  <span className="font-code-sm text-primary font-medium">
                    {sortColumn} {sortDirection}
                  </span>
                </button>
              </div>

              {/* Right Toolbar Tools */}
              <div className="flex items-center gap-2">
                {/* Search Box */}
                <div className="relative flex items-center">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 text-on-surface-variant pointer-events-none" />
                  <input
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-7 pr-7 py-1.5 w-48 sm:w-60 rounded-lg bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant/50 font-code-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary border border-surface-container-high"
                    placeholder={`Search in ${tableData.rowCount.toLocaleString()} records...`}
                    type="text"
                  />
                  {searchQuery ? (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
                    >
                      ×
                    </button>
                  ) : (
                    <span className="absolute right-2 font-code-sm text-on-surface-variant/40 text-[10px]">
                      .*
                    </span>
                  )}
                </div>

                {/* Export Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setExportOpen(!exportOpen)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-xs cursor-pointer border border-surface-container-high"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>

                  {exportOpen && (
                    <div className="absolute right-0 mt-1 flex flex-col w-48 bg-surface-container-high border border-surface-container-highest p-1.5 rounded-xl shadow-2xl z-30 font-code-sm text-xs">
                      <button
                        onClick={handleExportCsv}
                        className="px-2.5 py-1.5 rounded hover:bg-surface-container-highest text-on-surface flex items-center justify-between text-left cursor-pointer"
                      >
                        <span>CSV (.csv)</span>
                        <span className="text-primary text-[10px] font-bold">DOWNLOAD</span>
                      </button>
                      <button
                        onClick={handleExportJson}
                        className="px-2.5 py-1.5 rounded hover:bg-surface-container-highest text-on-surface flex items-center justify-between text-left cursor-pointer"
                      >
                        <span>JSON Array</span>
                        <span className="text-secondary text-[10px] font-bold">DOWNLOAD</span>
                      </button>
                      <button
                        onClick={() => {
                          setExportOpen(false);
                          onShowToast('SQL INSERT dump generated', 'download');
                        }}
                        className="px-2.5 py-1.5 rounded hover:bg-surface-container-highest text-on-surface flex items-center justify-between text-left cursor-pointer"
                      >
                        <span>SQL INSERTs</span>
                        <span className="text-on-surface-variant text-[10px]">DUMP</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Inspect Row Toggle */}
                <button
                  onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-label-md text-xs transition-colors cursor-pointer border ${isDrawerOpen
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

          {/* 3. Main Data Grid Canvas & Drawer Split */}
          <div className="flex gap-3 items-start w-full relative">
            {/* Left Data Grid */}
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
                      onClick={handleExportSelectedRows}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-colors cursor-pointer border border-surface-container-highest text-xs font-medium"
                      title="Export baris terpilih ke CSV"
                    >
                      <Download className="w-3.5 h-3.5 text-primary" />
                      <span>Export CSV ({selectedRowIds.size})</span>
                    </button>
                    <button
                      onClick={handleDeleteSelectedRows}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-error/15 hover:bg-error/25 text-error transition-colors cursor-pointer border border-error/30 text-xs font-semibold"
                      title="Hapus baris terpilih dari database"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus ({selectedRowIds.size})</span>
                    </button>
                    <button
                      onClick={() => setSelectedRowIds(new Set())}
                      className="px-2 py-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer text-xs"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-auto w-full max-h-[calc(100vh-14rem)] relative">
                <table className="w-full text-left border-collapse select-none">
                  <thead className="sticky top-0 z-20 bg-surface-container-low shadow-xs">
                    <tr className="bg-surface-container-low text-on-surface-variant font-code-sm text-xs border-b border-surface-container-high/60 shadow-xs">
                      <th className="w-10 px-3 py-2 text-center bg-surface-container-low sticky left-0 top-0 z-30">
                        <input
                          ref={headerCheckboxRef}
                          type="checkbox"
                          checked={isAllCurrentSelected}
                          onChange={handleToggleSelectAll}
                          className="theme-checkbox"
                          title={isAllCurrentSelected ? 'Batal pilih semua di halaman ini' : 'Pilih semua baris di halaman ini'}
                        />
                      </th>

                      {tableData.columns.map((col) => {
                        const isSorted = sortColumn === col.name;
                        return (
                          <th
                            key={col.name}
                            onClick={() => handleSort(col.name)}
                            className="px-3 py-2 font-semibold tracking-tight text-on-surface hover:bg-surface-container transition-colors cursor-pointer bg-surface-container-low sticky top-0 z-20"
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5 truncate">
                                {col.isPk && (
                                  <span title="Primary Key" className="inline-flex items-center">
                                    <Key className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400/25 shrink-0" />
                                  </span>
                                )}
                                {col.isFk && (
                                  <span
                                    title={`Foreign Key${col.fkTarget ? `: ${col.fkTarget}` : ''}`}
                                    className="inline-flex items-center"
                                  >
                                    <Key className="w-3.5 h-3.5 text-slate-400 fill-slate-400/25 shrink-0" />
                                  </span>
                                )}
                                <span className="font-code-md text-xs">{col.name}</span>
                                <span className="px-1 py-0.2 rounded bg-surface-container-high text-on-surface-variant text-[10px]">
                                  {col.type}
                                </span>
                              </div>
                              {isSorted && sortDirection === 'DESC' ? (
                                <ArrowDown className="w-3 h-3 text-primary font-bold" />
                              ) : isSorted && sortDirection === 'ASC' ? (
                                <ArrowUp className="w-3 h-3 text-primary font-bold" />
                              ) : (
                                <ChevronsUpDown className="w-3 h-3 text-on-surface-variant/40" />
                              )}
                            </div>
                          </th>
                        );
                      })}
                      <th className="w-12 px-2 py-2 text-center sticky right-0 top-0 bg-surface-container-low z-30">
                        <button
                          onClick={() => setIsAddColumnModalOpen(true)}
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
                          colSpan={tableData.columns.length + 2}
                          className="p-8 text-center text-on-surface-variant text-xs"
                        >
                          No matching records found. Try modifying your search or filter.
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
                            onClick={() => handleSelectRow(row, false)}
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
                                onChange={(e) => handleToggleRowSelection(row, e)}
                                className="theme-checkbox"
                              />
                            </td>

                            {tableData.columns.map((col) => {
                              const val = row[col.name];
                              const isIdCol = col.name === 'id';
                              const isCustomerCol = col.name === 'customer_id';
                              const isStatusCol = col.name === 'status';
                              const isPriceCol =
                                col.name === 'total_amount' || col.name === 'price' || col.name === 'unit_price';
                              const isJson = typeof val === 'object' && val !== null;
                              const isEditingThisCell = editingCell?.rowKey === rowKey && editingCell?.colName === col.name;
                              const isCellEdited = unsavedRowEdits[rowKey]?.changes[col.name] !== undefined;

                              if (isEditingThisCell) {
                                return (
                                  <td
                                    key={col.name}
                                    className="p-1 whitespace-nowrap bg-surface-container-lowest/80"
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      autoFocus
                                      type="text"
                                      value={editingCellValue}
                                      onChange={(e) => setEditingCellValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === 'Enter') {
                                          handleCommitCellEdit();
                                        } else if (e.key === 'Escape') {
                                          handleCancelCellEdit();
                                        }
                                      }}
                                      onBlur={handleCommitCellEdit}
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
                                    handleStartCellEdit(row, col.name, val);
                                  }}
                                  title={!col.isPk ? 'Double click untuk edit' : 'Primary Key'}
                                  className={`px-3 py-2 whitespace-nowrap transition-colors relative ${
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
                                      ></span>
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
                              className={`w-12 px-2 py-2 text-right sticky right-0 z-10 ${isSelected
                                  ? 'bg-surface-container-high/90'
                                  : 'bg-surface-container-lowest group-hover:bg-surface-container'
                                }`}
                            >
                              <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectRow(row, true);
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

              {/* Status and Pagination Bar */}
              <div className="p-2.5 bg-surface-container-low flex items-center justify-between gap-3 flex-wrap text-on-surface-variant font-code-sm text-xs border-t border-surface-container-high/60">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1">
                    <span>Showing</span>
                    <span className="text-on-surface font-semibold">
                      {filteredRows.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} -{' '}
                      {Math.min(currentPage * pageSize, filteredRows.length)}
                    </span>
                    <span>of</span>
                    <span className="text-primary font-semibold">
                      {filteredRows.length.toLocaleString()}
                    </span>
                    <span>filtered rows</span>
                    <span className="text-on-surface-variant/60">
                      (Total: {tableData.rowCount.toLocaleString()})
                    </span>
                  </div>
                  <div className="h-3 w-px bg-surface-container-highest"></div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full inline-block ${
                        selectedRowIds.size > 0 ? 'bg-primary' : 'bg-surface-container-highest'
                      }`}
                    ></span>
                    <span className="text-on-surface font-medium">
                      {selectedRowIds.size > 0
                        ? `${selectedRowIds.size} baris dipilih`
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
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage <= 1}
                      className="p-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronsLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="p-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>

                    <span className="px-2.5 py-0.5 rounded bg-primary text-on-primary font-semibold text-xs">
                      {currentPage}
                    </span>

                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className="p-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage >= totalPages}
                      className="p-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronsRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="h-3 w-px bg-surface-container-highest"></div>

                  <div className="flex items-center gap-1">
                    <span>Limit:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
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
            </div>

            {/* Right Pane: Inspect Row Record Drawer (Sticky & Aligned) */}
            {isDrawerOpen && (
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
                      onClick={() => setIsDrawerOpen(false)}
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
                  {tableData.columns.map((col) => {
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
                              setFormValues({ ...formValues, [col.name]: e.target.value })
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
                              setFormValues({ ...formValues, [col.name]: e.target.value })
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
                                setFormValues({ ...formValues, [col.name]: parsed });
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
                            setFormValues({ ...formValues, [col.name]: e.target.value })
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
                    onClick={handleDeleteRow}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-error hover:bg-error/10 font-label-md text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsDrawerOpen(false)}
                      className="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-xs transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveRow}
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
            )}
          </div>
        </>
      ) : subView === 'schema' ? (
        /* Schema Structure View */
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
                onClick={() => setIsAddColumnModalOpen(true)}
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
      ) : (
        /* Definition DDL View */
        <div className="bg-surface-container-low rounded-xl p-4 border border-surface-container-high/60 shadow-sm space-y-3 font-mono">
          <div className="flex items-center justify-between">
            <span className="font-code-sm text-xs text-secondary font-semibold">
              PostgreSQL 16.2 Generated DDL: public.{tableName}
            </span>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(generateTableDdl(tableData));
                onShowToast('DDL copied to clipboard', 'content_copy');
              }}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-code-sm text-xs cursor-pointer border border-surface-container-high"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy DDL</span>
            </button>
          </div>
          <pre className="p-4 bg-surface-container-lowest rounded-lg text-on-surface text-xs leading-relaxed overflow-x-auto border border-surface-container-high">
            {generateTableDdl(tableData)}
          </pre>
        </div>
      )}

      {/* Insert Row Modal */}
      {isInsertModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-surface-container-lowest/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsInsertModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-surface-container-low border border-surface-container-high rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 bg-surface-container flex items-center justify-between border-b border-surface-container-high">
              <div className="flex items-center gap-2">
                <PlusSquare className="w-4 h-4 text-primary" />
                <span className="font-headline-sm text-sm text-on-surface font-semibold">
                  Insert Row into public.{tableName}
                </span>
              </div>
              <button
                onClick={() => setIsInsertModalOpen(false)}
                className="p-1 rounded text-on-surface-variant hover:text-on-surface cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInsertRowSubmit} className="p-4 space-y-3 overflow-y-auto">
              {tableData.columns
                .filter((c) => !c.isPk)
                .map((col) => (
                  <div key={col.name} className="space-y-1">
                    <label className="block font-label-sm text-xs font-semibold text-on-surface">
                      {col.name} <span className="text-on-surface-variant font-normal">({col.type})</span>
                    </label>
                    <input
                      placeholder={`Enter ${col.name}...`}
                      value={newRowInputs[col.name] || ''}
                      onChange={(e) =>
                        setNewRowInputs({ ...newRowInputs, [col.name]: e.target.value })
                      }
                      className="w-full px-3 py-1.5 rounded bg-surface-container-lowest text-on-surface font-code-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary border border-surface-container-high"
                    />
                  </div>
                ))}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-surface-container-high">
                <button
                  type="button"
                  onClick={() => setIsInsertModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-surface-container-high text-on-surface text-xs font-label-md cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-primary text-on-primary font-semibold text-xs hover:bg-primary-fixed shadow cursor-pointer"
                >
                  Insert Row
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Insert Column Modal */}
      <InsertColumnModal
        isOpen={isAddColumnModalOpen}
        tableName={tableName}
        existingColumns={tableData.columns}
        onClose={() => setIsAddColumnModalOpen(false)}
        onAddColumn={handleAddColumn}
      />

      <CreateTableModal
        isOpen={isCreateTableModalOpen}
        onClose={() => setIsCreateTableModalOpen(false)}
        onTableCreated={(newTbl) => {
          setIsCreateTableModalOpen(false);
          api.getCatalogSchema().then((res) => {
            if (res && res.tables) {
              setAvailableTables(
                res.tables.map((t) => ({
                  name: t.name,
                  rows: t.rows || 0,
                  size: t.size || '16 kB',
                  type: t.type || 'BASE TABLE',
                }))
              );
            }
          });
          if (onJumpToTable) {
            onJumpToTable(newTbl);
          }
        }}
        onShowToast={onShowToast}
        existingTableNames={availableTables.map((t) => t.name)}
      />

      {/* Floating Action Pill for Unsaved Changes */}
      {hasUnsavedEdits && (
        <div className="fixed bottom-9 left-1/2 -translate-x-1/2 z-40 max-w-[92vw] bg-surface-container-high/95 backdrop-blur-md border border-outline-variant/35 rounded-full pl-3.5 pr-2 py-1.5 shadow-2xl shadow-black/40 flex items-center gap-2.5 sm:gap-3 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-on-surface whitespace-nowrap">
              {unsavedCellsCount} perubahan belum disimpan
            </span>
            <span className="text-[11px] text-on-surface-variant/75 hidden sm:inline whitespace-nowrap">
              ({Object.keys(unsavedRowEdits).length} baris)
            </span>
          </div>

          <div className="h-3.5 w-px bg-outline-variant/30 shrink-0" />

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleCancelAllUnsavedEdits}
              disabled={isSavingAllEdits}
              className="px-2.5 py-1 rounded-full text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer disabled:opacity-50"
              title="Batalkan semua perubahan sel"
            >
              Batal
            </button>

            <button
              onClick={handleSaveAllUnsavedEdits}
              disabled={isSavingAllEdits}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-primary text-on-primary hover:bg-primary/90 transition-all shadow-xs cursor-pointer disabled:opacity-50 active:scale-95"
              title="Simpan semua perubahan ke database (⌘S)"
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
      )}
    </div>
  );
};

function generateTableDdl(meta: TableMeta): string {
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
