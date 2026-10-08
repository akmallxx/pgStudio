import React, { useEffect, useState } from 'react';
import { AppSuiteMode, ClusterConnection, DatabaseViewMode } from '../types/database';
import { api } from '../services/api';
import {
  Server,
  Table,
  Terminal,
  GitFork,
  Activity,
  LayoutDashboard,
  Sliders,
  Palette,
  Cpu,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCw,
  X,
  Filter,
  FolderOpen,
  Folder,
  ChevronDown,
  ChevronRight,
  Eye,
  Code2,
  Puzzle,
  Settings,
  Plus,
} from 'lucide-react';

interface SidebarProps {
  currentView: DatabaseViewMode;
  onSelectView: (view: DatabaseViewMode) => void;
  selectedTable: string;
  onSelectTable: (tableName: string) => void;
  onOpenConnectionSettings: () => void;
  onOpenStudioSettings?: () => void;
  onOpenGoArchitecture: () => void;
  onOpenThemeSettings?: () => void;
  isExplorerCollapsed: boolean;
  onToggleExplorer: () => void;
  isNavExpanded?: boolean;
  onToggleNav?: () => void;
  activeCluster?: ClusterConnection;
  onCreateTable?: () => void;
  explorerWidth?: number;
  onExplorerWidthChange?: (width: number) => void;
  isResizingExplorer?: boolean;
  onResizingExplorerChange?: (resizing: boolean) => void;
  onSelectSuite?: (suite: AppSuiteMode) => void;
}

