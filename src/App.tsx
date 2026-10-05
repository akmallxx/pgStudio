import React, { useEffect, useState, useRef } from 'react';
import {
  useLocation,
  useNavigate,
  Routes,
  Route,
  Navigate,
  useParams,
} from 'react-router-dom';
import { CommandPalette } from './components/CommandPalette';
import { ConnectionSettingsModal } from './components/ConnectionSettingsModal/ConnectionSettingsModal';
import { StudioSettingsModal } from './components/StudioSettingsModal/StudioSettingsModal';
import { DatabaseOverview } from './components/DatabaseOverview/DatabaseOverview';
import { FleetConnections } from './components/FleetConnections/FleetConnections';
import { GolangArchitectureModal } from './components/GolangArchitectureModal/GolangArchitectureModal';
import { Header } from './components/Header';
import { PerformanceCockpit } from './components/PerformanceCockpit/PerformanceCockpit';
import { SchemaErd } from './components/SchemaErd/SchemaErd';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { SqlEditor } from './components/SqlEditor/SqlEditor';
import { TableEditor } from './components/TableEditor/TableEditor';
import { CreateTableModal } from './components/TableEditor/CreateTableModal';
import { ThemeMasterModal } from './components/ThemeMasterModal/ThemeMasterModal';
import { TransactionLogModal } from './components/TableEditor/TransactionLogModal';
import { ProductionAutocommitAlertModal } from './components/ProductionAutocommitAlertModal';
import { CLUSTER_CONNECTIONS } from './data/mockDatabase';
import { ActiveTransaction, ClusterConnection, DatabaseViewMode } from './types/database';
import { api } from './services/api';
import {
  CheckCircle2,
  AlertCircle,
  Trash2,
  Edit3,
  Power,
  Zap,
  Copy,
  Wifi,
} from 'lucide-react';

const renderToastIcon = (iconName: string, isError?: boolean) => {
  const cls = `w-4 h-4 shrink-0 ${isError ? 'text-error' : 'text-primary'}`;
  switch (iconName) {
    case 'delete':
      return <Trash2 className={cls} />;
    case 'edit':
      return <Edit3 className={cls} />;
    case 'power':
      return <Power className={cls} />;
    case 'bolt':
      return <Zap className={cls} />;
    case 'content_copy':
      return <Copy className={cls} />;
    case 'wifi_tethering':
    case 'wifi':
      return <Wifi className={cls} />;
    default:
      return isError ? <AlertCircle className={cls} /> : <CheckCircle2 className={cls} />;
  }
};

import {
  DEFAULT_PRESETS,
  ThemePreset,
  applyThemeToDOM,
  getSavedActiveThemeId,
  getSavedCustomPresets,
  saveActiveThemeId,
  saveCustomPresets,
} from './types/theme';

