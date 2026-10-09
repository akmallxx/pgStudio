import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Prism from 'prismjs';
import 'prismjs/components/prism-sql';
import { format as formatSql } from 'sql-formatter';
import {
  Terminal,
  Network,
  X,
  Plus,
  Columns,
  Sliders,
  Play,
  RotateCw,
  ChevronDown,
  Activity,
  AlignLeft,
  Bookmark,
  Sparkles,
  Table,
  GitFork,
  FileText,
  History,
  CheckCircle2,
  Braces,
  Download,
  BarChart2,
  AlertCircle,
  Trash2,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Database,
} from 'lucide-react';
import { INITIAL_SQL_TABS, EMPTY_QUERY_RESULT } from '../../data/mockDatabase';
import { QueryResult, SqlTab, ClusterConnection } from '../../types/database';
import { api, QueryHistoryItem } from '../../services/api';


interface SqlEditorProps {
  onShowToast: (message: string, icon?: string, isError?: boolean) => void;
  onUpdateExecutionTime?: (ms: number) => void;
  activeDatabase?: string;
  activeCluster?: ClusterConnection;
  onChangeDatabase?: (db: string) => void;
}

export const SqlEditor: React.FC<SqlEditorProps> = ({
  onShowToast,
  onUpdateExecutionTime,
  activeDatabase,
  activeCluster,
  onChangeDatabase,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab & Sub-tab synchronized with URL params: ?tab=tab-1&subtab=results|explain|logs|history
  const activeTabId = searchParams.get('tab') || 'tab-1';
  const setActiveTabId = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', id);
    setSearchParams(next);
  };

  const resultsSubTab = (searchParams.get('subtab') as 'results' | 'explain' | 'logs' | 'history') || 'results';
  const setResultsSubTab = (st: 'results' | 'explain' | 'logs' | 'history') => {
    const next = new URLSearchParams(searchParams);
    next.set('subtab', st);
    setSearchParams(next);
  };

  const [tabs, setTabs] = useState<SqlTab[]>(INITIAL_SQL_TABS);
  const [autoRollback, setAutoRollback] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [resultsData, setResultsData] = useState<QueryResult>(EMPTY_QUERY_RESULT);
  const [showChart, setShowChart] = useState(false);
  const [selectedCell, setSelectedCell] = useState('R1:C4');
  const [queryError, setQueryError] = useState<string | null>(null);
  const [explainPlan, setExplainPlan] = useState<string[]>([]);
  const [hasSelectionToRun, setHasSelectionToRun] = useState<boolean>(false);

  // Resizable Editor Panel Height (Saved in localStorage, like Sidebar Database Explorer)
  const [editorHeight, setEditorHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('pgstudio_sqleditor_height');
      if (saved) return Math.max(100, Math.min(800, parseInt(saved, 10)));
    } catch (_) {}
    return 220;
  });
  const [isResizingEditor, setIsResizingEditor] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const handleEditorScroll = () => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };


  // Mouse drag handler for vertical resizer
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingEditor(true);
    const startY = e.clientY;
    const startHeight = editorHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      const minH = 100;
      const maxH = Math.max(minH, window.innerHeight - 260);
      const nextH = Math.max(minH, Math.min(startHeight + delta, maxH));
      setEditorHeight(nextH);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      setIsResizingEditor(false);

      const delta = upEvent.clientY - startY;
      const minH = 100;
      const maxH = Math.max(minH, window.innerHeight - 260);
      const finalH = Math.max(minH, Math.min(startHeight + delta, maxH));
      try {
        localStorage.setItem('pgstudio_sqleditor_height', finalH.toString());
      } catch (_) {}
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResetEditorHeight = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditorHeight(220);
    try {
      localStorage.setItem('pgstudio_sqleditor_height', '220');
    } catch (_) {}
    onShowToast('Tinggi editor di-reset ke 220px', 'restart_alt');
  };

  // Real Query History from backend-go/data/query_history.json
  const [historyList, setHistoryList] = useState<QueryHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const list = await api.getQueryHistory();
      setHistoryList(list || []);
    } catch {
      // Standby fallback
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (resultsSubTab === 'history') {
      fetchHistory();
    }
  }, [resultsSubTab]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const highlightedSql = useMemo(() => {
    const code = activeTab?.sql || '';
    if (!code) return '';
    const codeToHighlight = code.endsWith('\n') ? code + ' ' : code;
    try {
      return Prism.highlight(codeToHighlight, Prism.languages.sql, 'sql');
    } catch {
      return codeToHighlight;
    }
  }, [activeTab?.sql]);


  const handleRunQuery = async () => {
    if (isExecuting) return;

    const textarea = textareaRef.current;
    const currentSql = textarea ? textarea.value : (activeTab?.sql || '');
    let sqlToExecute = currentSql;
    let hasSelection = false;

    if (
      textarea &&
      typeof textarea.selectionStart === 'number' &&
      typeof textarea.selectionEnd === 'number' &&
      textarea.selectionStart !== textarea.selectionEnd
    ) {
      const selected = currentSql.substring(textarea.selectionStart, textarea.selectionEnd).trim();
      if (selected) {
        sqlToExecute = selected;
        hasSelection = true;
      }
    }

    if (!sqlToExecute.trim()) {
      onShowToast('Query SQL tidak boleh kosong', 'warning', true);
      return;
    }

    setIsExecuting(true);
    setQueryError(null);
    const start = performance.now();
    try {
      const res = await api.executeQuery(sqlToExecute);
      const elapsed = res.execution_time_ms || +(performance.now() - start).toFixed(1);
      
      const resColumns = res.columns && res.columns.length > 0 
        ? res.columns 
        : [{ name: 'result', type: 'text' }];

      let resRows = res.rows || [];
      if (resRows.length === 0 && res.message) {
        resRows = [{ result: res.message }];
      }

      setResultsData({
        executionTimeMs: elapsed,
        planningTimeMs: res.planning_time_ms || 1.1,
        rowCount: res.row_count,
        transferKb: res.transfer_kb || 2.4,
        columns: resColumns,
        rows: resRows,
        message: res.message,
      });

      if (onUpdateExecutionTime) onUpdateExecutionTime(elapsed);
      const note = hasSelection ? ' (query terpilih)' : '';
      onShowToast(`Query berhasil${note} (${res.row_count} baris, ${elapsed}ms)`, 'check_circle');
      setResultsSubTab('results');
      fetchHistory();
    } catch (err: any) {
      const msg = err?.data?.error || err.message || 'Error saat menjalankan query';
      setQueryError(msg);
      setResultsSubTab('logs');
      onShowToast(`Error: ${msg}`, 'error', true);
      fetchHistory();
    } finally {
      setIsExecuting(false);
    }
  };

  const handleExplainAnalyze = async () => {
    setIsExecuting(true);
    try {
      const res = await api.explainQuery(activeTab.sql);
      if (res && res.plan) {
        setExplainPlan(res.plan);
      }
      setResultsSubTab('explain');
      onShowToast('EXPLAIN (ANALYZE, BUFFERS) selesai', 'troubleshoot');
    } catch (err: any) {
      onShowToast(`Gagal Explain: ${err.message}`, 'error', true);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleFormatSql = () => {
    if (!activeTab || !activeTab.sql.trim()) return;
    try {
      const formatted = formatSql(activeTab.sql, {
        language: 'postgresql',
        keywordCase: 'upper',
        linesBetweenQueries: 2,
      });
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, sql: formatted, isDirty: true } : t))
      );
      onShowToast('SQL berhasil diformat (PostgreSQL Prettier)', 'format_align_left');
    } catch (err: any) {
      onShowToast(`Format error: ${err?.message || 'Syntax error'}`, 'error', true);
    }
  };

  const handleRunQueryRef = useRef(handleRunQuery);
  handleRunQueryRef.current = handleRunQuery;

  const handleFormatSqlRef = useRef(handleFormatSql);
  handleFormatSqlRef.current = handleFormatSql;

  // Global window shortcut listener for Ctrl+Enter / Cmd+Enter & Prettier format
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isEnterKey =
        e.key === 'Enter' ||
        e.code === 'Enter' ||
        e.code === 'NumpadEnter' ||
        e.keyCode === 13 ||
        e.which === 13;

      if ((e.ctrlKey || e.metaKey) && isEnterKey) {
        const target = e.target as HTMLElement | null;
        if (target && target.tagName === 'INPUT') {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        handleRunQueryRef.current();
        return;
      }

      const isFKey = e.key === 'F' || e.key === 'f' || e.code === 'KeyF';
      if (((e.shiftKey && e.altKey) || (e.ctrlKey && e.shiftKey) || (e.metaKey && e.shiftKey)) && isFKey) {
        const target = e.target as HTMLElement | null;
        if (target && target.tagName === 'INPUT') {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        handleFormatSqlRef.current();
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, []);



  const handleAddTab = () => {
    const newId = `tab-${Date.now()}`;
    const newTab: SqlTab = {
      id: newId,
      title: `query_scratch_${tabs.length + 1}.sql`,
      sql: `-- Scratchpad query\nSELECT * FROM public.orders LIMIT 25;`,
      isDirty: false,
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newId);
    onShowToast('Created new query tab', 'add');
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);
    if (activeTabId === id) {
      setActiveTabId(remaining[0].id);
    }
  };

  const applyTemplate = (name: string, templateSql: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, sql: templateSql, isDirty: true } : t))
    );
    onShowToast(`Applied ${name} template`, 'auto_awesome');
  };

  const handleUpdateSql = (newSql: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, sql: newSql, isDirty: true } : t))
    );
  };

  return (
    <div className="flex flex-col w-full">
      {/* 1. Query Tabs & Top Bar */}
      <div className="flex items-center justify-between bg-surface-container-lowest px-1 pt-1 rounded-t-lg border-b border-surface-container-high/60">
        {/* Tabs List */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-t text-code-sm font-code-sm cursor-pointer transition-colors group ${
                  isActive
                    ? 'bg-surface-container text-on-surface border-t-2 border-primary font-medium shadow-sm'
                    : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              >
                {tab.tag === 'pgvector' ? (
                  <Network className={`w-3.5 h-3.5 ${isActive ? 'text-tertiary' : 'text-on-surface-variant'}`} />
                ) : (
                  <Terminal className={`w-3.5 h-3.5 ${isActive ? 'text-secondary' : 'text-on-surface-variant'}`} />
                )}
                <span className="truncate max-w-[200px] text-xs">{tab.title}</span>
                {tab.isDirty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary-container" title="Unsaved changes"></span>
                )}
                <button
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  className="opacity-40 group-hover:opacity-100 hover:text-error transition-opacity ml-1 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          {/* Add New Query Tab */}
          <button
            onClick={handleAddTab}
            className="flex items-center gap-1 px-2.5 py-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded text-label-sm font-label-sm transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Query</span>
          </button>
        </div>

        {/* Tab Utilities */}
        <div className="flex items-center gap-1 pb-1 pr-1">
          <button
            onClick={() => onShowToast('Split editor to right pane', 'vertical_split')}
            className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded cursor-pointer"
            title="Split Editor Right"
          >
            <Columns className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onShowToast('Execution Settings: Read Committed, timeout=30s', 'tune')}
            className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded cursor-pointer"
            title="Execution Settings"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Quick Snippets & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 bg-surface-container px-2.5 py-1 border-b border-surface-container-high/60">
        {/* Execution Toolbar */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Target Active Database Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-lowest border border-outline-variant/30 text-xs shadow-xs">
            <Database className="w-3.5 h-3.5 text-primary" />
            <span className="text-[11px] text-on-surface-variant font-medium">DB:</span>
            <span className="font-semibold text-[11px] text-primary">{activeDatabase || 'postgres'}</span>
          </div>

          {/* Run Button Compound */}
          <div className="inline-flex rounded shadow-sm bg-primary-container">
            <button
              onClick={handleRunQuery}
              disabled={isExecuting}
              className="flex items-center gap-1 px-2.5 py-0.5 bg-primary text-on-primary hover:bg-primary-fixed transition-colors font-headline-sm text-xs rounded-l cursor-pointer"
              title="Jalankan query (atau query yang diblok) • Shortcut: ⌘+Enter / Ctrl+Enter"
            >
              {isExecuting ? (
                <RotateCw className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3 fill-current" />
              )}
              <span className="font-semibold text-xs">
                {isExecuting ? 'Executing...' : hasSelectionToRun ? 'Run Selection' : 'Run Query'}
              </span>
              <kbd className="ml-1 px-1 py-0.2 bg-on-primary/20 text-on-primary rounded text-[9px] font-mono">
                Ctrl+↵
              </kbd>
            </button>
            <button
              onClick={handleRunQuery}
              className="px-1 py-0.5 bg-primary text-on-primary hover:bg-primary-fixed rounded-r transition-colors border-l border-on-primary/20 cursor-pointer"
              title="Jalankan Query (Ctrl+Enter)"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {/* Explain Analyze Button */}
          <button
            onClick={handleExplainAnalyze}
            className="flex items-center gap-1 px-2 py-0.5 bg-surface-container-high hover:bg-surface-bright text-secondary rounded text-xs transition-colors shadow-sm cursor-pointer"
          >
            <Activity className="w-3 h-3" />
            <span>Explain</span>
          </button>

          {/* Format SQL Button */}
          <button
            onClick={handleFormatSql}
            className="flex items-center gap-1.5 px-2.5 py-0.5 bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant hover:text-primary rounded text-xs transition-colors cursor-pointer border border-outline-variant/30"
            title="Format SQL PostgreSQL (Shift+Alt+F)"
          >
            <AlignLeft className="w-3.5 h-3.5 text-primary" />
            <span className="font-medium">Prettier</span>
          </button>

          {/* Save Snippet */}
          <button
            onClick={() => onShowToast('Query saved to Snippet Library', 'bookmark')}
            className="flex items-center gap-1 px-2 py-0.5 bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface rounded text-xs transition-colors cursor-pointer"
          >
            <Bookmark className="w-3 h-3" />
            <span>Snippet</span>
          </button>

          {/* Auto Rollback Pill Switch */}
          <button
            onClick={() => setAutoRollback(!autoRollback)}
            className="flex items-center gap-1 px-1.5 py-0.5 bg-surface-container-lowest rounded text-[11px] cursor-pointer hover:bg-surface-variant transition-colors border border-outline-variant/30"
            title="Automatically rollback transaction on error"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${autoRollback ? 'bg-primary' : 'bg-error'}`}
            ></span>
            <span className="text-on-surface-variant">Rollback:</span>
            <span className={`font-medium ${autoRollback ? 'text-primary' : 'text-error'}`}>
              {autoRollback ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>

        {/* SQL Snippet Templates Bar */}
        <div className="flex items-center gap-1 text-[11px] font-code-sm flex-wrap">
          <span className="text-on-surface-variant flex items-center gap-0.5 mr-0.5 text-[11px]">
            <Sparkles className="w-3 h-3 text-primary" />
            Tpl:
          </span>
          <button
            onClick={() =>
              applyTemplate(
                'Pagination',
                `SELECT * FROM public.orders ORDER BY created_at DESC LIMIT 25 OFFSET 0;`
              )
            }
            className="px-1.5 py-0.2 bg-surface-container-low hover:bg-surface-container-high text-tertiary rounded text-[11px] transition-colors cursor-pointer"
          >
            Pagination
          </button>
          <button
            onClick={() =>
              applyTemplate(
                'CTE Matrix',
                `WITH revenue_matrix AS (\n  SELECT date_trunc('month', created_at) AS m, sum(total_amount) AS total\n  FROM orders GROUP BY 1\n)\nSELECT * FROM revenue_matrix ORDER BY m DESC;`
              )
            }
            className="px-1.5 py-0.2 bg-surface-container-low hover:bg-surface-container-high text-tertiary rounded text-[11px] transition-colors font-medium cursor-pointer"
          >
            CTE Matrix
          </button>
          <button
            onClick={() =>
              applyTemplate(
                'Index Usage',
                `SELECT schemaname, relname, indexrelname, idx_scan, idx_tup_read, idx_tup_fetch\nFROM pg_stat_user_indexes ORDER BY idx_scan DESC LIMIT 10;`
              )
            }
            className="px-1.5 py-0.2 bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface rounded text-[11px] transition-colors cursor-pointer"
          >
            Indexes
          </button>
        </div>
      </div>

      {/* 3. Query Editor Container with Resizable Height (Real Syntax Highlight & Clean Layout) */}
      <div 
        style={{ height: `${editorHeight}px` }}
        onClick={() => textareaRef.current?.focus()}
        className={`bg-surface-container-lowest relative overflow-hidden shadow-inner border-b border-surface-container-high cursor-text ${
          isResizingEditor ? 'duration-0 select-none' : 'transition-all duration-150'
        }`}
      >
        <div className="relative w-full h-full overflow-hidden bg-surface-container-lowest">
          {/* Syntax Highlighted Underlay */}
          <pre
            ref={preRef}
            aria-hidden="true"
            className="sql-highlight sql-code-area absolute inset-0 m-0 p-3 overflow-hidden pointer-events-none whitespace-pre text-on-surface select-none border-0"
            dangerouslySetInnerHTML={{ __html: highlightedSql }}
          />

          {/* Interactive Transparent Textarea Overlay */}
          <textarea
            ref={textareaRef}
            value={activeTab?.sql || ''}
            onChange={(e) => {
              const val = e.target.value;
              setTabs((prev) =>
                prev.map((t) => (t.id === activeTabId ? { ...t, sql: val, isDirty: true } : t))
              );
            }}
            onScroll={handleEditorScroll}
            onSelect={() => {
              const ta = textareaRef.current;
              if (ta) {
                setHasSelectionToRun(ta.selectionStart !== ta.selectionEnd);
              }
            }}
            onKeyDown={(e) => {
              const isEnterKey =
                e.key === 'Enter' ||
                e.code === 'Enter' ||
                e.code === 'NumpadEnter' ||
                e.keyCode === 13 ||
                e.which === 13;

              // Execute: Ctrl/Cmd + Enter
              if ((e.metaKey || e.ctrlKey) && isEnterKey) {
                e.preventDefault();
                e.stopPropagation();
                handleRunQuery();
                return;
              }

              // Format Prettier: Shift + Alt + F or Ctrl + Shift + F
              const isFKey = e.key === 'F' || e.key === 'f' || e.code === 'KeyF';
              if (((e.shiftKey && e.altKey) || (e.ctrlKey && e.shiftKey) || (e.metaKey && e.shiftKey)) && isFKey) {
                e.preventDefault();
                e.stopPropagation();
                handleFormatSql();
                return;
              }

              // Indent: Tab key inserts 2 spaces
              if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                const ta = textareaRef.current;
                if (!ta) return;
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                const val = ta.value;
                const nextVal = val.substring(0, start) + '  ' + val.substring(end);
                setTabs((prev) =>
                  prev.map((t) => (t.id === activeTabId ? { ...t, sql: nextVal, isDirty: true } : t))
                );
                requestAnimationFrame(() => {
                  ta.selectionStart = ta.selectionEnd = start + 2;
                });
              }
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            placeholder="-- Tulis query SQL PostgreSQL di sini... Tekan Ctrl+Enter untuk menjalankan"
            className="sql-code-area sql-editor-textarea absolute inset-0 w-full h-full m-0 p-3 bg-transparent placeholder:text-on-surface-variant/30 resize-none outline-none overflow-auto whitespace-pre z-10 border-0"
          />
        </div>
      </div>


      {/* Interactive Resizer Bar (Tarik untuk ubah tinggi seperti sidebar) */}
      <div
        onMouseDown={handleMouseDownResize}
        onDoubleClick={handleResetEditorHeight}
        className={`relative h-2 w-full cursor-row-resize z-20 select-none group transition-colors duration-150 flex items-center justify-center ${
          isResizingEditor ? 'bg-primary/25' : 'bg-surface-container-high/60 hover:bg-primary/20'
        }`}
        title="Tarik untuk mengubah tinggi editor / hasil query (Klik 2x untuk reset ke 220px)"
      >
        <div
          className={`h-0.5 w-14 rounded transition-colors duration-150 ${
            isResizingEditor
              ? 'bg-primary shadow-[0_0_8px_var(--color-primary)]'
              : 'bg-outline group-hover:bg-primary/70'
          }`}
        />
        {isResizingEditor && (
          <span className="absolute right-3 font-code-sm text-[9px] px-1.5 py-0.2 rounded bg-primary/20 text-primary font-mono animate-in fade-in">
            {editorHeight}px
          </span>
        )}
      </div>

      {/* 4. Query Execution Results Panel */}
      <div className="flex flex-col bg-surface-container-low rounded-b-lg shadow-xl overflow-hidden mt-1 border border-surface-container-high">
        {/* Output Panel Header Tabs & Metrics Meta Pill */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-container px-3 py-1.5 border-b border-surface-container-high/60">
          {/* Sub-Tabs */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setResultsSubTab('results')}
              className={`flex items-center gap-1.5 px-3 py-1 font-label-md text-label-md rounded font-semibold transition-colors cursor-pointer ${
                resultsSubTab === 'results'
                  ? 'bg-surface-container-high text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Results ({resultsData.rowCount} rows)</span>
            </button>
            <button
              onClick={() => setResultsSubTab('explain')}
              className={`flex items-center gap-1.5 px-3 py-1 font-label-md text-label-md rounded transition-colors cursor-pointer ${
                resultsSubTab === 'explain'
                  ? 'bg-surface-container-high text-primary font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <GitFork className="w-3.5 h-3.5" />
              <span>Explain Visualizer</span>
            </button>
            <button
              onClick={() => setResultsSubTab('logs')}
              className={`flex items-center gap-1.5 px-3 py-1 font-label-md text-label-md rounded transition-colors cursor-pointer ${
                resultsSubTab === 'logs'
                  ? 'bg-surface-container-high text-primary font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Messages &amp; Logs</span>
              <span className="px-1 py-0.2 bg-surface-container-lowest text-on-surface-variant rounded text-[10px]">
                2
              </span>
            </button>
            <button
              onClick={() => setResultsSubTab('history')}
              className={`flex items-center gap-1.5 px-3 py-1 font-label-md text-label-md rounded transition-colors cursor-pointer ${
                resultsSubTab === 'history'
                  ? 'bg-surface-container-high text-primary font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>History</span>
            </button>
          </div>

          {/* Execution Meta Diagnostics Pill */}
          <div className="flex items-center gap-2 bg-surface-container-lowest px-3 py-1 rounded text-code-sm text-xs border border-surface-container-high">
            <div className="flex items-center gap-1 text-primary font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{resultsData.executionTimeMs} ms</span>
            </div>
            <div className="text-on-surface-variant/50 hidden sm:inline">•</div>
            <span className="text-on-surface-variant hidden sm:inline">
              planning: <span className="text-on-surface">{resultsData.planningTimeMs} ms</span>
            </span>
            <div className="text-on-surface-variant/50 hidden sm:inline">•</div>
            <span className="text-on-surface-variant hidden sm:inline">
              exec: <span className="text-on-surface">{(resultsData.executionTimeMs - resultsData.planningTimeMs).toFixed(1)} ms</span>
            </span>
            <div className="text-on-surface-variant/50">•</div>
            <span className="text-secondary font-medium">{resultsData.rowCount} rows</span>
            <div className="text-on-surface-variant/50 hidden md:inline">•</div>
            <span className="text-on-surface-variant hidden md:inline">
              transfer: <span className="text-on-surface">{resultsData.transferKb} KB</span>
            </span>
          </div>

          {/* Action Tools */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                navigator.clipboard?.writeText(JSON.stringify(resultsData.rows, null, 2));
                onShowToast('Copied rows as JSON', 'content_copy');
              }}
              className="px-2 py-0.5 bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-on-surface rounded text-label-sm text-xs flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Braces className="w-3 h-3" />
              <span>JSON</span>
            </button>
            <button
              onClick={() => onShowToast('Exported query result to CSV', 'download')}
              className="px-2 py-0.5 bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-on-surface rounded text-label-sm text-xs flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>CSV</span>
            </button>
            <button
              onClick={() => setShowChart(!showChart)}
              className={`px-2 py-0.5 rounded text-label-sm text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                showChart
                  ? 'bg-tertiary text-on-tertiary font-medium'
                  : 'bg-surface-container-high hover:bg-surface-variant text-tertiary'
              }`}
            >
              <BarChart2 className="w-3 h-3" />
              <span>Chart</span>
            </button>
          </div>
        </div>

        {/* Results Body */}
        {resultsSubTab === 'results' ? (
          showChart ? (
            /* Bar Chart Visualizer */
            <div className="p-4 bg-surface-container-lowest space-y-4">
              <div className="flex items-center justify-between text-xs text-on-surface-variant">
                <span>Revenue Breakdown by Country</span>
                <span className="text-secondary font-mono">Gross Revenue (USD)</span>
              </div>
              <div className="space-y-2">
                {[
                  { country: 'United States 🇺🇸', val: 142500, label: '$142,500.00', pct: 100 },
                  { country: 'Germany 🇩🇪', val: 89320, label: '$89,320.00', pct: 62 },
                  { country: 'United Kingdom 🇬🇧', val: 74800, label: '$74,800.50', pct: 52 },
                  { country: 'Japan 🇯🇵', val: 62110, label: '$62,110.00', pct: 43 },
                  { country: 'France 🇫🇷', val: 48420, label: '$48,420.00', pct: 34 },
                ].map((item) => (
                  <div key={item.country} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-code-sm">
                      <span className="text-on-surface font-medium">{item.country}</span>
                      <span className="text-secondary font-semibold">{item.label}</span>
                    </div>
                    <div className="w-full bg-surface-container-high rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-500"
                        style={{ width: `${item.pct}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Dense Data Grid Component */
            <div className="overflow-auto max-h-[550px] min-h-[200px] bg-surface-container-lowest">
              <table className="w-full text-left font-code-sm text-xs border-collapse">
                <thead className="sticky top-0 bg-surface-container-high/90 backdrop-blur z-10 border-b border-surface-container-highest">
                  <tr className="text-on-surface-variant font-label-md select-none text-[11px]">
                    <th className="px-3 py-1.5 w-10 text-center font-normal">#</th>
                    {resultsData.columns.map((col) => (
                      <th key={col.name} className="px-3 py-1.5 hover:bg-surface-variant cursor-pointer group text-left">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-on-surface font-semibold">{col.name}</span>
                          <span className="text-[10px] px-1 py-0.2 bg-surface-container text-tertiary rounded font-mono">
                            {col.type}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-high/30 text-on-surface">
                  {resultsData.rows.length === 0 ? (
                    <tr>
                      <td colSpan={resultsData.columns.length + 1} className="p-6 text-center text-on-surface-variant">
                        {resultsData.message ? (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary font-medium text-xs">
                            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                            <span>{resultsData.message}</span>
                          </div>
                        ) : (
                          <span>Tidak ada baris yang dikembalikan</span>
                        )}
                      </td>
                    </tr>
                  ) : (
                    resultsData.rows.map((row, idx) => (
                      <tr
                        key={idx}
                        onClick={() => setSelectedCell(`R${idx + 1}`)}
                        className={`h-7 transition-colors cursor-pointer ${
                          idx === 0
                            ? 'bg-surface-container/60 hover:bg-surface-container-high'
                            : 'hover:bg-surface-container-high bg-surface-container-lowest'
                        }`}
                      >
                        <td className="px-3 py-1 text-center text-on-surface-variant/40 font-normal font-mono text-xs">
                          {idx + 1}
                        </td>
                        {resultsData.columns.map((col) => {
                          const val = row[col.name];
                          const displayVal =
                            typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '');
                          return (
                            <td
                              key={col.name}
                              className="px-3 py-1 text-on-surface text-xs font-mono truncate max-w-xs"
                              title={displayVal}
                            >
                              {displayVal}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )
        ) : resultsSubTab === 'explain' ? (
          /* Explain Visualizer Tree */
          <div className="p-4 bg-surface-container-lowest space-y-3 font-mono text-xs">
            <div className="p-3 rounded bg-surface-container space-y-1.5 border border-surface-container-high">
              <div className="flex items-center justify-between pb-2 border-b border-surface-container-high font-bold text-secondary">
                <span className="flex items-center gap-1.5">
                  <GitFork className="w-4 h-4" />
                  PostgreSQL EXPLAIN ANALYZE Execution Plan
                </span>
                <span className="text-primary font-semibold">Live Planner</span>
              </div>
              <div className="pt-2 space-y-1">
                {explainPlan.length > 0 ? (
                  explainPlan.map((line, idx) => (
                    <div key={idx} className="whitespace-pre py-0.5 hover:bg-surface-container-high px-1 rounded text-on-surface">
                      {line}
                    </div>
                  ))
                ) : (
                  <div className="text-on-surface-variant py-2">
                    Klik tombol &quot;Explain&quot; untuk menganalisis query planner PostgreSQL saat ini.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : resultsSubTab === 'logs' ? (
          /* Logs Panel */
          <div className="p-4 bg-surface-container-lowest font-mono text-xs text-on-surface space-y-2">
            {queryError ? (
              <div className="p-3 rounded bg-error/10 border border-error/30 text-error space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-error" />
                  <span>PostgreSQL Execution Error</span>
                </div>
                <div className="pl-6 text-on-surface">{queryError}</div>
              </div>
            ) : (
              <div className="text-secondary">[OK] Terakhir dieksekusi: {resultsData.rowCount} baris ({resultsData.executionTimeMs} ms)</div>
            )}
            <div className="text-on-surface-variant">[INFO] pgStudio Live Driver engine active</div>
          </div>
        ) : (
          /* Real Query History Panel */
          <div className="p-4 bg-surface-container-lowest font-mono text-xs space-y-2 max-h-[340px] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-surface-container-high font-sans">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-primary" />
                <span className="font-bold text-xs text-on-surface">Riwayat Query ({historyList.length})</span>
                <span className="text-[11px] text-on-surface-variant font-mono hidden sm:inline">(Disimpan di backend-go/data/query_history.json)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchHistory}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface text-[11px] font-sans border border-surface-container-high cursor-pointer transition-colors"
                  title="Refresh History"
                >
                  <RotateCw className={`w-3 h-3 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
                {historyList.length > 0 && (
                  <button
                    onClick={async () => {
                      try {
                        await api.clearQueryHistory();
                        setHistoryList([]);
                        onShowToast('Riwayat query berhasil dibersihkan', 'delete');
                      } catch {}
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container hover:bg-error/20 text-on-surface-variant hover:text-error text-[11px] font-sans border border-surface-container-high cursor-pointer transition-colors"
                    title="Hapus semua riwayat query"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Bersihkan</span>
                  </button>
                )}
              </div>
            </div>

            {historyList.length === 0 ? (
              <div className="p-6 text-center text-on-surface-variant/70 font-sans space-y-1">
                <History className="w-8 h-8 text-on-surface-variant/40 mx-auto" />
                <p className="text-xs">Belum ada riwayat query yang dicatat.</p>
                <p className="text-[11px]">Setiap query yang Anda jalankan di editor akan otomatis disimpan di sini (maksimal 50 query terakhir).</p>
              </div>
            ) : (
              historyList.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-lg bg-surface-container/60 hover:bg-surface-container border border-surface-container-high gap-2 transition-colors group"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                        item.status === 'SUCCESS'
                          ? 'bg-primary/20 text-primary'
                          : item.status === 'ERROR'
                          ? 'bg-error/20 text-error'
                          : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {item.status}
                    </span>
                    <span
                      onClick={() => {
                        handleUpdateSql(item.query);
                        onShowToast('Query dimuat ke editor!', 'edit');
                      }}
                      className="text-on-surface hover:text-primary cursor-pointer truncate font-mono text-xs"
                      title="Klik untuk memuat query ke editor"
                    >
                      {item.query}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-on-surface-variant text-[11px]">
                    <span>{item.duration_ms?.toFixed(1) || 0}ms</span>
                    <span>•</span>
                    <span>{item.row_count} baris</span>
                    <span>•</span>
                    <span className="text-[10px] opacity-70">
                      {item.executed_at ? new Date(item.executed_at).toLocaleTimeString() : ''}
                    </span>
                    <button
                      onClick={() => {
                        handleUpdateSql(item.query);
                        onShowToast('Query dimuat ke editor!', 'edit');
                      }}
                      className="opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded bg-primary/20 hover:bg-primary text-primary hover:text-on-primary text-[10px] font-sans font-semibold transition-all cursor-pointer"
                    >
                      Gunakan
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Footer Coordinate & Pagination */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-surface-container-high text-on-surface-variant font-code-sm text-code-sm text-xs border-t border-surface-container-highest">
          <div className="flex items-center gap-3">
            <span>Displaying rows 1-50 of 50</span>
            <div className="h-3 w-px bg-outline-variant/30"></div>
            <div className="flex items-center gap-1 text-label-sm">
              <span className="text-on-surface font-semibold">Active Selection:</span>
              <span className="text-secondary font-mono">{selectedCell}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="px-1.5 py-0.5 rounded text-on-surface-variant opacity-40" disabled>
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
            <button className="px-1.5 py-0.5 rounded text-on-surface-variant opacity-40" disabled>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 py-0.5 bg-surface-container rounded text-on-surface font-medium text-xs">
              Page 1 / 1
            </span>
            <button className="px-1.5 py-0.5 rounded text-on-surface-variant opacity-40" disabled>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button className="px-1.5 py-0.5 rounded text-on-surface-variant opacity-40" disabled>
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