const DEFAULT_EXPLORER_WIDTH = 240;
const MIN_EXPLORER_WIDTH = 180;
const MAX_EXPLORER_WIDTH = 750;

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  onSelectSuite,
  selectedTable,
  onSelectTable,
  onOpenConnectionSettings,
  onOpenStudioSettings,
  onOpenGoArchitecture,
  onOpenThemeSettings,
  isExplorerCollapsed,
  onToggleExplorer,
  isNavExpanded = false,
  onToggleNav,
  activeCluster,
  onCreateTable,
  explorerWidth = DEFAULT_EXPLORER_WIDTH,
  onExplorerWidthChange,
  isResizingExplorer = false,
  onResizingExplorerChange,
}) => {
  const [filterText, setFilterText] = useState('');
  const [publicExpanded, setPublicExpanded] = useState(true);
  const [tablesExpanded, setTablesExpanded] = useState(true);
  const [viewsExpanded, setViewsExpanded] = useState(false);
  const [functionsExpanded, setFunctionsExpanded] = useState(false);
  const [extensionsExpanded, setExtensionsExpanded] = useState(false);
  const [stagingExpanded, setStagingExpanded] = useState(false);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tables, setTables] = useState<Array<{ name: string; rows: string }>>([]);
  const [isHovered, setIsHovered] = useState(false);
  const isExpanded = isNavExpanded || isHovered;

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = explorerWidth;

    onResizingExplorerChange?.(true);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const maxWidth = Math.min(MAX_EXPLORER_WIDTH, Math.max(MIN_EXPLORER_WIDTH, window.innerWidth - 300));
      const nextWidth = Math.max(MIN_EXPLORER_WIDTH, Math.min(startWidth + delta, maxWidth));
      onExplorerWidthChange?.(nextWidth);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      onResizingExplorerChange?.(false);

      const delta = upEvent.clientX - startX;
      const maxWidth = Math.min(MAX_EXPLORER_WIDTH, Math.max(MIN_EXPLORER_WIDTH, window.innerWidth - 300));
      const finalWidth = Math.max(MIN_EXPLORER_WIDTH, Math.min(startWidth + delta, maxWidth));
      try {
        localStorage.setItem('pgstudio_explorer_width', finalWidth.toString());
      } catch (_) {}
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResetExplorerWidth = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onExplorerWidthChange?.(DEFAULT_EXPLORER_WIDTH);
    try {
      localStorage.setItem('pgstudio_explorer_width', DEFAULT_EXPLORER_WIDTH.toString());
    } catch (_) {}
  };

  useEffect(() => {
    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, []);

  const fetchTables = () => {
    setIsRefreshing(true);
    api
      .getCatalogSchema()
      .then((res) => {
        setIsRefreshing(false);
        if (res && res.is_live) {
          setTables(
            (res.tables || []).map((t) => ({
              name: t.name,
              rows: t.rows > 1000 ? `${(t.rows / 1000).toFixed(1)}k` : `${t.rows}`,
            }))
          );
        } else {
          setTables([
            { name: 'customers', rows: '14.2k' },
            { name: 'orders', rows: '89.4k' },
            { name: 'order_items', rows: '240k' },
            { name: 'products', rows: '1.8k' },
            { name: 'categories', rows: '32' },
            { name: 'inventory_logs', rows: '520k' },
          ]);
        }
      })
      .catch(() => {
        setIsRefreshing(false);
      });
  };

  useEffect(() => {
    fetchTables();
  }, [activeCluster?.id, activeCluster?.defaultDb]);

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(filterText.toLowerCase())
  );

  const navItems = [
    {
      id: 'database-connections' as const,
      label: 'Fleet Manager',
      icon: <Server className="w-4 h-4 shrink-0" />,
      hint: 'Pilih & Kelola Koneksi',
    },
    {
      id: 'table-editor' as const,
      label: 'Table Editor',
      icon: <Table className="w-4 h-4 shrink-0" />,
      hint: 'Data Grid & CRUD',
    },
    {
      id: 'sql-editor' as const,
      label: 'SQL Editor',
      icon: <Terminal className="w-4 h-4 shrink-0" />,
      hint: 'Query Scratchpad',
    },
    {
      id: 'schema-and-erd' as const,
      label: 'Schema & ERD',
      icon: <GitFork className="w-4 h-4 shrink-0" />,
      hint: 'Diagram Relasi Tabel',
    },
    {
      id: 'performance-and-logs' as const,
      label: 'Performance',
      icon: <Activity className="w-4 h-4 shrink-0" />,
      hint: 'Monitoring Sesi & Log',
    },
    {
      id: 'database-overview' as const,
      label: 'Overview',
      icon: <LayoutDashboard className="w-4 h-4 shrink-0" />,
      hint: 'Telemetri Database',
    },
    {
      id: 'connection-settings' as const,
      label: 'Koneksi Aktif',
      icon: <Sliders className="w-4 h-4 shrink-0" />,
      hint: 'Pengaturan Host & Port',
      onClick: onOpenConnectionSettings,
    },
  ];

  return (
    <>
      {/* 1. Navigation Sidebar (Icon Dock or Expanded with Details) */}
      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`fixed left-0 top-12 bottom-6 bg-surface-container-lowest z-50 flex flex-col justify-between py-2 px-1.5 border-r border-surface-container-high/60 shadow-[2px_0_16px_rgba(0,0,0,0.35)] transition-all duration-200 ease-in-out overflow-x-hidden ${
          isExpanded ? 'w-48' : 'w-11'
        }`}
      >
        <nav className="flex flex-col gap-1 w-full">
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setIsHovered(false);
                  if (item.onClick) {
                    item.onClick();
                  } else {
                    onSelectView(item.id);
                  }
                }}
                className={`w-full flex items-center h-8.5 rounded-lg text-xs transition-colors duration-150 cursor-pointer overflow-hidden text-left ${
                  isActive
                    ? 'bg-primary text-on-primary font-semibold shadow-xs'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
                title={item.hint}
              >
                <div className="w-8 h-8 shrink-0 flex items-center justify-center">
                  {item.icon}
                </div>
                <span
                  className={`truncate whitespace-nowrap font-medium transition-all duration-200 ease-in-out ${
                    isExpanded ? 'opacity-100 max-w-[130px] ml-1' : 'opacity-0 max-w-0 ml-0 pointer-events-none'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Bottom Dock Controls */}
        <div className="flex flex-col gap-1 w-full pt-2 border-t border-surface-container-high/40">
          {onOpenThemeSettings && (
            <button
              onClick={() => {
                setIsHovered(false);
                onOpenThemeSettings();
              }}
              className="w-full flex items-center h-8.5 rounded-lg text-xs text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors duration-150 cursor-pointer overflow-hidden text-left"
              title="Pengaturan Tema & Preset (Theme Settings)"
            >
              <div className="w-8 h-8 shrink-0 flex items-center justify-center">
                <Palette className="w-4 h-4 shrink-0" />
              </div>
              <span
                className={`truncate whitespace-nowrap transition-all duration-200 ease-in-out ${
                  isExpanded ? 'opacity-100 max-w-[130px] ml-1' : 'opacity-0 max-w-0 ml-0 pointer-events-none'
                }`}
              >
                Tema Studio
              </span>
            </button>
          )}

          <button
            onClick={() => {
              setIsHovered(false);
              onOpenGoArchitecture();
            }}
            className="w-full flex items-center h-8.5 rounded-lg text-xs text-secondary hover:bg-secondary/10 hover:text-secondary-fixed transition-colors duration-150 cursor-pointer overflow-hidden text-left"
            title="Golang High-Performance Microservice"
          >
            <div className="w-8 h-8 shrink-0 flex items-center justify-center">
              <Cpu className="w-4 h-4 shrink-0" />
            </div>
            <span
              className={`truncate whitespace-nowrap transition-all duration-200 ease-in-out ${
                isExpanded ? 'opacity-100 max-w-[130px] ml-1' : 'opacity-0 max-w-0 ml-0 pointer-events-none'
              }`}
            >
              Go Engine
            </span>
          </button>

          {onOpenStudioSettings && (
            <button
              onClick={() => {
                setIsHovered(false);
                onOpenStudioSettings();
              }}
              className="w-full flex items-center h-8.5 rounded-lg text-xs text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors duration-150 cursor-pointer overflow-hidden text-left"
              title="Master Pengaturan Studio"
            >
              <div className="w-8 h-8 shrink-0 flex items-center justify-center">
                <Settings className="w-4 h-4 shrink-0" />
              </div>
              <span
                className={`truncate whitespace-nowrap transition-all duration-200 ease-in-out ${
                  isExpanded ? 'opacity-100 max-w-[130px] ml-1' : 'opacity-0 max-w-0 ml-0 pointer-events-none'
                }`}
              >
                Pengaturan
              </span>
            </button>
          )}
        </div>
      </aside>

      {/* 2. Database Explorer Sidebar (Hidden on Connections Dashboard) */}
      {!isExplorerCollapsed && currentView !== 'database-connections' && (
        <>
          {/* Mobile backdrop overlay for responsive drawer */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-30 md:hidden"
            onClick={onToggleExplorer}
          />
          <aside
            style={{ width: `${explorerWidth}px` }}
            className={`fixed top-12 bottom-6 bg-surface-container-low z-40 md:z-30 flex flex-col border-r border-surface-container-high/60 shadow-2xl md:shadow-[1px_0_8px_rgba(0,0,0,0.2)] max-w-[calc(100vw-3rem)] ${
              isResizingExplorer ? 'duration-0 select-none' : 'transition-all duration-200'
            } ${isNavExpanded ? 'left-52' : 'left-11'}`}
          >
            {/* VS Code Style Resize Handle */}
            <div
              onMouseDown={handleMouseDownResize}
              onDoubleClick={handleResetExplorerWidth}
              className={`hidden md:block absolute top-0 -right-1 w-2.5 h-full cursor-col-resize z-50 select-none group transition-colors duration-150 ${
                isResizingExplorer ? 'bg-primary/20' : 'hover:bg-primary/20'
              }`}
              title="Tarik untuk mengubah lebar Database Explorer (Klik 2x untuk reset)"
            >
              <div
                className={`w-0.5 h-full mx-auto transition-colors duration-150 ${
                  isResizingExplorer
                    ? 'bg-primary shadow-[0_0_8px_var(--color-primary)]'
                    : 'group-hover:bg-primary/70'
                }`}
              />
            </div>

            {/* Explorer Header */}
            <div className="p-2.5 flex items-center justify-between gap-1 bg-surface-container-lowest/50 border-b border-surface-container-high/40">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-label-sm text-[10px] font-semibold uppercase text-on-surface-variant tracking-wider truncate">
                  Database Explorer
                </span>
                {isResizingExplorer && (
                  <span className="font-code-sm text-[9px] px-1 py-0.2 rounded bg-primary/20 text-primary font-mono animate-in fade-in shrink-0">
                    {explorerWidth}px
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {onCreateTable && (
                  <button
                    onClick={onCreateTable}
                    className="p-1 rounded text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                    title="Buat Tabel Baru (Create Table)"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={fetchTables}
                  disabled={isRefreshing}
                  className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
                  title="Refresh Database Tree"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
                </button>
                <button
                  onClick={onToggleExplorer}
                  className="md:hidden p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
                  title="Tutup Explorer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Filter Input */}
            <div className="px-2 py-1.5 border-b border-surface-container-high/30">
              <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface-variant font-code-sm text-sm border border-outline-variant/30">
                <Filter className="w-3 h-3 shrink-0" />
                <input
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="w-full bg-transparent text-on-surface outline-none placeholder:text-on-surface-variant/60 font-code-sm text-[11px]"
                  placeholder="Filter tables, views..."
                  type="text"
                />
                {filterText && (
                  <button
                    onClick={() => setFilterText('')}
                    className="text-xs hover:text-on-surface cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Tree Navigation Container */}
            <div className="flex-1 overflow-y-auto px-1.5 py-1.5 space-y-0.5 font-code-sm text-xs select-none">
              {/* public schema node */}
              <div className="group">
                <div
                  onClick={() => setPublicExpanded(!publicExpanded)}
                  className="flex items-center justify-between px-2 py-1 rounded hover:bg-surface-container-high cursor-pointer text-on-surface"
                >
                  <div className="flex items-center gap-1 truncate">
                    {publicExpanded ? (
                      <ChevronDown className="w-3 h-3 text-on-surface-variant shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-on-surface-variant shrink-0" />
                    )}
                    <FolderOpen className="w-3.5 h-3.5 text-secondary shrink-0" />
                    <span className="font-semibold text-xs">public</span>
                  </div>
                </div>

                {publicExpanded && (
                  <div className="ml-3 pl-1 border-l border-surface-container-highest/40 space-y-0.5 mt-0.5">
                    {/* tables group */}
                    <div
                      onClick={() => setTablesExpanded(!tablesExpanded)}
                      className="flex items-center justify-between px-2 py-1 rounded text-on-surface hover:bg-surface-container-high cursor-pointer"
                    >
                      <div className="flex items-center gap-1">
                        {tablesExpanded ? (
                          <ChevronDown className="w-3 h-3 text-on-surface-variant shrink-0" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-on-surface-variant shrink-0" />
                        )}
                        <Table className="w-3 h-3 text-primary shrink-0" />
                        <span className="font-medium text-xs">tables</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-label-sm text-[10px] text-on-surface-variant/60">
                          {filteredTables.length} tables
                        </span>
                        {onCreateTable && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCreateTable();
                            }}
                            className="p-0.5 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                            title="Buat tabel baru (CREATE TABLE)"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {tablesExpanded && (
                      <div className="ml-3 space-y-0.5">
                        {filteredTables.length === 0 ? (
                          <div className="px-2 py-1.5 text-[11px] text-on-surface-variant/60 italic">
                            Tidak ada tabel di database ini
                          </div>
                        ) : (
                          filteredTables.map((t) => {
                            const isCurrent =
                              currentView === 'table-editor' && selectedTable === t.name;
                            return (
                              <button
                                key={t.name}
                                onClick={() => {
                                  onSelectTable(t.name);
                                }}
                                className={`w-full flex items-center justify-between px-2 py-1 rounded transition-colors text-left cursor-pointer ${
                                  isCurrent
                                    ? 'bg-surface-container-high text-primary font-semibold shadow-sm border border-primary/20'
                                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <Table
                                    className={`w-3 h-3 shrink-0 ${
                                      isCurrent ? 'text-primary' : 'text-on-surface-variant'
                                    }`}
                                  />
                                  <span className="truncate text-xs">{t.name}</span>
                                </div>
                              </button>
                            );
                          })
                        )}
                        {onCreateTable && (
                          <button
                            type="button"
                            onClick={onCreateTable}
                            className="w-full flex items-center gap-1.5 px-2 py-1 mt-1 rounded text-primary hover:bg-primary/10 transition-colors text-left cursor-pointer text-xs font-medium"
                            title="Buat Tabel Baru"
                          >
                            <Plus className="w-3 h-3" />
                            <span>New Table...</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* views group */}
                    <div
                      onClick={() => setViewsExpanded(!viewsExpanded)}
                      className="flex items-center justify-between px-2 py-1 rounded text-on-surface-variant hover:bg-surface-container-high cursor-pointer"
                    >
                      <div className="flex items-center gap-1">
                        {viewsExpanded ? (
                          <ChevronDown className="w-3 h-3 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3 h-3 shrink-0" />
                        )}
                        <Eye className="w-3 h-3 text-tertiary shrink-0" />
                        <span className="text-xs">views</span>
                      </div>
                      <span className="font-label-sm text-[10px] text-on-surface-variant/60">3</span>
                    </div>
                    {viewsExpanded && (
                      <div className="ml-3 space-y-0.5 text-xs text-on-surface-variant">
                        <div className="px-2 py-0.5 hover:bg-surface-container-high rounded cursor-pointer truncate">
                          vw_daily_revenue
                        </div>
                        <div className="px-2 py-0.5 hover:bg-surface-container-high rounded cursor-pointer truncate">
                          vw_customer_lifetime_val
                        </div>
                        <div className="px-2 py-0.5 hover:bg-surface-container-high rounded cursor-pointer truncate">
                          vw_low_stock_alerts
                        </div>
                      </div>
                    )}

                    {/* functions group */}
                    <div
                      onClick={() => setFunctionsExpanded(!functionsExpanded)}
                      className="flex items-center justify-between px-2 py-1 rounded text-on-surface-variant hover:bg-surface-container-high cursor-pointer"
                    >
                      <div className="flex items-center gap-1">
                        {functionsExpanded ? (
                          <ChevronDown className="w-3 h-3 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3 h-3 shrink-0" />
                        )}
                        <Code2 className="w-3 h-3 text-secondary shrink-0" />
                        <span className="text-xs">functions</span>
                      </div>
                      <span className="font-label-sm text-[10px] text-on-surface-variant/60">2</span>
                    </div>
                    {functionsExpanded && (
                      <div className="ml-3 space-y-0.5 text-xs text-on-surface-variant">
                        <div className="px-2 py-0.5 hover:bg-surface-container-high rounded cursor-pointer truncate">
                          fn_audit_order_changes()
                        </div>
                        <div className="px-2 py-0.5 hover:bg-surface-container-high rounded cursor-pointer truncate">
                          fn_calculate_net_margin()
                        </div>
                      </div>
                    )}

                    {/* extensions group */}
                    <div
                      onClick={() => setExtensionsExpanded(!extensionsExpanded)}
                      className="flex items-center justify-between px-2 py-1 rounded text-on-surface-variant hover:bg-surface-container-high cursor-pointer"
                    >
                      <div className="flex items-center gap-1">
                        {extensionsExpanded ? (
                          <ChevronDown className="w-3 h-3 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3 h-3 shrink-0" />
                        )}
                        <Puzzle className="w-3 h-3 text-on-surface-variant shrink-0" />
                        <span className="text-xs">extensions</span>
                      </div>
                      <span className="font-label-sm text-[10px] text-on-surface-variant/60">3</span>
                    </div>
                    {extensionsExpanded && (
                      <div className="ml-3 space-y-0.5 text-xs text-on-surface-variant">
                        <div className="px-2 py-0.5 hover:bg-surface-container-high rounded cursor-pointer truncate text-secondary">
                          pgvector (0.5.1)
                        </div>
                        <div className="px-2 py-0.5 hover:bg-surface-container-high rounded cursor-pointer truncate text-primary">
                          uuid-ossp (1.1)
                        </div>
                        <div className="px-2 py-0.5 hover:bg-surface-container-high rounded cursor-pointer truncate">
                          pg_stat_statements (1.10)
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* analytics_staging schema */}
              <div
                onClick={() => setStagingExpanded(!stagingExpanded)}
                className="flex items-center justify-between px-2 py-1 rounded hover:bg-surface-container-high cursor-pointer text-on-surface-variant hover:text-on-surface"
              >
                <div className="flex items-center gap-1">
                  {stagingExpanded ? (
                    <ChevronDown className="w-3 h-3 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3 h-3 shrink-0" />
                  )}
                  <Folder className="w-3.5 h-3.5 text-tertiary shrink-0" />
                  <span className="text-xs">analytics_staging</span>
                </div>
                <span className="font-label-sm text-[10px] text-on-surface-variant/60">2</span>
              </div>
              {stagingExpanded && (
                <div className="ml-3 pl-1 border-l border-surface-container-highest/40 space-y-0.5 text-xs text-on-surface-variant">
                  <div className="px-2 py-0.5 hover:bg-surface-container-high rounded cursor-pointer truncate">
                    stg_event_logs
                  </div>
                  <div className="px-2 py-0.5 hover:bg-surface-container-high rounded cursor-pointer truncate">
                    stg_ad_conversions
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Explorer Status */}
            <div className="p-2 bg-surface-container-lowest/70 border-t border-surface-container-high/40 flex items-center justify-between text-on-surface-variant font-label-sm text-[10px]">
              <span className="truncate">Target: {activeCluster?.host || 'localhost'}</span>
              <span className="text-primary font-code-sm text-[10px] font-semibold">
                SSL: {activeCluster?.sslMode?.toUpperCase() || 'DISABLE'}
              </span>
            </div>
          </aside>
        </>
      )}
    </>
  );
};