// Wrapper component to extract tableName from route params and sync with TableEditor
function TableEditorRouteWrapper({
  onSelectTable,
  onShowToast,
  activeDatabase,
  autocommit,
  onToggleAutocommit,
  activeTransaction,
  setActiveTransaction,
  transactionHistory,
  setTransactionHistory,
  onRegisterTransactionHandlers,
}: {
  onSelectTable: (tbl: string) => void;
  onShowToast: (msg: string, icon?: string, isError?: boolean) => void;
  activeDatabase: string;
  autocommit?: boolean;
  onToggleAutocommit?: () => void;
  activeTransaction?: ActiveTransaction | null;
  setActiveTransaction?: React.Dispatch<React.SetStateAction<ActiveTransaction | null>>;
  transactionHistory?: ActiveTransaction[];
  setTransactionHistory?: React.Dispatch<React.SetStateAction<ActiveTransaction[]>>;
  onRegisterTransactionHandlers?: (commitFn: () => Promise<void>, rollbackFn: () => Promise<void>) => void;
}) {
  const { tableName } = useParams<{ tableName?: string }>();
  const navigate = useNavigate();
  const [currentTable, setCurrentTable] = useState<string>(tableName || '');

  // Keep state synced immediately when route tableName changes
  useEffect(() => {
    if (tableName) {
      setCurrentTable(tableName);
      onSelectTable(tableName);
    }
  }, [tableName, onSelectTable]);

  useEffect(() => {
    let cancelled = false;
    api.getCatalogSchema()
      .then((res) => {
        if (cancelled) return;
        if (res && res.is_live) {
          const liveTables = res.tables || [];
          const tableNames = liveTables.map((t) => t.name);
          if (tableName && tableNames.includes(tableName)) {
            setCurrentTable(tableName);
            onSelectTable(tableName);
          } else if (tableNames.length > 0) {
            // Pick first live table and update URL cleanly
            const first = tableNames[0];
            setCurrentTable(first);
            onSelectTable(first);
            navigate(`/tables/${first}`, { replace: true });
          } else {
            // Live database with NO tables (e.g. postgres)
            setCurrentTable('');
            onSelectTable('');
            if (tableName) {
              navigate('/tables', { replace: true });
            }
          }
        } else {
          const fallback = tableName || 'orders';
          setCurrentTable(fallback);
          onSelectTable(fallback);
        }
      })
      .catch(() => {
        const fallback = tableName || 'orders';
        setCurrentTable(fallback);
        onSelectTable(fallback);
      });

    return () => {
      cancelled = true;
    };
  }, [tableName, navigate, onSelectTable, activeDatabase]);

  const activeTableName = tableName || currentTable;

  return (
    <TableEditor
      tableName={activeTableName}
      activeDatabase={activeDatabase}
      autocommit={autocommit}
      onToggleAutocommit={onToggleAutocommit}
      activeTransaction={activeTransaction}
      setActiveTransaction={setActiveTransaction}
      transactionHistory={transactionHistory}
      setTransactionHistory={setTransactionHistory}
      onRegisterTransactionHandlers={onRegisterTransactionHandlers}
      onJumpToTable={(tbl) => {
        navigate(`/tables/${tbl}`);
        onShowToast(`Loaded ${tbl} table`, 'table_rows');
      }}
      onShowToast={onShowToast}
    />
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  // Derive currentView directly from URL location
  const currentView: DatabaseViewMode = (() => {
    const p = location.pathname;
    if (p === '/' || p === '/connections') return 'database-connections';
    if (p.startsWith('/tables')) return 'table-editor';
    if (p === '/sql') return 'sql-editor';
    if (p === '/erd' || p === '/schema') return 'schema-and-erd';
    if (p === '/performance') return 'performance-and-logs';
    if (p === '/overview') return 'database-overview';
    return 'database-connections';
  })();

  const STORAGE_KEY_ACTIVE_CLUSTER = 'pgstudio_active_cluster';
  const STORAGE_KEY_ACTIVE_DB = 'pgstudio_active_database';
  const STORAGE_KEY_AUTOCOMMIT = 'pgstudio_autocommit';

  const [activeCluster, setActiveCluster] = useState<ClusterConnection>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_CLUSTER);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {}
    return CLUSTER_CONNECTIONS[0];
  });
  const [selectedTable, setSelectedTable] = useState<string>('orders');
  const [activeDatabase, setActiveDatabase] = useState<string>(() => {
    try {
      const savedDb = localStorage.getItem(STORAGE_KEY_ACTIVE_DB);
      if (savedDb) return savedDb;
      const savedCluster = localStorage.getItem(STORAGE_KEY_ACTIVE_CLUSTER);
      if (savedCluster) {
        const parsed = JSON.parse(savedCluster);
        if (parsed.defaultDb) return parsed.defaultDb;
      }
    } catch (e) {}
    return 'prod_ecommerce_db';
  });
  const [autocommit, setAutocommit] = useState<boolean>(() => {
    try {
      const savedAutocommit = localStorage.getItem(STORAGE_KEY_AUTOCOMMIT);
      if (savedAutocommit !== null) {
        return savedAutocommit === 'true';
      }
      const savedCluster = localStorage.getItem(STORAGE_KEY_ACTIVE_CLUSTER);
      if (savedCluster) {
        const parsed = JSON.parse(savedCluster);
        if (parsed.badge === 'PROD') return false;
      }
    } catch (e) {}
    return CLUSTER_CONNECTIONS[0]?.badge === 'PROD' ? false : true;
  });
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isConnSettingsOpen, setIsConnSettingsOpen] = useState<boolean>(false);
  const [isStudioSettingsOpen, setIsStudioSettingsOpen] = useState<boolean>(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState<boolean>(false);
  const [isGoModalOpen, setIsGoModalOpen] = useState<boolean>(false);
  const [isGlobalCreateTableOpen, setIsGlobalCreateTableOpen] = useState<boolean>(false);

  // DBeaver Transaction Control state in App
  const [activeTransaction, setActiveTransaction] = useState<ActiveTransaction | null>(null);
  const [transactionHistory, setTransactionHistory] = useState<ActiveTransaction[]>([]);
  const [isTransactionLogOpen, setIsTransactionLogOpen] = useState<boolean>(false);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [isRollingBack, setIsRollingBack] = useState<boolean>(false);

  const commitHandlerRef = useRef<(() => Promise<void>) | null>(null);
  const rollbackHandlerRef = useRef<(() => Promise<void>) | null>(null);

  const handleRegisterTransactionHandlers = (commitFn: () => Promise<void>, rollbackFn: () => Promise<void>) => {
    commitHandlerRef.current = commitFn;
    rollbackHandlerRef.current = rollbackFn;
  };

  const pendingCount = activeTransaction
    ? activeTransaction.statements.filter((s) => s.status === 'PENDING').length
    : 0;

  const handleCommit = async () => {
    if (commitHandlerRef.current) {
      setIsCommitting(true);
      try {
        await commitHandlerRef.current();
      } finally {
        setIsCommitting(false);
      }
    } else {
      try {
        setIsCommitting(true);
        await api.executeQuery('COMMIT;');
        showToast('COMMIT transaksi berhasil dijalankan', 'check_circle');
      } catch (err: any) {
        showToast(`COMMIT error: ${err?.message || 'Database error'}`, 'error', true);
      } finally {
        setIsCommitting(false);
      }
    }
  };

  const handleRollback = async () => {
    if (rollbackHandlerRef.current) {
      setIsRollingBack(true);
      try {
        await rollbackHandlerRef.current();
      } finally {
        setIsRollingBack(false);
      }
    } else {
      try {
        setIsRollingBack(true);
        await api.executeQuery('ROLLBACK;');
        showToast('ROLLBACK transaksi berhasil dijalankan', 'undo');
      } catch (err: any) {
        showToast(`ROLLBACK error: ${err?.message || 'Database error'}`, 'error', true);
      } finally {
        setIsRollingBack(false);
      }
    }
  };

  // Production Autocommit Safety Alert Modal state & toggle handler
  const [isProdAutocommitAlertOpen, setIsProdAutocommitAlertOpen] = useState<boolean>(false);

  const handleToggleAutocommit = () => {
    const isProduction =
      activeCluster?.badge === 'PROD' ||
      activeCluster?.name?.toLowerCase().includes('prod') ||
      activeDatabase?.toLowerCase().includes('prod');

    if (!autocommit) {
      // Trying to switch from OFF to ON (Auto-Commit)
      if (isProduction) {
        setIsProdAutocommitAlertOpen(true);
        return;
      }
      setAutocommit(true);
      localStorage.setItem(STORAGE_KEY_AUTOCOMMIT, 'true');
      showToast('Autocommit set to ON', 'sync_alt');
    } else {
      // Switching from ON to OFF (Manual Commit) is always safe
      setAutocommit(false);
      localStorage.setItem(STORAGE_KEY_AUTOCOMMIT, 'false');
      showToast('Autocommit set to OFF (Manual Commit aktif)', 'sync_alt');
    }
  };

  const handleConfirmProdAutocommit = () => {
    setAutocommit(true);
    localStorage.setItem(STORAGE_KEY_AUTOCOMMIT, 'true');
    setIsProdAutocommitAlertOpen(false);
    showToast('⚠️ Mode Production: Autocommit berhasil diaktifkan!', 'warning');
  };
  
  // Route-aware explorer collapsed state:
  // - table-editor & sql-editor: expanded by default (false)
  // - overview, performance, erd, connections: collapsed by default (true)
  const [explorerStateMap, setExplorerStateMap] = useState<Record<string, boolean>>({
    'database-connections': true,
    'table-editor': false,
    'sql-editor': false,
    'database-overview': true,
    'performance-and-logs': true,
    'schema-and-erd': true,
  });

  const effectiveExplorerCollapsed =
    currentView === 'database-connections' ||
    (explorerStateMap[currentView] ?? true);

  const handleToggleExplorer = () => {
    setExplorerStateMap((prev) => ({
      ...prev,
      [currentView]: !effectiveExplorerCollapsed,
    }));
  };

  // Navigation Sidebar state: default compact (false) so hover expands it smoothly
  const [isNavExpanded, setIsNavExpanded] = useState<boolean>(false);

  const handleToggleNav = () => {
    setIsNavExpanded((prev) => !prev);
  };

  const [editingConnection, setEditingConnection] = useState<ClusterConnection | undefined>();
  const [lastQueryTime, setLastQueryTime] = useState<number>(2.4);

  // Navigation router dispatcher
  const handleSelectView = (view: DatabaseViewMode) => {
    switch (view) {
      case 'database-connections':
        navigate('/connections');
        break;
      case 'table-editor':
        navigate(selectedTable ? `/tables/${selectedTable}` : '/tables');
        break;
      case 'sql-editor':
        navigate('/sql');
        break;
      case 'schema-and-erd':
        navigate('/erd');
        break;
      case 'performance-and-logs':
        navigate('/performance');
        break;
      case 'database-overview':
        navigate('/overview');
        break;
    }
  };

  // Theme Master Management State & LocalStorage Persistence
  const [customPresets, setCustomPresets] = useState<ThemePreset[]>(() => getSavedCustomPresets());
  const [activeTheme, setActiveTheme] = useState<ThemePreset>(() => {
    const savedId = getSavedActiveThemeId();
    const all = [...DEFAULT_PRESETS, ...getSavedCustomPresets()];
    return all.find((t) => t.id === savedId) || DEFAULT_PRESETS[0];
  });

  useEffect(() => {
    applyThemeToDOM(activeTheme);
  }, [activeTheme]);

  useEffect(() => {
    api.getSettings().then((s) => {
      if (s?.theme_preset) {
        const all = [...DEFAULT_PRESETS, ...getSavedCustomPresets()];
        const found = all.find((t) => t.id === s.theme_preset);
        if (found) {
          setActiveTheme(found);
          applyThemeToDOM(found);
        }
      }
    }).catch(() => {});
  }, []);

  const handleApplyTheme = (theme: ThemePreset) => {
    setActiveTheme(theme);
    saveActiveThemeId(theme.id);
    applyThemeToDOM(theme);
  };

  const handleSaveCustomPreset = (newPreset: ThemePreset) => {
    const updated = [newPreset, ...customPresets.filter((p) => p.id !== newPreset.id)];
    setCustomPresets(updated);
    saveCustomPresets(updated);
    handleApplyTheme(newPreset);
  };

  const handleDeleteCustomPreset = (id: string) => {
    const updated = customPresets.filter((p) => p.id !== id);
    setCustomPresets(updated);
    saveCustomPresets(updated);
    if (activeTheme.id === id) {
      handleApplyTheme(DEFAULT_PRESETS[0]);
    }
    showToast('Preset kustom dihapus', 'delete');
  };

  const handleResetToDefault = () => {
    handleApplyTheme(DEFAULT_PRESETS[0]);
    showToast('Tema dikembalikan ke default (Emerald Obsidian)', 'check');
  };

  // Toast Notification state
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    icon: string;
    isError: boolean;
  }>({
    show: false,
    message: '',
    icon: 'check_circle',
    isError: false,
  });

  const showToast = (message: string, icon = 'check_circle', isError = false) => {
    setToast({ show: true, message, icon, isError });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 3200);
  };

  // Sync active connection and database on mount from Go backend & saved profiles
  useEffect(() => {
    Promise.all([
      api.getCurrentConnection().catch(() => null),
      api.getSavedConnections().catch(() => null),
    ]).then(([info, savedConns]) => {
      const savedClusterStr = localStorage.getItem(STORAGE_KEY_ACTIVE_CLUSTER);
      let currentSavedCluster: ClusterConnection | null = null;
      if (savedClusterStr) {
        try {
          currentSavedCluster = JSON.parse(savedClusterStr);
        } catch (e) {}
      }

      if (info && info.connected && info.connection) {
        const c = info.connection;
        const dbName = c.database || 'pos';
        setActiveDatabase(dbName);
        localStorage.setItem(STORAGE_KEY_ACTIVE_DB, dbName);

        // Match against saved connections from backend-go or localStorage
        const matchedSaved = (savedConns || []).find(
          (s) =>
            (currentSavedCluster && s.id === currentSavedCluster.id) ||
            (s.host === c.host && s.port === c.port && s.database === c.database)
        );

        setActiveCluster((prev) => {
          const finalCluster: ClusterConnection = {
            ...prev,
            id: matchedSaved?.id || currentSavedCluster?.id || prev.id,
            name: matchedSaved?.name || currentSavedCluster?.name || prev.name,
            badge: (matchedSaved?.badge as any) || currentSavedCluster?.badge || prev.badge,
            host: c.host || prev.host,
            port: c.port || prev.port,
            user: c.user || prev.user,
            password: c.password || prev.password || 'password',
            defaultDb: dbName,
            description: `Host: ${c.host || 'localhost'}:${c.port || 5432} | Database: ${dbName}`,
          };
          localStorage.setItem(STORAGE_KEY_ACTIVE_CLUSTER, JSON.stringify(finalCluster));
          return finalCluster;
        });
      } else if (currentSavedCluster) {
        // Reconnect to PostgreSQL if connection is not live yet
        api.connect({
          host: currentSavedCluster.host,
          port: currentSavedCluster.port,
          user: currentSavedCluster.user,
          password: currentSavedCluster.password || 'password',
          database: currentSavedCluster.defaultDb || 'pos',
          ssl_mode: currentSavedCluster.sslMode,
        }).catch(() => {});
      }
    });
  }, []);

  const handleSelectCluster = async (conn: ClusterConnection) => {
    setActiveCluster(conn);
    setActiveDatabase(conn.defaultDb);
    localStorage.setItem(STORAGE_KEY_ACTIVE_CLUSTER, JSON.stringify(conn));
    localStorage.setItem(STORAGE_KEY_ACTIVE_DB, conn.defaultDb);
    setLastQueryTime(conn.latencyMs);
    try {
      await api.connect({
        host: conn.host,
        port: conn.port,
        user: conn.user,
        password: conn.password || 'password',
        database: conn.defaultDb,
        ssl_mode: conn.sslMode,
      });
      // For Production mode, default autocommit is OFF (false)
      const nextAutocommit = conn.badge === 'PROD' ? (conn.autoCommit ?? false) : (conn.autoCommit ?? true);
      setAutocommit(nextAutocommit);
      localStorage.setItem(STORAGE_KEY_AUTOCOMMIT, String(nextAutocommit));
      showToast(`Connected to ${conn.name} (${conn.defaultDb})`, 'power');
    } catch (err: any) {
      showToast(`Koneksi PostgreSQL: ${err?.message || 'Error'}`, 'warning', true);
    }
  };

  // Global key bindings (⌘K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isConnectionsDashboard = currentView === 'database-connections';

  return (
    <div className="min-h-screen bg-surface font-body-md text-on-surface antialiased flex flex-col">
      {/* Top Header */}
      <Header
        currentView={currentView}
        onSelectView={handleSelectView}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenConnectionSettings={() => {
          setEditingConnection(activeCluster);
          setIsConnSettingsOpen(true);
        }}
        onOpenStudioSettings={() => setIsStudioSettingsOpen(true)}
        onOpenGoArchitecture={() => setIsGoModalOpen(true)}
        onOpenThemeSettings={() => setIsThemeModalOpen(true)}
        autocommit={autocommit}
        onToggleAutocommit={handleToggleAutocommit}
        activeDatabase={activeDatabase}
        onChangeDatabase={async (db) => {
          setActiveDatabase(db);
          localStorage.setItem(STORAGE_KEY_ACTIVE_DB, db);
          showToast(`Menghubungkan ke database "${db}"...`, 'sync');
          try {
            await api.connect({
              host: activeCluster?.host || 'localhost',
              port: activeCluster?.port || 5432,
              user: activeCluster?.user || 'gast',
              password: activeCluster?.password || 'password',
              database: db,
              ssl_mode: activeCluster?.sslMode || 'disable',
            });
            setActiveCluster((prev) => {
              const updated = {
                ...prev,
                defaultDb: db,
                description: `Host: ${prev.host}:${prev.port} | Database: ${db}`,
              };
              localStorage.setItem(STORAGE_KEY_ACTIVE_CLUSTER, JSON.stringify(updated));
              return updated;
            });
            const schema = await api.getCatalogSchema();
            if (schema && schema.tables && schema.tables.length > 0) {
              const firstTable = schema.tables[0].name;
              setSelectedTable(firstTable);
              navigate(`/tables/${firstTable}`);
              showToast(`Database beralih ke "${db}" (Tabel: ${firstTable})`, 'database');
            } else {
              setSelectedTable('');
              navigate('/tables');
              showToast(`Database beralih ke "${db}" (0 tabel)`, 'database');
            }
          } catch (err: any) {
            showToast(`Gagal berpindah database: ${err?.message || 'Error'}`, 'error', true);
          }
        }}
        activeCluster={activeCluster}
        selectedTable={selectedTable}
        isExplorerCollapsed={effectiveExplorerCollapsed}
        onToggleExplorer={handleToggleExplorer}
        isNavExpanded={isNavExpanded}
        onToggleNav={handleToggleNav}
        onCommit={handleCommit}
        onRollback={handleRollback}
        onOpenTransactionLog={() => setIsTransactionLogOpen(true)}
        pendingTransactionCount={pendingCount}
        isCommitting={isCommitting}
        isRollingBack={isRollingBack}
      />

      {/* Activity Bar & Database Explorer Sidebar */}
      <Sidebar
        currentView={currentView}
        onSelectView={handleSelectView}
        selectedTable={selectedTable}
        onSelectTable={(tbl) => {
          setSelectedTable(tbl);
          navigate(`/tables/${tbl}`);
          showToast(`Switched to table ${tbl}`, 'table_rows');
        }}
        onOpenConnectionSettings={() => {
          setEditingConnection(activeCluster);
          setIsConnSettingsOpen(true);
        }}
        onOpenStudioSettings={() => setIsStudioSettingsOpen(true)}
        onOpenGoArchitecture={() => setIsGoModalOpen(true)}
        onOpenThemeSettings={() => setIsThemeModalOpen(true)}
        isExplorerCollapsed={effectiveExplorerCollapsed}
        onToggleExplorer={handleToggleExplorer}
        isNavExpanded={isNavExpanded}
        onToggleNav={handleToggleNav}
        activeCluster={activeCluster}
        onCreateTable={() => setIsGlobalCreateTableOpen(true)}
      />

      {/* Main Viewport Container with Adaptive Padding */}
      <div
        className={`transition-all duration-200 ${
          currentView === 'database-connections'
            ? isNavExpanded
              ? 'pl-52'
              : 'pl-11'
            : effectiveExplorerCollapsed
            ? isNavExpanded
              ? 'pl-52'
              : 'pl-11'
            : isNavExpanded
            ? 'pl-52 md:pl-[432px]'
            : 'pl-11 md:pl-[268px]'
        }`}
      >
        <main className="relative pt-14 pb-8 min-h-[calc(100vh-1.5rem)] bg-surface w-full px-2 sm:px-3 lg:px-4 max-w-full overflow-x-hidden">
          <Routes>
            {/* 1. Dashboard Pilih Koneksi (Workspace Fleet) */}
            <Route
              path="/"
              element={
                <FleetConnections
                  activeClusterId={activeCluster.id}
                  onSelectCluster={handleSelectCluster}
                  onSelectView={handleSelectView}
                  onOpenConnectionSettings={(conn) => {
                    setEditingConnection(conn || activeCluster);
                    setIsConnSettingsOpen(true);
                  }}
                  onOpenThemeSettings={() => setIsThemeModalOpen(true)}
                  onShowToast={showToast}
                />
              }
            />
            <Route
              path="/connections"
              element={
                <FleetConnections
                  activeClusterId={activeCluster.id}
                  onSelectCluster={handleSelectCluster}
                  onSelectView={handleSelectView}
                  onOpenConnectionSettings={(conn) => {
                    setEditingConnection(conn);
                    setIsConnSettingsOpen(true);
                  }}
                  onOpenThemeSettings={() => setIsThemeModalOpen(true)}
                  onShowToast={showToast}
                />
              }
            />

            {/* 2. Table Editor (with dynamic :tableName parameter) */}
            <Route
              path="/tables"
              element={
                <TableEditorRouteWrapper
                  activeDatabase={activeDatabase}
                  onSelectTable={setSelectedTable}
                  onShowToast={showToast}
                  autocommit={autocommit}
                  onToggleAutocommit={handleToggleAutocommit}
                  activeTransaction={activeTransaction}
                  setActiveTransaction={setActiveTransaction}
                  transactionHistory={transactionHistory}
                  setTransactionHistory={setTransactionHistory}
                  onRegisterTransactionHandlers={handleRegisterTransactionHandlers}
                />
              }
            />
            <Route
              path="/tables/:tableName"
              element={
                <TableEditorRouteWrapper
                  activeDatabase={activeDatabase}
                  onSelectTable={setSelectedTable}
                  onShowToast={showToast}
                  autocommit={autocommit}
                  onToggleAutocommit={handleToggleAutocommit}
                  activeTransaction={activeTransaction}
                  setActiveTransaction={setActiveTransaction}
                  transactionHistory={transactionHistory}
                  setTransactionHistory={setTransactionHistory}
                  onRegisterTransactionHandlers={handleRegisterTransactionHandlers}
                />
              }
            />

            {/* 3. SQL Scratchpad */}
            <Route
              path="/sql"
              element={
                <SqlEditor
                  onShowToast={showToast}
                  onUpdateExecutionTime={(time) => setLastQueryTime(time)}
                />
              }
            />

            {/* 4. Schema & ERD */}
            <Route
              path="/erd"
              element={
                <SchemaErd
                  onSelectTableForEditing={(tbl) => {
                    setSelectedTable(tbl);
                    navigate(`/tables/${tbl}`);
                    showToast(`Opened ${tbl} in Table Editor`, 'table_rows');
                  }}
                  onShowToast={showToast}
                />
              }
            />
            <Route path="/schema" element={<Navigate to="/erd" replace />} />

            {/* 5. Performance Cockpit */}
            <Route
              path="/performance"
              element={<PerformanceCockpit onShowToast={showToast} />}
            />

            {/* 6. Database Overview */}
            <Route
              path="/overview"
              element={
                <DatabaseOverview
                  onSelectView={handleSelectView}
                  onSelectTable={(tbl) => {
                    setSelectedTable(tbl);
                    navigate(`/tables/${tbl}`);
                  }}
                  onShowToast={showToast}
                />
              }
            />

            {/* Fallback route */}
            <Route path="*" element={<Navigate to="/connections" replace />} />
          </Routes>
        </main>
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        lastQueryTimeMs={lastQueryTime}
        activeClusterId={activeCluster?.id}
      />

      {/* Command Palette (⌘K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectView={handleSelectView}
        onSelectTable={(tbl) => {
          setSelectedTable(tbl);
          navigate(`/tables/${tbl}`);
        }}
        onOpenGoArchitecture={() => setIsGoModalOpen(true)}
        onOpenConnectionSettings={() => {
          setEditingConnection(activeCluster);
          setIsConnSettingsOpen(true);
        }}
        onOpenStudioSettings={() => setIsStudioSettingsOpen(true)}
        onOpenThemeSettings={() => setIsThemeModalOpen(true)}
      />

      {/* Dedicated Master Studio Settings Modal (Global Studio Preferences) */}
      <StudioSettingsModal
        isOpen={isStudioSettingsOpen}
        onClose={() => setIsStudioSettingsOpen(false)}
        onShowToast={showToast}
        onOpenThemeMaster={() => setIsThemeModalOpen(true)}
      />

      {/* Dedicated Connection Settings Modal (Target PostgreSQL Cluster Parameters) */}
      <ConnectionSettingsModal
        isOpen={isConnSettingsOpen}
        connection={editingConnection}
        onClose={() => setIsConnSettingsOpen(false)}
        onSave={(updated) => {
          if (updated.host) {
            const isProd = updated.badge === 'PROD';
            const commitState = updated.autoCommit !== undefined ? updated.autoCommit : (isProd ? false : true);
            setActiveCluster((prev) => {
              const finalCluster = {
                ...prev,
                name: updated.name || prev.name,
                host: updated.host || prev.host,
                port: updated.port || prev.port,
                defaultDb: updated.defaultDb || prev.defaultDb,
                user: updated.user || prev.user,
                badge: updated.badge || prev.badge,
                autoCommit: commitState,
              };
              localStorage.setItem(STORAGE_KEY_ACTIVE_CLUSTER, JSON.stringify(finalCluster));
              return finalCluster;
            });
            if (updated.defaultDb) {
              localStorage.setItem(STORAGE_KEY_ACTIVE_DB, updated.defaultDb);
            }
            setAutocommit(commitState);
            localStorage.setItem(STORAGE_KEY_AUTOCOMMIT, String(commitState));
          }
          showToast(`Saved connection configuration for ${updated.host || 'cluster'}`, 'verified');
        }}
        onShowToast={showToast}
      />

      {/* Golang Backend Architecture Showcase Modal */}
      <GolangArchitectureModal
        isOpen={isGoModalOpen}
        onClose={() => setIsGoModalOpen(false)}
        onShowToast={showToast}
      />

      {/* Theme Master Modal */}
      <ThemeMasterModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
        activeTheme={activeTheme}
        customPresets={customPresets}
        onApplyTheme={handleApplyTheme}
        onSaveCustomPreset={handleSaveCustomPreset}
        onDeleteCustomPreset={handleDeleteCustomPreset}
        onResetToDefault={handleResetToDefault}
        onShowToast={showToast}
      />

      {/* Production Autocommit Safety Alert Modal */}
      <ProductionAutocommitAlertModal
        isOpen={isProdAutocommitAlertOpen}
        onClose={() => setIsProdAutocommitAlertOpen(false)}
        onConfirm={handleConfirmProdAutocommit}
        activeCluster={activeCluster}
        activeDatabase={activeDatabase}
      />

      {/* Global Create Table Modal (triggered from Sidebar / anywhere) */}
      <CreateTableModal
        isOpen={isGlobalCreateTableOpen}
        onClose={() => setIsGlobalCreateTableOpen(false)}
        onTableCreated={(newTbl) => {
          setIsGlobalCreateTableOpen(false);
          setSelectedTable(newTbl);
          navigate(`/tables/${newTbl}`);
          showToast(`Tabel ${newTbl} berhasil dibuat!`, 'table_rows');
        }}
        onShowToast={showToast}
      />

      {/* DBeaver Transaction Log Modal (Accessible globally from Navbar) */}
      <TransactionLogModal
        isOpen={isTransactionLogOpen}
        onClose={() => setIsTransactionLogOpen(false)}
        activeTransaction={activeTransaction}
        transactionHistory={transactionHistory}
        autocommit={!!autocommit}
        activeDatabase={activeDatabase || 'postgres'}
        tableName={selectedTable || 'orders'}
        onCommit={handleCommit}
        onRollback={handleRollback}
        onClearHistory={() => setTransactionHistory([])}
        onShowToast={showToast}
      />

      {/* Floating Interactive Toast Feedback */}
      <div
        className={`fixed bottom-10 right-6 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-surface-container-high border border-surface-container-highest shadow-2xl transition-all duration-300 pointer-events-none ${
          toast.show
            ? 'translate-y-0 opacity-100'
            : 'translate-y-8 opacity-0'
        }`}
      >
        {renderToastIcon(toast.icon, toast.isError)}
        <span className="text-on-surface font-code-sm text-xs font-medium">
          {toast.message}
        </span>
      </div>
    </div>
  );
}
