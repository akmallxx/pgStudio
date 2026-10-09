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
import { AboutModal } from './components/AboutModal';
import { DatabaseOverview } from './components/DatabaseOverview/DatabaseOverview';
import { FleetConnections } from './components/FleetConnections/FleetConnections';
import { GolangArchitectureModal } from './components/GolangArchitectureModal/GolangArchitectureModal';
import { Header } from './components/Header';
import { PerformanceCockpit } from './components/PerformanceCockpit/PerformanceCockpit';
import { SchemaErd } from './components/SchemaErd/SchemaErd';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { SqlEditor } from './components/SqlEditor/SqlEditor';
import { TableEditor, CreateTableModal, TransactionLogModal } from './views/TableEditor';
import { ThemeMasterModal } from './components/ThemeMasterModal/ThemeMasterModal';
import { LoginPage } from './components/Auth/LoginPage';
import { ProductionAutocommitAlertModal } from './components/ProductionAutocommitAlertModal';
import { ConfirmModal, Toast } from './components/ui';
import { CLUSTER_CONNECTIONS } from './data/mockDatabase';
import { ActiveTransaction, ClusterConnection, DatabaseViewMode, AppSuiteMode } from './types/database';
import { NexusSHView } from './nexussh/NexusSHView';
import { Host, SSHSession, Snippet, PortForwardRule } from './nexussh/types/ssh';
import { INITIAL_HOSTS, INITIAL_SNIPPETS, INITIAL_TUNNELS } from './nexussh/data/mockData';
import { api } from './services/api';
import { LogOut } from 'lucide-react';

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
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);

  // Dual-Suite Mode: 'pgstudio' (PostgreSQL IDE) | 'nexussh' (SSH & DevOps Suite)
  const isNexusPath = (p: string) =>
    p.startsWith('/nexussh') ||
    p === '/terminal' ||
    p === '/sftp' ||
    p === '/hosts' ||
    p === '/snippets' ||
    p === '/tunnels' ||
    p === '/port-forwarding';

  const isNexusRoute = isNexusPath(location.pathname);
  const activeSuite: AppSuiteMode = isNexusRoute ? 'nexussh' : 'pgstudio';
  const STORAGE_KEY_ACTIVE_SUITE = 'pgstudio_active_suite';

  // Persistent SSH / DevOps State (persists across suite switches)
  const [sshSessions, setSshSessions] = useState<SSHSession[]>([
    {
      id: 'sess-blackbox',
      hostId: 'host_blackbox_2211',
      hostName: 'Blackbox Localhost (2211)',
      username: 'blackbox',
      hostname: '127.0.0.1',
      port: 2211,
      connectedAt: new Date(),
      currentDirectory: '/home/blackbox',
      status: 'connected',
      commandHistory: [],
      lines: [
        {
          id: 'l-0',
          type: 'system',
          text: 'Connected to blackbox@127.0.0.1:2211 via SSH.',
        },
      ],
    },
  ]);
  const [activeSshSessionId, setActiveSshSessionId] = useState<string>('sess-blackbox');
  const [sshHosts, setSshHosts] = useState<Host[]>(INITIAL_HOSTS);
  const [sshSnippets, setSshSnippets] = useState<Snippet[]>(INITIAL_SNIPPETS);
  const [sshTunnels, setSshTunnels] = useState<PortForwardRule[]>(INITIAL_TUNNELS);

  const activeSshSessionsCount = sshSessions.filter((s) => s.status === 'connected').length;

  const lastNexusPathRef = useRef<string>('/nexussh/hosts');
  const lastPgStudioPathRef = useRef<string>('/connections');

  useEffect(() => {
    if (isNexusPath(location.pathname)) {
      lastNexusPathRef.current = location.pathname.startsWith('/nexussh')
        ? location.pathname
        : `/nexussh${location.pathname === '/tunnels' ? '/port-forwarding' : location.pathname}`;
      localStorage.setItem(STORAGE_KEY_ACTIVE_SUITE, 'nexussh');
    } else {
      lastPgStudioPathRef.current = location.pathname;
      localStorage.setItem(STORAGE_KEY_ACTIVE_SUITE, 'pgstudio');
    }
  }, [location.pathname]);

  // If user lands on root '/' and previously was using NexusSH, navigate smoothly
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_SUITE);
    if (location.pathname === '/' && saved === 'nexussh') {
      navigate('/nexussh/hosts', { replace: true });
    }
  }, []);

  const handleSelectSuite = (suite: AppSuiteMode) => {
    localStorage.setItem(STORAGE_KEY_ACTIVE_SUITE, suite);
    if (suite === 'nexussh') {
      const target =
        lastNexusPathRef.current && lastNexusPathRef.current.startsWith('/nexussh')
          ? lastNexusPathRef.current
          : '/nexussh/hosts';
      navigate(target);
      showToast('Beralih ke NexusSH DevOps Suite', 'terminal');
    } else {
      const target =
        lastPgStudioPathRef.current && !lastPgStudioPathRef.current.startsWith('/nexussh')
          ? lastPgStudioPathRef.current
          : selectedTable
          ? `/tables/${selectedTable}`
          : '/connections';
      navigate(target);
      showToast('Beralih ke pgStudio Database Suite', 'database');
    }
  };

  // Sync SSH data from Go backend on startup
  useEffect(() => {
    let isMounted = true;
    Promise.allSettled([
      api.getSshHosts(),
      api.getSshSnippets(),
      api.getSshTunnels(),
    ]).then(([hostsRes, snippetsRes, tunnelsRes]) => {
      if (!isMounted) return;
      if (hostsRes.status === 'fulfilled' && Array.isArray(hostsRes.value) && hostsRes.value.length > 0) {
        const normalizedHosts: Host[] = hostsRes.value.map((h: any) => ({
          id: h.id || `host_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: h.name || 'Server Host',
          hostname: h.hostname || h.host || '127.0.0.1',
          port: Number(h.port) || 22,
          username: h.username || h.user || 'root',
          authType: (h.authType || (h.auth_method?.toLowerCase() === 'password' ? 'password' : 'key')) as any,
          keyName: h.keyName || h.key_name || (h.authType === 'key' ? 'id_ed25519' : undefined),
          password: h.password,
          environment: h.environment || 'Production',
          tags: Array.isArray(h.tags) && h.tags.length > 0 ? h.tags : (h.badge ? [h.badge.toLowerCase()] : ['ssh']),
          status: (h.status === 'unreachable' ? 'unreachable' : 'online') as any,
          latencyMs: h.latencyMs !== undefined ? Number(h.latencyMs) : Math.floor(Math.random() * 20) + 12,
          lastConnected: h.lastConnected || 'Baru saja',
          notes: h.notes || h.description || '',
        }));
        setSshHosts(normalizedHosts);
      }
      if (snippetsRes.status === 'fulfilled' && Array.isArray(snippetsRes.value) && snippetsRes.value.length > 0) {
        const normalizedSnippets: Snippet[] = snippetsRes.value.map((s: any) => ({
          id: s.id || `snip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          description: s.description || s.title || 'DevOps Snippet',
          script: s.script || s.command || '',
          targetHostIds: s.targetHostIds || s.target_host_ids || [],
        }));
        setSshSnippets(normalizedSnippets);
      }
      if (tunnelsRes.status === 'fulfilled' && Array.isArray(tunnelsRes.value) && tunnelsRes.value.length > 0) {
        const normalizedTunnels: PortForwardRule[] = tunnelsRes.value.map((t: any) => ({
          id: t.id || `tun_${Date.now()}`,
          name: t.name || `${(t.type || 'local').toUpperCase()} :${t.bindPort || 5433}`,
          hostId: t.hostId || t.host_id || '',
          hostName: t.hostName || t.host_name || 'Host',
          type: (t.type || 'local') as any,
          bindAddress: t.bindAddress || t.bind_address || '127.0.0.1',
          bindPort: Number(t.bindPort || t.bind_port) || 5433,
          targetHost: t.targetHost || t.target_host || '127.0.0.1',
          targetPort: Number(t.targetPort || t.target_port) || 5432,
          isActive: t.isActive !== undefined ? Boolean(t.isActive) : (t.is_active !== undefined ? Boolean(t.is_active) : true),
          activeConnections: Number(t.activeConnections || t.active_connections) || 0,
          trafficUpMb: Number(t.trafficUpMb || t.traffic_up_mb) || 0,
          trafficDownMb: Number(t.trafficDownMb || t.traffic_down_mb) || 0,
          description: t.description || '',
        }));
        setSshTunnels(normalizedTunnels);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Authentication State (driven by backend .env USERNAME & PASSWORD)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!localStorage.getItem('pgstudio_token');
  });
  const [authUser, setAuthUser] = useState<string>(() => {
    return localStorage.getItem('pgstudio_username') || '';
  });
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState<boolean>(false);

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

  // Database Explorer resizable width state (persisted to localStorage)
  const [explorerWidth, setExplorerWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('pgstudio_explorer_width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 180 && parsed <= 800) {
          return parsed;
        }
      }
    } catch (_) {}
    return 240;
  });
  const [isResizingExplorer, setIsResizingExplorer] = useState(false);

  const [editingConnection, setEditingConnection] = useState<ClusterConnection | undefined>();
  const [connectionsVersion, setConnectionsVersion] = useState<number>(0);
  const [lastQueryTime, setLastQueryTime] = useState<number>(2.4);

  // Navigation router dispatcher
  const handleSelectView = (view: DatabaseViewMode) => {
    if (activeSuite !== 'pgstudio') {
      localStorage.setItem(STORAGE_KEY_ACTIVE_SUITE, 'pgstudio');
    }
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
          id: currentSavedCluster.id,
          name: currentSavedCluster.name,
          host: currentSavedCluster.host,
          port: currentSavedCluster.port,
          user: currentSavedCluster.user,
          password: currentSavedCluster.password,
          database: currentSavedCluster.defaultDb || 'pos',
          ssl_mode: currentSavedCluster.sslMode,
          ssh_settings: currentSavedCluster.sshSettings,
          advanced_settings: currentSavedCluster.advancedSettings,
        }).catch(() => {});
      }
    });

    // Check backend authentication status on startup
    const token = localStorage.getItem('pgstudio_token');
    if (token) {
      api.getAuthStatus()
        .then((res) => {
          if (res.authenticated && res.user?.username) {
            setIsAuthenticated(true);
            setAuthUser(res.user.username);
            localStorage.setItem('pgstudio_username', res.user.username);
          }
        })
        .catch(() => {
          setIsAuthenticated(false);
          localStorage.removeItem('pgstudio_token');
        });
    } else {
      setIsAuthenticated(false);
    }

    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      showToast('Sesi login telah kedaluwarsa, silakan login kembali', 'warning', true);
    };
    window.addEventListener('pgstudio_unauthorized', handleUnauthorized);
    return () => window.removeEventListener('pgstudio_unauthorized', handleUnauthorized);
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {}
    localStorage.removeItem('pgstudio_token');
    localStorage.removeItem('pgstudio_username');
    setIsAuthenticated(false);
    setAuthUser('');
    showToast('Berhasil logout dari pgStudio', 'verified');
  };

  const handleSelectCluster = async (conn: ClusterConnection) => {
    setActiveCluster(conn);
    setActiveDatabase(conn.defaultDb);
    localStorage.setItem(STORAGE_KEY_ACTIVE_CLUSTER, JSON.stringify(conn));
    localStorage.setItem(STORAGE_KEY_ACTIVE_DB, conn.defaultDb);
    setLastQueryTime(conn.latencyMs);
    try {
      await api.connect({
        id: conn.id,
        name: conn.name,
        host: conn.host,
        port: conn.port,
        user: conn.user,
        password: conn.password,
        database: conn.defaultDb,
        ssl_mode: conn.sslMode,
        ssh_settings: conn.sshSettings,
        advanced_settings: conn.advancedSettings,
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

  if (!isAuthenticated) {
    return (
      <LoginPage
        onLoginSuccess={(_token, username) => {
          setIsAuthenticated(true);
          setAuthUser(username);
        }}
        onShowToast={showToast}
      />
    );
  }

  const handleChangeDatabase = async (db: string) => {
    setActiveDatabase(db);
    localStorage.setItem(STORAGE_KEY_ACTIVE_DB, db);
    showToast(`Menghubungkan ke database "${db}"...`, 'sync');
    try {
      await api.connect({
        id: activeCluster?.id,
        name: activeCluster?.name,
        host: activeCluster?.host || 'localhost',
        port: activeCluster?.port || 5432,
        user: activeCluster?.user || 'postgres',
        password: activeCluster?.password,
        database: db,
        ssl_mode: activeCluster?.sslMode || 'disable',
        ssh_settings: activeCluster?.sshSettings,
        advanced_settings: activeCluster?.advancedSettings,
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
  };

  return (
    <div className="min-h-screen bg-surface font-body-md text-on-surface antialiased flex flex-col">
      {/* Top Header */}
      <Header
        currentView={currentView}
        onSelectView={handleSelectView}
        activeSuite={activeSuite}
        onSelectSuite={handleSelectSuite}
        activeSshSessionsCount={activeSshSessionsCount}
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
        authUser={authUser}
        onLogout={() => setIsLogoutConfirmOpen(true)}
        onChangeDatabase={handleChangeDatabase}
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
        onOpenAbout={() => setIsAboutOpen(true)}
      />

      {/* Dual-Suite Body: NexusSH DevOps Suite (Always mounted to preserve SSH Terminal session!) */}
      <div className={`pt-14 pb-0 h-screen flex-col bg-surface overflow-hidden w-full ${activeSuite === 'nexussh' ? 'flex' : 'hidden'}`}>
        <NexusSHView
          onSwitchToPgStudio={() => handleSelectSuite('pgstudio')}
          onOpenGoArchitecture={() => setIsGoModalOpen(true)}
          onShowToast={showToast}
          sessions={sshSessions}
          setSessions={setSshSessions}
          activeSessionId={activeSshSessionId}
          setActiveSessionId={setActiveSshSessionId}
          hosts={sshHosts}
          setHosts={setSshHosts}
          snippets={sshSnippets}
          setSnippets={setSshSnippets}
          tunnels={sshTunnels}
          setTunnels={setSshTunnels}
        />
      </div>

      {/* pgStudio Database Workspace (Hidden when viewing NexusSH) */}
      <div className={activeSuite !== 'nexussh' ? 'contents' : 'hidden'}>
        {/* Activity Bar & Database Explorer Sidebar */}
          <Sidebar
            currentView={currentView}
            onSelectView={handleSelectView}
            onSelectSuite={handleSelectSuite}
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
        explorerWidth={explorerWidth}
        onExplorerWidthChange={setExplorerWidth}
        isResizingExplorer={isResizingExplorer}
        onResizingExplorerChange={setIsResizingExplorer}
      />

      {/* Main Viewport Container with Adaptive Padding */}
      <div
        className={`transition-all ${isResizingExplorer ? 'duration-0 select-none' : 'duration-200'} ${
          currentView === 'database-connections' || effectiveExplorerCollapsed
            ? isNavExpanded
              ? 'pl-52'
              : 'pl-11'
            : isNavExpanded
            ? 'pl-52 viewport-explorer-desktop'
            : 'pl-11 viewport-explorer-desktop'
        }`}
        style={
          !(currentView === 'database-connections' || effectiveExplorerCollapsed)
            ? ({
                '--viewport-pl-desktop': `${(isNavExpanded ? 208 : 44) + explorerWidth}px`,
              } as React.CSSProperties)
            : undefined
        }
      >
        <main className="relative pt-14 pb-8 min-h-[calc(100vh-1.5rem)] bg-surface w-full px-2 sm:px-3 lg:px-4 max-w-full overflow-x-hidden">
          <Routes>
            {/* 1. Dashboard Pilih Koneksi (Workspace Fleet) */}
            <Route
              path="/"
              element={
                <FleetConnections
                  activeClusterId={activeCluster.id}
                  connectionsVersion={connectionsVersion}
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
            <Route
              path="/connections"
              element={
                <FleetConnections
                  activeClusterId={activeCluster.id}
                  connectionsVersion={connectionsVersion}
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
                  activeDatabase={activeDatabase}
                  activeCluster={activeCluster}
                  onChangeDatabase={handleChangeDatabase}
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

            {/* NexusSH Redirection if accessed in pgStudio view */}
            <Route path="/nexussh" element={<Navigate to="/nexussh/hosts" replace />} />
            <Route path="/nexussh/*" element={null} />
            <Route path="/terminal" element={<Navigate to="/nexussh/terminal" replace />} />
            <Route path="/sftp" element={<Navigate to="/nexussh/sftp" replace />} />
            <Route path="/hosts" element={<Navigate to="/nexussh/hosts" replace />} />
            <Route path="/snippets" element={<Navigate to="/nexussh/snippets" replace />} />
            <Route path="/tunnels" element={<Navigate to="/nexussh/port-forwarding" replace />} />
            <Route path="/port-forwarding" element={<Navigate to="/nexussh/port-forwarding" replace />} />

            {/* Fallback route */}
            <Route path="*" element={<Navigate to="/connections" replace />} />
          </Routes>
        </main>
      </div>

      {/* Bottom Status Bar - Hanya tampil di pgStudio, jangan ditampilkan di NexusSH */}
      <StatusBar
        lastQueryTimeMs={lastQueryTime}
        activeClusterId={activeCluster?.id}
        onOpenAbout={() => setIsAboutOpen(true)}
      />
    </div>

      {/* Command Palette (⌘K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectView={handleSelectView}
        onSelectSuite={handleSelectSuite}
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
        activeDatabase={activeDatabase}
        onChangeDatabase={handleChangeDatabase}
        onCreateTable={() => setIsGlobalCreateTableOpen(true)}
        hosts={sshHosts}
        snippets={sshSnippets}
        tunnels={sshTunnels}
        onSelectHost={(host) => {
          handleSelectSuite('nexussh');
          const existing = sshSessions.find((s) => s.hostId === host.id);
          if (existing) {
            setActiveSshSessionId(existing.id);
          } else {
            const newSession: SSHSession = {
              id: `sess-${Date.now()}`,
              hostId: host.id,
              hostName: host.name,
              username: host.username || 'root',
              hostname: host.hostname || '127.0.0.1',
              port: host.port || 22,
              connectedAt: new Date(),
              currentDirectory: '~',
              status: 'connected',
              commandHistory: [],
              lines: [
                {
                  id: `l-init-${Date.now()}`,
                  type: 'system',
                  text: `Connected to ${host.name} (${host.hostname}:${host.port || 22}) as ${host.username || 'root'}`,
                },
              ],
            };
            setSshSessions((prev) => [newSession, ...prev]);
            setActiveSshSessionId(newSession.id);
          }
          navigate('/nexussh/terminal');
          showToast(`Terhubung ke ${host.name}`, 'terminal');
        }}
        onSelectSnippet={(snip) => {
          navigator.clipboard.writeText(snip.script);
          showToast(`Snippet "${snip.description}" disalin ke clipboard`, 'code');
        }}
      />

      {/* Dedicated Master Studio Settings Modal (Global Studio Preferences) */}
      <StudioSettingsModal
        isOpen={isStudioSettingsOpen}
        onClose={() => setIsStudioSettingsOpen(false)}
        onShowToast={showToast}
        onOpenThemeMaster={() => setIsThemeModalOpen(true)}
      />

      {/* Dedicated About & Developer Identity Modal */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />

      {/* Dedicated Connection Settings Modal (Target PostgreSQL Cluster Parameters) */}
      <ConnectionSettingsModal
        isOpen={isConnSettingsOpen}
        connection={editingConnection}
        onClose={() => {
          setIsConnSettingsOpen(false);
          setEditingConnection(undefined);
        }}
        onSave={async (updated) => {
          if (updated.host) {
            const isProd = updated.badge === 'PROD';
            const commitState = updated.autoCommit !== undefined ? updated.autoCommit : (isProd ? false : true);
            const connId = updated.id || editingConnection?.id || `conn_${Date.now()}`;
            const finalName = updated.name || `PostgreSQL - ${updated.host}`;

            try {
              await api.saveConnection({
                id: connId,
                name: finalName,
                host: updated.host,
                port: updated.port || 5432,
                user: updated.user || 'postgres',
                password: updated.password || '',
                database: updated.defaultDb || 'postgres',
                ssl_mode: updated.sslMode || 'disable',
                badge: updated.badge || 'LOCAL',
                ssh_settings: updated.sshSettings,
                advanced_settings: updated.advancedSettings as any,
              });
              setConnectionsVersion((v) => v + 1);
            } catch (err: any) {
              console.error('Failed to save connection to backend:', err);
              showToast(`Gagal menyimpan koneksi ke server: ${err?.message || 'Error'}`, 'warning', true);
            }

            if (!editingConnection || editingConnection.id === activeCluster.id) {
              const updatedCluster: ClusterConnection = {
                id: connId,
                name: finalName,
                host: updated.host || 'localhost',
                port: updated.port || 5432,
                user: updated.user || 'postgres',
                password: updated.password || '',
                defaultDb: updated.defaultDb || 'postgres',
                sslMode: updated.sslMode || 'disable',
                badge: updated.badge || 'LOCAL',
                latencyMs: 12,
                status: 'connected',
                description: `Host: ${updated.host}:${updated.port || 5432} | Database: ${updated.defaultDb || 'postgres'}`,
                discoveredDbs: [updated.defaultDb || 'postgres'],
                autoCommit: commitState,
                sshSettings: updated.sshSettings,
                advancedSettings: updated.advancedSettings,
              };
              setActiveCluster(updatedCluster);
              localStorage.setItem(STORAGE_KEY_ACTIVE_CLUSTER, JSON.stringify(updatedCluster));
              if (updated.defaultDb) {
                setActiveDatabase(updated.defaultDb);
                localStorage.setItem(STORAGE_KEY_ACTIVE_DB, updated.defaultDb);
              }
              setAutocommit(commitState);
              localStorage.setItem(STORAGE_KEY_AUTOCOMMIT, String(commitState));

              try {
                await api.connect({
                  id: connId,
                  name: finalName,
                  host: updated.host,
                  port: updated.port || 5432,
                  user: updated.user || 'postgres',
                  password: updated.password,
                  database: updated.defaultDb || 'postgres',
                  ssl_mode: updated.sslMode || 'disable',
                  ssh_settings: updated.sshSettings,
                  advanced_settings: updated.advancedSettings as any,
                });
              } catch (connectErr: any) {
                console.warn('Auto-connect on save:', connectErr);
              }
            }
          }
          setIsConnSettingsOpen(false);
          setEditingConnection(undefined);
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

      {/* Logout Confirmation Modal / Alert */}
      <ConfirmModal
        isOpen={isLogoutConfirmOpen}
        onClose={() => setIsLogoutConfirmOpen(false)}
        onConfirm={handleLogout}
        type="danger"
        title="Konfirmasi Logout"
        description="Apakah Anda yakin ingin keluar dari pgStudio?"
        confirmText="Ya, Keluar"
        cancelText="Batal"
        icon={<LogOut className="w-5 h-5 text-rose-400" />}
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
      <Toast
        show={toast.show}
        message={toast.message}
        icon={toast.icon}
        isError={toast.isError}
      />
    </div>
  );
}
