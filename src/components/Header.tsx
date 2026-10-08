import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { AppSuiteMode, ClusterConnection, DatabaseViewMode } from '../types/database';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Badge } from './ui';
import {
  Server,
  Database,
  ChevronDown,
  Check,
  Table,
  Terminal,
  LayoutDashboard,
  GitFork,
  Activity,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowLeftRight,
  Search,
  Palette,
  Settings,
  Sliders,
  RotateCcw,
  ScrollText,
  LogOut,
  User,
  Download,
  Info,
} from 'lucide-react';

interface HeaderProps {
  currentView: DatabaseViewMode;
  onSelectView: (view: DatabaseViewMode) => void;
  onOpenCommandPalette: () => void;
  onOpenConnectionSettings: () => void;
  onOpenStudioSettings?: () => void;
  onOpenGoArchitecture: () => void;
  onOpenThemeSettings?: () => void;
  autocommit: boolean;
  onToggleAutocommit: () => void;
  activeDatabase: string;
  onChangeDatabase: (db: string) => void;
  activeCluster?: ClusterConnection;
  selectedTable?: string;
  isExplorerCollapsed?: boolean;
  onToggleExplorer?: () => void;
  isNavExpanded?: boolean;
  onToggleNav?: () => void;
  onCommit?: () => Promise<void> | void;
  onRollback?: () => Promise<void> | void;
  onOpenTransactionLog?: () => void;
  pendingTransactionCount?: number;
  isCommitting?: boolean;
  isRollingBack?: boolean;
  authUser?: string;
  onLogout?: () => void;
  activeSuite?: AppSuiteMode;
  onSelectSuite?: (suite: AppSuiteMode) => void;
  activeSshSessionsCount?: number;
  onOpenAbout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onSelectView,
  activeSuite = 'pgstudio',
  onSelectSuite,
  activeSshSessionsCount = 0,
  onOpenCommandPalette,
  onOpenConnectionSettings,
  onOpenStudioSettings,
  onOpenGoArchitecture,
  onOpenThemeSettings,
  autocommit,
  onToggleAutocommit,
  activeDatabase,
  onChangeDatabase,
  activeCluster,
  selectedTable,
  isExplorerCollapsed = false,
  onToggleExplorer,
  isNavExpanded = false,
  onToggleNav,
  onCommit,
  onRollback,
  onOpenTransactionLog,
  pendingTransactionCount = 0,
  isCommitting = false,
  isRollingBack = false,
  authUser,
  onLogout,
  onOpenAbout,
}) => {
  const [dbSearch, setDbSearch] = useState('');
  const [liveDbs, setLiveDbs] = useState<string[]>([]);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    if (choiceResult && choiceResult.outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const showTemplates = activeCluster?.advancedSettings?.showTemplateDatabases;
    const showUnavailable = activeCluster?.advancedSettings?.showUnavailableDatabases;
    api.getDatabases({ showTemplates, showUnavailable })
      .then((res) => {
        if (!cancelled && res && res.databases && res.databases.length > 0) {
          setLiveDbs(res.databases);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    activeCluster?.id,
    activeCluster?.advancedSettings?.showTemplateDatabases,
    activeCluster?.advancedSettings?.showUnavailableDatabases,
    activeDatabase,
  ]);

  const location = useLocation();

  const nexusSubLabel = (() => {
    const p = location.pathname;
    if (p.includes('/terminal')) return 'Web Terminal';
    if (p.includes('/sftp')) return 'SFTP Explorer';
    if (p.includes('/snippets')) return 'DevOps Snippets';
    if (p.includes('/port-forwarding') || p.includes('/tunnels')) return 'Port Forwarding';
    return 'Hosts Fleet';
  })();

  const databaseList = liveDbs.length > 0 ? liveDbs : (activeCluster?.discoveredDbs || ['pos', 'abcd', 'postgres']);
  const clusterName = activeCluster?.name || 'Localhost PostgreSQL';
  const latency = activeCluster?.latencyMs ?? 12;

  const isConnectionsView = currentView === 'database-connections';

  return (
    <header className="fixed top-0 left-0 right-0 h-12 bg-surface-container-lowest/95 backdrop-blur-md z-50 border-b border-surface-container-high/60 shadow-[0_1px_8px_rgba(0,0,0,0.4)]">
      <div className="h-12 w-full px-2 sm:px-3 flex items-center justify-between gap-1.5 sm:gap-3">
        {/* 1. Left: Brand + Contextual Route Breadcrumbs */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0">
          {/* Toggle Navigation Sidebar (Expand / Minimize) */}
          {(onToggleNav || onToggleExplorer) && (
            <button
              onClick={onToggleNav || onToggleExplorer}
              className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
              title={isNavExpanded ? 'Tutup Sidebar (Minimize)' : 'Buka Sidebar (Expand)'}
            >
              {isNavExpanded ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeftOpen className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Brand */}
          <div
            onClick={() => onSelectView('database-overview')}
            className="flex items-center gap-1.5 cursor-pointer group shrink-0"
            title="Go to Database Overview"
          >
            <img
              src="/logo.png"
              alt="pgStudio"
              className="w-5 h-5 rounded-full object-contain shrink-0 group-hover:scale-105 transition-transform"
            />
            <span className="font-headline-sm text-sm text-on-surface font-bold tracking-tight group-hover:text-primary transition-colors">
              pgStudio
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenAbout}
            className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-primary font-code-sm border border-outline-variant/30 text-[10px] shrink-0 transition-colors cursor-pointer"
            title="pgStudio (Info & Lisensi)"
          >
            v1.0.1
          </button>

          {/* Dual-Suite Toggle: pgStudio vs NexusSH */}
          {onSelectSuite && (
            <div className="flex items-center bg-surface-container-high/90 p-0.5 rounded-lg border border-outline-variant/30 text-[11px] font-sans ml-0.5">
              <button
                type="button"
                onClick={() => onSelectSuite('pgstudio')}
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
                  activeSuite === 'pgstudio'
                    ? 'bg-primary text-on-primary shadow-xs font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                title="Beralih ke pgStudio Database Suite"
              >
                <span>pgStudio</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectSuite('nexussh')}
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
                  activeSuite === 'nexussh'
                    ? 'bg-secondary text-on-secondary shadow-xs font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                title="Beralih ke NexusSH SSH & Server Suite"
              >
                <span>NexusSH</span>
              </button>
            </div>
          )}

          <div className="h-3.5 w-px bg-outline-variant/40 mx-0.5 shrink-0"></div>

          {/* Route-Specific Context Header */}
          {activeSuite === 'nexussh' ? (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-secondary/15 text-secondary font-code-sm text-[11px] font-semibold border border-secondary/25">
                <Terminal className="w-3 h-3" />
                <span>NexusSH</span>
              </span>
              <span className="text-on-surface-variant/60 text-[10px] font-mono">/</span>
              <span className="text-on-surface-variant font-code-sm text-[11px] font-medium">
                {nexusSubLabel}
              </span>
            </div>
          ) : isConnectionsView ? (
            /* Fleet Connections Context */
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/10 text-primary font-code-sm text-[11px] font-semibold border border-primary/20">
                <Server className="w-3 h-3" />
                <span>Dashboard</span>
              </span>
            </div>
          ) : (
            /* Working Database Routes: Show Active Cluster & Database Dropdown */
            <div className="flex items-center gap-1.5 min-w-0">
              {/* Cluster Selector Pill */}
              <button
                onClick={() => onSelectView('database-connections')}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg hover:bg-surface-container font-code-sm text-[11px] cursor-pointer transition-all shrink-0 ${
                  activeCluster?.badge === 'PROD'
                    ? 'bg-red-950/30 text-red-200 border border-red-500/40 shadow-xs'
                    : 'bg-surface-container-low text-on-surface border border-outline-variant/20'
                }`}
                title="Ganti atau kelola koneksi PostgreSQL"
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    activeCluster?.badge === 'PROD' ? 'bg-red-500' : 'bg-primary'
                  }`}
                />
                <span
                  className={`font-semibold truncate max-w-[70px] sm:max-w-[110px] ${
                    activeCluster?.badge === 'PROD' ? 'text-red-400 font-bold' : 'text-primary'
                  }`}
                >
                  {clusterName}
                </span>
                {activeCluster?.badge && (
                  <Badge variant={activeCluster.badge as any} size="sm">
                    {activeCluster.badge}
                  </Badge>
                )}
                <span className="text-secondary font-code-sm text-[10px] ml-0.5 hidden xs:inline">{latency}ms</span>
                <span className="px-1 py-0.2 rounded bg-surface-container-high text-[9px] text-on-surface-variant font-semibold hidden lg:inline">
                  Ganti
                </span>
              </button>

              {/* Active Database Dropdown */}
              <Dropdown className="shrink-0">
                <DropdownTrigger>
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-high text-on-surface font-code-sm text-[11px] cursor-pointer hover:bg-surface-variant transition-colors border border-outline-variant/30 shadow-xs"
                    title="Ganti database aktif"
                  >
                    <Database className="w-3.5 h-3.5 text-secondary" />
                    <span className="font-semibold truncate max-w-[80px] sm:max-w-[120px]">{activeDatabase}</span>
                    <ChevronDown className="w-3 h-3 text-on-surface-variant" />
                  </div>
                </DropdownTrigger>

                <DropdownMenu width="w-60" className="p-0 overflow-hidden font-code-sm text-xs">
                  <div className="px-3 py-1.5 text-[9px] uppercase font-bold tracking-wider text-on-surface-variant bg-surface-container-lowest border-b border-surface-container-highest flex items-center justify-between">
                    <span>PostgreSQL Database ({databaseList.length})</span>
                  </div>

                  {/* Filter Input */}
                  <div
                    className="p-1.5 border-b border-surface-container-highest/60 bg-surface-container-low"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1 px-2 py-1 rounded bg-surface-container-lowest text-on-surface-variant text-xs border border-outline-variant/30">
                      <Search className="w-3 h-3 shrink-0 text-on-surface-variant/70" />
                      <input
                        value={dbSearch}
                        onChange={(e) => setDbSearch(e.target.value)}
                        placeholder="Cari database..."
                        className="w-full bg-transparent text-on-surface outline-none text-[11px]"
                        autoFocus
                      />
                      {dbSearch && (
                        <button onClick={() => setDbSearch('')} className="text-on-surface-variant hover:text-on-surface cursor-pointer text-xs">
                          ×
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="max-h-56 overflow-y-auto p-1 space-y-0.5">
                    {databaseList
                      .filter((db) => db.toLowerCase().includes(dbSearch.toLowerCase()))
                      .map((db) => (
                        <DropdownItem
                          key={db}
                          isSelected={db === activeDatabase}
                          icon={<Database className="w-3 h-3 text-secondary" />}
                          onClick={() => {
                            onChangeDatabase(db);
                            setDbSearch('');
                          }}
                        >
                          <span className="truncate">{db}</span>
                        </DropdownItem>
                      ))}
                  </div>
                </DropdownMenu>
              </Dropdown>

              {/* Route-specific breadcrumb tag */}
              {currentView === 'table-editor' && selectedTable && (
                <div className="flex items-center gap-1 font-code-sm text-[11px] text-on-surface-variant truncate">
                  <span className="hidden sm:inline text-outline-variant/60">/</span>
                  <span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary font-semibold border border-primary/20 flex items-center gap-0.5">
                    <Table className="w-3 h-3" />
                    <span className="truncate max-w-[80px] sm:max-w-none">public.{selectedTable}</span>
                  </span>
                </div>
              )}

              {currentView === 'sql-editor' && (
                <span className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-surface-container text-primary font-code-sm text-[10px] font-semibold border border-primary/20">
                  <Terminal className="w-3 h-3" />
                  <span>SQL Scratchpad</span>
                </span>
              )}

              {currentView === 'database-overview' && (
                <span className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-surface-container text-on-surface-variant font-code-sm text-[10px]">
                  <LayoutDashboard className="w-3 h-3" />
                  <span>Overview</span>
                </span>
              )}

              {currentView === 'schema-and-erd' && (
                <span className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-surface-container text-secondary font-code-sm text-[10px] font-semibold border border-secondary/20">
                  <GitFork className="w-3 h-3" />
                  <span>Schema &amp; ERD</span>
                </span>
              )}

              {currentView === 'performance-and-logs' && (
                <span className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-surface-container text-tertiary font-code-sm text-[10px] font-semibold border border-tertiary/20">
                  <Activity className="w-3 h-3" />
                  <span>Performance</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* 2. Right Tools: Explorer Toggle, Autocommit, Quick Find, Themes, Settings */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">

          {/* DBeaver Transaction Control Actions in Navbar: ONLY shown when on SQL Editor or Table Editor */}
          {activeSuite !== 'nexussh' && (currentView === 'sql-editor' || currentView === 'table-editor') && (
            <div className="flex items-center gap-1 bg-surface-container-low p-0.5 rounded-lg border border-surface-container-high/60">
              {/* Auto-Commit Pill */}
              <button
                onClick={onToggleAutocommit}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded font-code-sm text-[11px] transition-colors cursor-pointer ${
                  autocommit
                    ? activeCluster?.badge === 'PROD'
                      ? 'bg-red-500/20 text-red-300 font-semibold border border-red-500/40 shadow-xs'
                      : 'text-on-surface hover:bg-surface-container'
                    : 'bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30'
                }`}
                title={`Toggle Auto-Commit (currently ${autocommit ? 'ON' : 'OFF'})${
                  activeCluster?.badge === 'PROD' ? ' [PROD: Konfirmasi Alert aktif]' : ''
                }`}
              >
                <ArrowLeftRight
                  className={`w-3 h-3 ${
                    autocommit
                      ? activeCluster?.badge === 'PROD'
                        ? 'text-red-400'
                        : 'text-primary'
                      : 'text-amber-400'
                  }`}
                />
                <span className="hidden sm:inline">Auto:</span>
                <span
                  className={
                    autocommit
                      ? activeCluster?.badge === 'PROD'
                        ? 'text-red-400 font-bold'
                        : 'text-primary font-semibold'
                      : 'text-amber-400 font-bold'
                  }
                >
                  {autocommit ? 'ON' : 'OFF'}
                </span>
              </button>

              <div className="h-3 w-px bg-surface-container-highest"></div>

              {/* Commit Button */}
              <button
                onClick={onCommit}
                disabled={pendingTransactionCount === 0 || isCommitting}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-primary hover:bg-primary/10 font-label-md text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Commit active transaction to PostgreSQL database"
              >
                <Check className={`w-3 h-3 ${isCommitting ? 'animate-spin' : ''}`} />
                <span>Commit</span>
              </button>

              {/* Transaction Log Button (DBeaver Style) */}
              <button
                onClick={onOpenTransactionLog}
                className={`flex items-center gap-1 px-2 py-0.5 rounded font-label-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  pendingTransactionCount > 0
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                }`}
                title="Open DBeaver Transaction Log"
              >
                <ScrollText className="w-3 h-3 text-secondary" />
                <span className="hidden lg:inline">Transaction Log</span>
              </button>

              {/* Rollback Button */}
              <button
                onClick={onRollback}
                disabled={pendingTransactionCount === 0 || isRollingBack}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-rose-400 hover:bg-rose-500/10 font-label-md text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Rollback uncommitted changes and revert data"
              >
                <RotateCcw className={`w-3 h-3 ${isRollingBack ? 'animate-spin' : ''}`} />
                <span>Rollback</span>
              </button>
            </div>
          )}

          {/* PWA Install Button */}
          {deferredPrompt && (
            <button
              type="button"
              onClick={handleInstallPwa}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-medium transition-colors cursor-pointer"
              title="Install pgStudio sebagai aplikasi Desktop (PWA)"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Install App</span>
            </button>
          )}

          {/* Quick Find (⌘K) */}
          <button
            onClick={onOpenCommandPalette}
            className="flex items-center justify-between w-36 sm:w-52 md:w-64 px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer border border-outline-variant/30 text-xs shadow-xs"
            title="Quick Find Command Palette (⌘K)"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Search className="w-3.5 h-3.5 shrink-0 text-on-surface-variant/70" />
              <span className="text-[11px] text-on-surface-variant truncate">Quick Find...</span>
            </div>
            <kbd className="shrink-0 px-1.5 py-0.5 rounded bg-surface-container-lowest text-on-surface-variant font-code-sm text-[9px] border border-outline-variant/30">
              ctrl+K
            </kbd>
          </button>

          {/* Master Studio Settings */}
          <button
            onClick={onOpenStudioSettings || onOpenConnectionSettings}
            className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
            title="Master Pengaturan Studio (Query Limits, History, Autocommit, Storage)"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* About & Identity (GNU AGPLv3) */}
          <button
            type="button"
            onClick={onOpenAbout}
            className="p-1 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors cursor-pointer"
            title="Tentang pgStudio (Info & Lisensi)"
          >
            <Info className="w-4 h-4" />
          </button>

          {/* User Profile & Logout */}
          {authUser && (
            <div className="flex items-center gap-1.5 pl-1.5 border-l border-surface-container-high">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container-high border border-outline-variant/30 text-[11px] text-on-surface">
                <span className="font-medium truncate max-w-[100px]">{authUser}</span>
              </div>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="p-1 rounded text-on-surface-variant hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  title="Logout dari pgStudio"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
