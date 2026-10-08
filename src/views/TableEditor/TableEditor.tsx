import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Database, Plus, Server } from 'lucide-react';
import { ALL_TABLES_MAP, INITIAL_ORDERS } from '../../data/mockDatabase';
import {
  TableMeta,
  TableRow,
  ActiveTransaction,
  TransactionStatement,
} from '../../types/database';
import { api } from '../../services/api';

import {
  TableEditorProps,
  TableFilterCondition,
  TableSubView,
  AvailableTableItem,
} from './types';
import {
  generateUpdateSql,
  generateInsertSql,
  generateDeleteSql,
} from './sqlGenerators';

import { TableEditorHeader } from './TableEditorHeader';
import { TableToolbar } from './TableToolbar';
import { TableDataGrid } from './TableDataGrid';
import { TablePaginationBar } from './TablePaginationBar';
import { TableDirtyPill } from './TableDirtyPill';
import { TableRowDrawer } from './TableRowDrawer';
import { InsertRowModal } from './InsertRowModal';
import { TableSchemaView } from './TableSchemaView';
import { TableDdlView } from './TableDdlView';

// Reusable Modals
import { InsertColumnModal } from './InsertColumnModal';
import { CreateTableModal } from './CreateTableModal';

export const TableEditor: React.FC<TableEditorProps> = ({
  tableName,
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
  const subView = (searchParams.get('view') as TableSubView) || 'grid';
  const setSubView = (newView: TableSubView) => {
    const next = new URLSearchParams(searchParams);
    next.set('view', newView);
    setSearchParams(next);
  };

  // Pagination synced with URL query param ?page=1
  const currentPage = parseInt(searchParams.get('page') || '1', 10) || 1;
  const setCurrentPage = (val: number | ((p: number) => number)) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const curr = parseInt(prev.get('page') || '1', 10) || 1;
      const nextVal = typeof val === 'function' ? val(curr) : val;
      next.set('page', nextVal.toString());
      return next;
    });
  };

  // Search query synced with URL query param ?search=...
  const searchQuery = searchParams.get('search') || '';
  const [isSearching, setIsSearching] = useState(false);

  const handleApplySearch = useCallback(
    (term: string) => {
      const trimmed = term.trim();
      setSearchParams((prev) => {
        const current = prev.get('search') || '';
        if (current === trimmed) return prev;
        const next = new URLSearchParams(prev);
        if (trimmed) {
          next.set('search', trimmed);
        } else {
          next.delete('search');
        }
        next.set('page', '1');
        return next;
      });
    },
    [setSearchParams]
  );

  const [tableData, setTableData] = useState<TableMeta>(() => {
    if (tableName && ALL_TABLES_MAP[tableName]) {
      return ALL_TABLES_MAP[tableName];
    }
    return {
      name: tableName || '',
      schema: 'public',
      rowCount: 0,
      sizeFormatted: '0 baris',
      heapSize: 'PostgreSQL Live',
      toastSize: '0 kB',
      columns: [],
      rows: [],
    };
  });
  const [selectedRowId, setSelectedRowId] = useState<string>('');
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [filterConditions, setFilterConditions] = useState<TableFilterCondition[]>([]);
  const [isInsertModalOpen, setIsInsertModalOpen] = useState(false);
  const [isAddColumnModalOpen, setIsAddColumnModalOpen] = useState(false);
  const [isCreateTableModalOpen, setIsCreateTableModalOpen] = useState(false);
  const [pageSize, setPageSize] = useState(25);

  // Real-time synchronization state
  const [isLive, setIsLive] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [availableTables, setAvailableTables] = useState<AvailableTableItem[]>([]);

  // Sorting
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('DESC');

  // DBeaver-style Transaction Management State
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

  // Robust row key resolver
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

  // Commit / Rollback handlers
  const handleManualCommit = useCallback(async () => {
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
  }, [activeTransaction, isLive, onShowToast, setActiveTransaction, setTransactionHistory, tableName]);

  const handleRollback = useCallback(async () => {
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
  }, [activeTransaction, isLive, onShowToast, setActiveTransaction, setTransactionHistory]);

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
    const abortController = new AbortController();

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
      if (searchQuery) {
        setIsSearching(true);
      }
      try {
        const res = await api.getTableRows(tableName, {
          page: currentPage,
          limit: pageSize,
          sort: sortColumn,
          direction: sortDirection,
          search: searchQuery,
          filter: filterConditions.length > 0 ? JSON.stringify(filterConditions) : undefined,
          signal: abortController.signal,
        });

        if (cancelled) return;

        if (res && res.is_live) {
          setIsLive(true);
          const colDefs = (res.columns || []).map((c) => ({
            name: c.name,
            type: c.type,
            isPk: c.is_pk ?? (c.name === 'id' || c.name === 'ID'),
            isNullable: c.is_nullable,
            defaultValue: c.default,
          }));

          const pkField = colDefs.find((c) => c.isPk)?.name || 'id';

          const rawRows = Array.isArray(res.rows) ? res.rows : [];
          const mappedRows: TableRow[] = rawRows.map((r, i) => ({
            id: String(r[pkField] ?? r.id ?? r.ID ?? i + 1),
            ...r,
          }));

          setTableData({
            name: tableName,
            schema: 'public',
            rowCount: res.total_count ?? mappedRows.length,
            sizeFormatted: `${res.total_count ?? mappedRows.length} baris`,
            heapSize: 'PostgreSQL Live',
            toastSize: '0 kB',
            columns:
              colDefs.length > 0
                ? colDefs
                : ALL_TABLES_MAP[tableName]?.columns || [],
            rows: mappedRows,
          });

          if (mappedRows[0]) {
            const firstId = mappedRows[0].id;
            setSelectedRowId(firstId);
            setFormValues(mappedRows[0]);
          } else {
            setSelectedRowId('');
            setFormValues({ id: '' });
          }
          return;
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || cancelled) return;
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }

      if (cancelled) return;
      setIsLive(false);
      const nextTable = ALL_TABLES_MAP[tableName] || {
        name: tableName,
        schema: 'public',
        rowCount: 0,
        sizeFormatted: '0 baris',
        heapSize: 'Local Cache',
        toastSize: '0 kB',
        columns: [],
        rows: [],
      };
      setTableData(nextTable);
      if (nextTable.rows[0]) {
        setSelectedRowId(nextTable.rows[0].id);
        setFormValues(nextTable.rows[0]);
      } else {
        setSelectedRowId('');
        setFormValues({ id: '' });
      }
    };

    loadData();
    return () => {
      cancelled = true;
      abortController.abort();
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

      // Autocommit mode
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
  const [newRowInputs, setNewRowInputs] = useState<Record<string, any>>({});
  const handleInsertRowSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!autocommit) {
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
      await api.insertTableRow(tableName, newRowInputs);
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

  // Export CSV
  const handleExportCsv = () => {
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

  // Export JSON
  const handleExportJson = () => {
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

  // Export SQL INSERTs
  const handleExportSql = () => {
    if (!tableData.rows.length) return;
    const inserts = tableData.rows.map((r) => generateInsertSql(tableName, r)).join('\n');
    const blob = new Blob([inserts], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${tableName}_inserts.sql`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast(`Exported ${tableData.rows.length} rows to SQL INSERTs`, 'download');
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

  // Filter & Sort rows (Memoized)
  const filteredRows = useMemo(() => {
    let rows = [...tableData.rows];
    if (isLive) {
      return rows;
    }

    const q = searchQuery.trim().toLowerCase();
    rows = rows.filter((row) => {
      if (q) {
        let matched = false;
        for (const key in row) {
          const val = row[key];
          if (val !== null && val !== undefined && String(val).toLowerCase().includes(q)) {
            matched = true;
            break;
          }
        }
        if (!matched) return false;
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

    if (sortColumn) {
      rows.sort((a, b) => {
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

    return rows;
  }, [tableData.rows, isLive, searchQuery, filterConditions, sortColumn, sortDirection]);

  // Live PostgreSQL pagination
  const totalPages = isLive
    ? Math.max(1, Math.ceil(tableData.rowCount / pageSize))
    : Math.max(1, Math.ceil(filteredRows.length / pageSize));

  const paginatedRows = isLive
    ? filteredRows
    : filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Clear selections and state when switching table or page
  useEffect(() => {
    setSelectedRowIds(new Set());
    setSelectedRowId('');
    setFormValues({ id: '' });
    setUnsavedRowEdits({});
    setEditingCell(null);
    setFilterConditions([]);
    if (tableName) {
      setTableData((prev) => {
        if (prev.name === tableName) return prev;
        if (ALL_TABLES_MAP[tableName]) return ALL_TABLES_MAP[tableName];
        return {
          name: tableName,
          schema: 'public',
          rowCount: 0,
          sizeFormatted: '0 baris',
          heapSize: 'PostgreSQL Live',
          toastSize: '0 kB',
          columns: [],
          rows: [],
        };
      });
    }
  }, [tableName]);

  useEffect(() => {
    setSelectedRowIds(new Set());
    setUnsavedRowEdits({});
    setEditingCell(null);
  }, [currentPage]);

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
            onClick={() => {
              window.location.href = '/connections';
            }}
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
      <TableEditorHeader
        tableName={tableName}
        rowCount={tableData.rowCount}
        availableTables={availableTables}
        isRefreshing={isRefreshing}
        subView={subView}
        onRefresh={handleRefresh}
        onSelectTable={onJumpToTable}
        onSelectSubView={setSubView}
      />

      {/* 2. Sub-views */}
      {subView === 'schema' ? (
        <TableSchemaView
          tableName={tableName}
          tableData={tableData}
          onOpenAddColumnModal={() => setIsAddColumnModalOpen(true)}
        />
      ) : subView === 'ddl' ? (
        <TableDdlView
          tableName={tableName}
          tableData={tableData}
          onShowToast={onShowToast}
        />
      ) : (
        <>
          <TableToolbar
            tableName={tableName}
            columns={tableData.columns}
            rowCount={filteredRows.length}
            filterConditions={filterConditions}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            searchQuery={searchQuery}
            isSearching={isSearching}
            isDrawerOpen={isDrawerOpen}
            onOpenInsertRowModal={() => setIsInsertModalOpen(true)}
            onOpenAddColumnModal={() => setIsAddColumnModalOpen(true)}
            onApplyFilters={setFilterConditions}
            onRemoveFilter={(id) => setFilterConditions((prev) => prev.filter((f) => f.id !== id))}
            onResetFilters={() => setFilterConditions([])}
            onToggleSortDirection={() => setSortDirection((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'))}
            onSearch={handleApplySearch}
            onExportCsv={handleExportCsv}
            onExportJson={handleExportJson}
            onExportSql={handleExportSql}
            onToggleDrawer={() => setIsDrawerOpen(!isDrawerOpen)}
          />

          <TableDataGrid
            tableData={tableData}
            paginatedRows={paginatedRows}
            selectedRowIds={selectedRowIds}
            selectedRowId={selectedRowId}
            headerCheckboxRef={headerCheckboxRef}
            isAllCurrentSelected={isAllCurrentSelected}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            editingCell={editingCell}
            editingCellValue={editingCellValue}
            unsavedRowEdits={unsavedRowEdits}
            pendingModifiedRowIds={pendingModifiedRowIds}
            pendingInsertedRowIds={pendingInsertedRowIds}
            pendingDeletedRowIds={pendingDeletedRowIds}
            getRowKey={getRowKey}
            onToggleSelectAll={handleToggleSelectAll}
            onToggleRowSelection={handleToggleRowSelection}
            onSort={handleSort}
            onOpenAddColumnModal={() => setIsAddColumnModalOpen(true)}
            onOpenInsertRowModal={() => setIsInsertModalOpen(true)}
            searchQuery={searchQuery}
            filterConditions={filterConditions}
            onSelectRow={handleSelectRow}
            onStartCellEdit={handleStartCellEdit}
            onCommitCellEdit={handleCommitCellEdit}
            onCancelCellEdit={handleCancelCellEdit}
            onEditingCellValueChange={setEditingCellValue}
            onExportSelectedRows={handleExportSelectedRows}
            onDeleteSelectedRows={handleDeleteSelectedRows}
            onClearRowSelection={() => setSelectedRowIds(new Set())}
            onJumpToTable={onJumpToTable}
            onShowToast={onShowToast}
          />

          <TablePaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalRowCount={tableData.rowCount}
            filteredRowCount={filteredRows.length}
            selectedRowCount={selectedRowIds.size}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
          />
        </>
      )}

      {/* 3. Row Inspection Drawer */}
      <TableRowDrawer
        isOpen={isDrawerOpen}
        tableName={tableName}
        columns={tableData.columns}
        formValues={formValues}
        onFormValuesChange={setFormValues}
        onSaveRow={handleSaveRow}
        onDeleteRow={handleDeleteRow}
        onClose={() => setIsDrawerOpen(false)}
        onJumpToTable={onJumpToTable}
        onShowToast={onShowToast}
      />

      {/* 4. Insert Row Modal */}
      <InsertRowModal
        isOpen={isInsertModalOpen}
        tableName={tableName}
        columns={tableData.columns}
        newRowInputs={newRowInputs}
        onInputChange={(col, val) => setNewRowInputs((prev) => ({ ...prev, [col]: val }))}
        onSubmit={handleInsertRowSubmit}
        onClose={() => setIsInsertModalOpen(false)}
      />

      {/* 5. Add Column Modal */}
      <InsertColumnModal
        isOpen={isAddColumnModalOpen}
        tableName={tableName}
        onClose={() => setIsAddColumnModalOpen(false)}
        onAddColumn={handleAddColumn}
        existingColumns={tableData.columns}
      />

      {/* 6. Create Table Modal */}
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

      {/* 7. Floating Pending Dirty Pill */}
      <TableDirtyPill
        hasUnsavedEdits={hasUnsavedEdits}
        unsavedCellsCount={unsavedCellsCount}
        unsavedRowsCount={Object.keys(unsavedRowEdits).length}
        isSavingAllEdits={isSavingAllEdits}
        onCancelAll={handleCancelAllUnsavedEdits}
        onSaveAll={handleSaveAllUnsavedEdits}
      />
    </div>
  );
};
export default TableEditor;
