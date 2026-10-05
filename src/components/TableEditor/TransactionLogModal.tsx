import React, { useState } from 'react';
import {
  X,
  ScrollText,
  Copy,
  Check,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Database,
  Trash2,
  FileCode,
  ArrowRight,
} from 'lucide-react';
import { ActiveTransaction, TransactionStatement } from '../../types/database';

interface TransactionLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTransaction: ActiveTransaction | null;
  transactionHistory: ActiveTransaction[];
  autocommit: boolean;
  activeDatabase: string;
  tableName: string;
  onCommit: () => Promise<void>;
  onRollback: () => Promise<void>;
  onClearHistory: () => void;
  onShowToast: (message: string, icon?: string, isError?: boolean) => void;
}

export const TransactionLogModal: React.FC<TransactionLogModalProps> = ({
  isOpen,
  onClose,
  activeTransaction,
  transactionHistory,
  autocommit,
  activeDatabase,
  tableName,
  onCommit,
  onRollback,
  onClearHistory,
  onShowToast,
}) => {
  const [selectedStatement, setSelectedStatement] = useState<TransactionStatement | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Combine statements from current active transaction and past history for a complete log
  const allStatements: { statement: TransactionStatement; txId: string; txStatus: string }[] = [];

  // Active statements first
  if (activeTransaction) {
    activeTransaction.statements.forEach((st) => {
      allStatements.push({
        statement: st,
        txId: activeTransaction.id,
        txStatus: activeTransaction.status,
      });
    });
  }

  // Then past history statements
  transactionHistory.forEach((tx) => {
    tx.statements.forEach((st) => {
      allStatements.push({
        statement: st,
        txId: tx.id,
        txStatus: tx.status,
      });
    });
  });

  const pendingCount = activeTransaction
    ? activeTransaction.statements.filter((s) => s.status === 'PENDING').length
    : 0;

  const handleCopySql = (sql: string, id: string) => {
    navigator.clipboard?.writeText(sql);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
    onShowToast('Statement SQL berhasil disalin', 'content_copy');
  };

  const handleCopyAllScript = () => {
    if (allStatements.length === 0) {
      onShowToast('Tidak ada statement untuk disalin', 'info');
      return;
    }

    const sqlLines = allStatements.map((item, idx) => {
      return `-- [Statement #${idx + 1} | ${item.statement.type} | ${item.statement.timestamp}]\n${item.statement.sql.trim()}${item.statement.sql.trim().endsWith(';') ? '' : ';'}`;
    });

    const script = [
      `-- ========================================================`,
      `-- pgStudio Transaction Script Log`,
      `-- Database: ${activeDatabase || 'postgres'}`,
      `-- Table: ${tableName}`,
      `-- Mode: ${autocommit ? 'AUTO-COMMIT' : 'MANUAL COMMIT'}`,
      `-- Generated: ${new Date().toISOString()}`,
      `-- ========================================================`,
      `BEGIN;`,
      ``,
      sqlLines.join('\n\n'),
      ``,
      `COMMIT;`,
    ].join('\n');

    navigator.clipboard?.writeText(script);
    onShowToast('Seluruh script transaksi berhasil disalin (BEGIN .. COMMIT)', 'content_copy');
  };

  const handleCommitClick = async () => {
    try {
      setIsProcessing(true);
      await onCommit();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRollbackClick = async () => {
    try {
      setIsProcessing(true);
      await onRollback();
    } finally {
      setIsProcessing(false);
    }
  };

  const currentStatus = activeTransaction?.status || (autocommit ? 'COMMITTED' : 'ACTIVE');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-surface-container-lowest border border-surface-container-high rounded-xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Modal Header (DBeaver style) */}
        <div className="px-5 py-3.5 border-b border-surface-container-high bg-surface-container-low flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <ScrollText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="font-headline-sm text-sm font-semibold text-on-surface">
                  Transaction Log
                </h3>
                {/* Active Status Badge */}
                {pendingCount > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                    ACTIVE ({pendingCount} Uncommitted)
                  </span>
                ) : currentStatus === 'COMMITTED' ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    COMMITTED
                  </span>
                ) : currentStatus === 'ROLLED_BACK' ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    ROLLED BACK
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-surface-container-high text-on-surface-variant border border-surface-container-highest">
                    IDLE
                  </span>
                )}
              </div>
              <p className="text-xs text-on-surface-variant flex items-center gap-1.5 mt-0.5">
                <Database className="w-3 h-3 text-secondary" />
                <span className="font-medium text-on-surface">{activeDatabase || 'postgres'}</span>
                <span>•</span>
                <span>Table:</span>
                <span className="font-mono text-primary">{tableName}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Metadata Bar */}
        <div className="px-5 py-2.5 bg-surface-container-high/40 border-b border-surface-container-high grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-[10px] uppercase font-bold text-on-surface-variant/70 tracking-wider">
              Transaction Mode
            </div>
            <div className="font-medium text-on-surface mt-0.5 flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  autocommit ? 'bg-primary' : 'bg-amber-400'
                }`}
              ></span>
              <span>{autocommit ? 'Auto-Commit (ON)' : 'Manual Commit (OFF)'}</span>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase font-bold text-on-surface-variant/70 tracking-wider">
              Active Tx ID
            </div>
            <div className="font-mono text-xs text-on-surface mt-0.5 truncate">
              {activeTransaction?.id ? activeTransaction.id.slice(0, 16) : 'None (idle)'}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase font-bold text-on-surface-variant/70 tracking-wider">
              Total Statements
            </div>
            <div className="font-medium text-on-surface mt-0.5 flex items-center gap-1">
              <FileCode className="w-3.5 h-3.5 text-secondary" />
              <span>{allStatements.length} statements</span>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase font-bold text-on-surface-variant/70 tracking-wider">
              Uncommitted Changes
            </div>
            <div
              className={`font-semibold mt-0.5 ${
                pendingCount > 0 ? 'text-amber-400' : 'text-on-surface-variant'
              }`}
            >
              {pendingCount} statement pending
            </div>
          </div>
        </div>

        {/* 3. Statements Table & Preview */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-[260px]">
          <div className="flex-1 overflow-y-auto">
            {allStatements.length === 0 ? (
              <div className="py-16 text-center text-on-surface-variant space-y-2">
                <ScrollText className="w-8 h-8 mx-auto text-on-surface-variant/40" />
                <p className="text-xs font-medium">Belum ada aktivitas transaksi pada tabel ini.</p>
                <p className="text-[11px] text-on-surface-variant/60">
                  Lakukan modifikasi baris (Edit, Insert, atau Delete) untuk melihat statement SQL tercatat di sini.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-surface-container-high bg-surface-container-low text-on-surface-variant text-[11px] font-medium sticky top-0 z-10">
                    <th className="py-2 px-3 w-10 text-center">#</th>
                    <th className="py-2 px-3 w-20">Time</th>
                    <th className="py-2 px-3 w-24">Type</th>
                    <th className="py-2 px-3">Statement SQL</th>
                    <th className="py-2 px-3 w-20 text-center">Rows</th>
                    <th className="py-2 px-3 w-24">Status</th>
                    <th className="py-2 px-3 w-12 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-high/40 font-code-sm">
                  {allStatements.map((item, index) => {
                    const st = item.statement;
                    const isSelected = selectedStatement?.id === st.id;
                    const isPending = st.status === 'PENDING';

                    return (
                      <tr
                        key={st.id || index}
                        onClick={() => setSelectedStatement(isSelected ? null : st)}
                        className={`transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-primary/10 text-on-surface'
                            : isPending
                            ? 'bg-amber-500/5 hover:bg-amber-500/10 text-on-surface'
                            : 'hover:bg-surface-container-high/50 text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        <td className="py-2 px-3 text-center text-on-surface-variant/60">
                          {index + 1}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap text-on-surface-variant text-[11px]">
                          {st.timestamp.slice(11, 19)}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              st.type === 'INSERT'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : st.type === 'UPDATE'
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                : st.type === 'DELETE'
                                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                : st.type === 'COMMIT'
                                ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                                : 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                            }`}
                          >
                            {st.type}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] truncate max-w-md">
                          <span className="text-on-surface truncate block" title={st.sql}>
                            {st.sql}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-on-surface-variant">
                          {st.rowsAffected ?? 1}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {isPending ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                              Uncommitted
                            </span>
                          ) : st.status === 'SUCCESS' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" />
                              Committed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-400">
                              <AlertCircle className="w-3 h-3" />
                              Error
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopySql(st.sql, st.id);
                            }}
                            className="p-1 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface cursor-pointer"
                            title="Copy SQL statement"
                          >
                            {copiedId === st.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Statement Inspector Drawer (Preview when row clicked) */}
          {selectedStatement && (
            <div className="p-3 bg-surface-container-high/60 border-t border-surface-container-high flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-on-surface">Selected Statement Detail:</span>
                  <span className="font-mono text-primary text-[11px]">
                    #{selectedStatement.id}
                  </span>
                  {selectedStatement.rowId != null && (
                    <span className="text-on-surface-variant text-[11px]">
                      (Target Row: {String(selectedStatement.rowId)})
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setSelectedStatement(null)}
                  className="text-on-surface-variant hover:text-on-surface text-xs cursor-pointer"
                >
                  Close Detail ×
                </button>
              </div>
              <pre className="p-2.5 rounded bg-surface-container-lowest border border-surface-container-highest font-mono text-xs text-primary overflow-x-auto select-all whitespace-pre-wrap">
                {selectedStatement.sql}
              </pre>
            </div>
          )}
        </div>

        {/* 4. Modal Footer Controls (DBeaver Style) */}
        <div className="px-5 py-3 bg-surface-container-low border-t border-surface-container-high flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyAllScript}
              disabled={allStatements.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium transition-colors border border-surface-container-high cursor-pointer disabled:opacity-40"
              title="Copy all statements as a single SQL transaction script"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy All Script</span>
            </button>

            <button
              onClick={onClearHistory}
              disabled={allStatements.length === 0 && !activeTransaction}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-error text-xs transition-colors border border-surface-container-high cursor-pointer disabled:opacity-40"
              title="Clear completed transaction history"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Log</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Rollback Button */}
            <button
              onClick={handleRollbackClick}
              disabled={pendingCount === 0 || isProcessing}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-label-md text-xs font-semibold border border-rose-500/30 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Rollback uncommitted changes and revert table data"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
              <span>Rollback</span>
            </button>

            {/* Commit Button */}
            <button
              onClick={handleCommitClick}
              disabled={pendingCount === 0 || isProcessing}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-fixed text-on-primary font-label-md text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Commit active transaction to PostgreSQL database"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Commit</span>
            </button>

            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-xs transition-colors border border-surface-container-high cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
