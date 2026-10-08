import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DatabaseViewMode, AppSuiteMode } from '../types/database';
import { Host, Snippet, PortForwardRule } from '../nexussh/types/ssh';
import { api } from '../services/api';
import {
  Search,
  Table,
  Terminal,
  GitFork,
  Activity,
  Server,
  Sliders,
  Palette,
  Cpu,
  Settings,
  Database,
  Plus,
  Zap,
  FolderTree,
  Network,
  Code2,
  ArrowRight,
  Check,
  Key,
  Lock,
} from 'lucide-react';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectView: (view: DatabaseViewMode) => void;
  onSelectTable: (table: string) => void;
  onOpenGoArchitecture: () => void;
  onOpenConnectionSettings: () => void;
  onOpenStudioSettings?: () => void;
  onOpenThemeSettings?: () => void;
  onSelectSuite?: (suite: AppSuiteMode) => void;
  activeDatabase?: string;
  onChangeDatabase?: (db: string) => void;
  onCreateTable?: () => void;
  // NexusSH Suite Integration
  hosts?: Host[];
  snippets?: Snippet[];
  tunnels?: PortForwardRule[];
  onSelectHost?: (host: Host) => void;
  onSelectSnippet?: (snippet: Snippet) => void;
}

type PaletteCategory = 'views' | 'hosts' | 'snippets' | 'tables' | 'databases' | 'settings' | 'architecture';

interface PaletteAction {
  id: string;
  title: string;
  desc: string;
  category: PaletteCategory;
  categoryLabel: string;
  icon: string | React.ReactNode;
  badge?: string;
  badgeColor?: 'primary' | 'secondary' | 'emerald' | 'amber' | 'cyan' | 'muted';
  isToggle?: boolean;
  action: () => void;
}

const SECTION_HEADERS: Record<PaletteCategory, { label: string; icon: string }> = {
  views: { label: 'VIEWS & TOOLS', icon: 'zap' },
  hosts: { label: 'CONNECT TO SSH HOST', icon: 'server' },
  snippets: { label: 'RUN DEVOPS SNIPPET', icon: 'code' },
  tables: { label: 'DATABASE TABLES (PUBLIC SCHEMA)', icon: 'table' },
  databases: { label: 'DATABASE FLEET', icon: 'database' },
  settings: { label: 'PENGATURAN & PREFERENSI', icon: 'settings' },
  architecture: { label: 'ARSITEKTUR ENGINE', icon: 'cpu' },
};

interface TableItem {
  name: string;
  rows?: number;
  size?: string;
  type?: string;
  desc?: string;
}

const FALLBACK_MOCK_TABLES: TableItem[] = [
  { name: 'orders', rows: 89400, size: '4.2 MB', desc: 'E-commerce transaction records' },
  { name: 'customers', rows: 14200, size: '890 kB', desc: 'User identities and profiles' },
  { name: 'order_items', rows: 240000, size: '12.4 MB', desc: 'Line items and breakdown' },
  { name: 'products', rows: 1800, size: '320 kB', desc: 'Catalog with AI vector embeddings' },
  { name: 'categories', rows: 32, size: '16 kB', desc: 'Hierarchy taxonomy definitions' },
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectView,
  onSelectTable,
  onOpenGoArchitecture,
  onOpenConnectionSettings,
  onOpenStudioSettings,
  onOpenThemeSettings,
  onSelectSuite,
  activeDatabase,
  onChangeDatabase,
  onCreateTable,
  hosts = [],
  snippets = [],
  tunnels = [],
  onSelectHost,
  onSelectSnippet,
}) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'tables' | 'hosts' | 'snippets' | 'views' | 'settings'>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isTablesExpanded, setIsTablesExpanded] = useState(false);
  const [liveTables, setLiveTables] = useState<
    Array<{ name: string; rows?: number; size?: string; type?: string }>
  >([]);
  const [liveDatabases, setLiveDatabases] = useState<string[]>([]);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Fetch real PostgreSQL tables & databases when palette opens
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setActiveFilter('all');
      setSelectedIndex(0);
      setIsTablesExpanded(false);
      return;
    }

    let cancelled = false;

    // Fetch dynamic tables for active schema
    api
      .getCatalogSchema()
      .then((res) => {
        if (!cancelled && res && res.tables && res.tables.length > 0) {
          setLiveTables(
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

    // Fetch dynamic database fleet
    api
      .getDatabases()
      .then((res) => {
        if (!cancelled && res && res.databases && res.databases.length > 0) {
          setLiveDatabases(res.databases);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isOpen, activeDatabase]);

  // Build complete list of actions
  const allActions: PaletteAction[] = useMemo(() => {
    const list: PaletteAction[] = [];

    // 1. Navigation & Views (pgStudio & NexusSH)
    list.push(
      {
        id: 'view-sql',
        title: 'Open SQL Editor / Scratchpad',
        desc: 'Jalankan query PostgreSQL, EXPLAIN ANALYZE, & CTE analytics',
        category: 'views',
        categoryLabel: SECTION_HEADERS.views.label,
        icon: <Terminal className="w-4 h-4 text-emerald-400" />,
        badge: 'Workspace',
        badgeColor: 'emerald',
        action: () => onSelectView('sql-editor'),
      },
      {
        id: 'view-table-editor',
        title: 'Open Table Editor & Data Grid',
        desc: 'Spreadsheet-style data viewer, in-cell edits, & pagination',
        category: 'views',
        categoryLabel: SECTION_HEADERS.views.label,
        icon: <Table className="w-4 h-4 text-primary" />,
        badge: 'Workspace',
        badgeColor: 'primary',
        action: () => onSelectView('table-editor'),
      },
      {
        id: 'view-erd',
        title: 'Open Interactive ERD Canvas',
        desc: 'Visual diagram relasi tabel PostgreSQL dan schema inspector',
        category: 'views',
        categoryLabel: SECTION_HEADERS.views.label,
        icon: <GitFork className="w-4 h-4 text-secondary" />,
        badge: 'Canvas',
        badgeColor: 'secondary',
        action: () => onSelectView('schema-and-erd'),
      },
      {
        id: 'view-performance',
        title: 'Open Performance Cockpit',
        desc: 'Telemetry real-time, slow queries, locks, & session monitor',
        category: 'views',
        categoryLabel: SECTION_HEADERS.views.label,
        icon: <Activity className="w-4 h-4 text-amber-400" />,
        badge: 'Monitor',
        badgeColor: 'amber',
        action: () => onSelectView('performance-and-logs'),
      },
      {
        id: 'view-fleet',
        title: 'Manage Workspace Fleet Connections',
        desc: 'Daftar koneksi server PostgreSQL dan status cluster',
        category: 'views',
        categoryLabel: SECTION_HEADERS.views.label,
        icon: <Server className="w-4 h-4 text-cyan-400" />,
        badge: 'Fleet',
        badgeColor: 'cyan',
        action: () => onSelectView('database-connections'),
      }
    );

    // NexusSH Suite Views
    if (onSelectSuite) {
      list.push(
        {
          id: 'suite-nexus-hosts',
          title: 'NexusSH: Hosts Fleet Manager',
          desc: 'Kelola remote Linux/Cloud SSH hosts, key auth, dan latency',
          category: 'views',
          categoryLabel: SECTION_HEADERS.views.label,
          icon: <Server className="w-4 h-4 text-secondary" />,
          badge: 'NexusSH',
          badgeColor: 'secondary',
          action: () => {
            onSelectSuite('nexussh');
            navigate('/nexussh/hosts');
          },
        },
        {
          id: 'suite-nexus-terminal',
          title: 'NexusSH: Web Terminal Sessions',
          desc: 'Terminal SSH interaktif multi-tab xterm.js langsung di browser',
          category: 'views',
          categoryLabel: SECTION_HEADERS.views.label,
          icon: <Terminal className="w-4 h-4 text-emerald-400" />,
          badge: 'NexusSH',
          badgeColor: 'secondary',
          action: () => {
            onSelectSuite('nexussh');
            navigate('/nexussh/terminal');
          },
        },
        {
          id: 'suite-nexus-sftp',
          title: 'NexusSH: SFTP File Browser',
          desc: 'Dual-pane explorer berkas server remote & mesin lokal',
          category: 'views',
          categoryLabel: SECTION_HEADERS.views.label,
          icon: <FolderTree className="w-4 h-4 text-amber-400" />,
          badge: 'NexusSH',
          badgeColor: 'secondary',
          action: () => {
            onSelectSuite('nexussh');
            navigate('/nexussh/sftp');
          },
        },
        {
          id: 'suite-nexus-snippets',
          title: 'NexusSH: DevOps & Snippets',
          desc: 'Koleksi perintah bash otomasi, dump/restore, & health check',
          category: 'views',
          categoryLabel: SECTION_HEADERS.views.label,
          icon: <Code2 className="w-4 h-4 text-cyan-400" />,
          badge: 'NexusSH',
          badgeColor: 'secondary',
          action: () => {
            onSelectSuite('nexussh');
            navigate('/nexussh/snippets');
          },
        },
        {
          id: 'suite-nexus-tunnels',
          title: 'NexusSH: Port Forwarding Tunnels',
          desc: 'Terowongan SSH local, remote, dan dynamic SOCKS forwarder',
          category: 'views',
          categoryLabel: SECTION_HEADERS.views.label,
          icon: <Network className="w-4 h-4 text-purple-400" />,
          badge: 'NexusSH',
          badgeColor: 'secondary',
          action: () => {
            onSelectSuite('nexussh');
            navigate('/nexussh/port-forwarding');
          },
        }
      );
    }

    // 2. SSH Hosts (from NexusSH Fleet)
    if (hosts && hosts.length > 0) {
      hosts.forEach((host) => {
        const hName = host.name || 'Server Host';
        const hUser = host.username || (host as any).user || 'root';
        const hHost = host.hostname || (host as any).host || '127.0.0.1';
        const hPort = host.port || 22;
        const isOnline = host.status === 'online';

        list.push({
          id: `ssh-host-${host.id}`,
          title: `Connect to "${hName}"`,
          desc: `${hUser}@${hHost}:${hPort}${host.latencyMs !== undefined ? ` • ${host.latencyMs}ms` : ''}${host.environment ? ` • ${host.environment}` : ''}`,
          category: 'hosts',
          categoryLabel: SECTION_HEADERS.hosts.label,
          icon: (
            <span className="relative flex h-2.5 w-2.5 items-center justify-center">
              <span
                className={`h-2 w-2 rounded-full ${
                  isOnline
                    ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                    : 'bg-surface-container-highest'
                }`}
              />
            </span>
          ),
          badge: 'Connect',
          badgeColor: 'emerald',
          action: () => {
            if (onSelectHost) {
              onSelectHost(host);
            } else if (onSelectSuite) {
              onSelectSuite('nexussh');
            }
          },
        });
      });
    }

    // 3. DevOps & PG Snippets (from NexusSH Library)
    if (snippets && snippets.length > 0) {
      snippets.forEach((snip) => {
        const desc = snip.description || (snip as any).title || 'DevOps Snippet';
        const script = snip.script || (snip as any).command || '';
        list.push({
          id: `snippet-${snip.id}`,
          title: desc,
          desc: script ? `❯ ${script}` : 'Bash script snippet',
          category: 'snippets',
          categoryLabel: SECTION_HEADERS.snippets.label,
          icon: <Code2 className="w-4 h-4 text-cyan-400" />,
          badge: 'Salin Script',
          badgeColor: 'cyan',
          action: () => {
            if (onSelectSnippet) {
              onSelectSnippet(snip);
            } else {
              navigator.clipboard.writeText(script);
            }
          },
        });
      });
    }

    // 4. Dynamic PostgreSQL Tables
    const tablesList = liveTables.length > 0 ? liveTables : FALLBACK_MOCK_TABLES;
    tablesList.forEach((tbl) => {
      const rowCountStr =
        tbl.rows !== undefined
          ? tbl.rows > 1000
            ? `${(tbl.rows / 1000).toFixed(1)}k rows`
            : `${tbl.rows} rows`
          : 'Table viewer';
      const sizeStr = tbl.size ? ` • ${tbl.size}` : '';

      list.push({
        id: `table-${tbl.name}`,
        title: `Open public.${tbl.name} Data Grid`,
        desc: `${rowCountStr}${sizeStr} • Live PostgreSQL Table`,
        category: 'tables',
        categoryLabel: SECTION_HEADERS.tables.label,
        icon: <Table className="w-4 h-4 text-primary" />,
        badge: 'Table',
        badgeColor: 'primary',
        action: () => {
          onSelectTable(tbl.name);
          onSelectView('table-editor');
        },
      });
    });

    if (onCreateTable) {
      list.push({
        id: 'action-create-table',
        title: 'Create New Table (CREATE TABLE)',
        desc: 'Interactive schema builder with column types & constraints',
        category: 'tables',
        categoryLabel: SECTION_HEADERS.tables.label,
        icon: <Plus className="w-4 h-4 text-primary" />,
        badge: 'New Table',
        badgeColor: 'primary',
        action: () => onCreateTable(),
      });
    }

    // 5. Dynamic PostgreSQL Databases
    if (liveDatabases.length > 0 && onChangeDatabase) {
      liveDatabases.forEach((db) => {
        const isCurrent = db === activeDatabase;
        list.push({
          id: `db-${db}`,
          title: `Switch Database to "${db}"`,
          desc: isCurrent
            ? 'Active Database (Current session)'
            : `Switch active connection to database ${db}`,
          category: 'databases',
          categoryLabel: SECTION_HEADERS.databases.label,
          icon: <Database className="w-4 h-4 text-secondary" />,
          badge: isCurrent ? 'Active' : 'Switch',
          badgeColor: isCurrent ? 'emerald' : 'muted',
          action: () => {
            if (!isCurrent) onChangeDatabase(db);
          },
        });
      });
    }

    // 6. Settings & Config
    list.push(
      {
        id: 'conn-settings',
        title: 'Connection Settings (Catalog Scoping & Config)',
        desc: 'Atur database whitelist/blacklist, filter template DB, & credentials',
        category: 'settings',
        categoryLabel: SECTION_HEADERS.settings.label,
        icon: <Sliders className="w-4 h-4 text-amber-400" />,
        badge: 'Config',
        badgeColor: 'amber',
        action: onOpenConnectionSettings,
      },
      {
        id: 'studio-settings',
        title: 'Master Studio Preferences (Settings & History)',
        desc: 'Limit baris data, statement timeout, autocommit, & general settings',
        category: 'settings',
        categoryLabel: SECTION_HEADERS.settings.label,
        icon: <Settings className="w-4 h-4 text-on-surface-variant" />,
        badge: 'Settings',
        badgeColor: 'muted',
        action: () => {
          if (onOpenStudioSettings) onOpenStudioSettings();
        },
      },
      {
        id: 'theme-settings',
        title: 'Theme & Appearance Settings',
        desc: 'Pilih preset tema (Tokyo Night, Catppuccin, Dracula, OLED Dark)',
        category: 'settings',
        categoryLabel: SECTION_HEADERS.settings.label,
        icon: <Palette className="w-4 h-4 text-rose-400" />,
        badge: 'Themes',
        badgeColor: 'secondary',
        action: () => {
          if (onOpenThemeSettings) onOpenThemeSettings();
        },
      },
      {
        id: 'go-backend',
        title: 'Inspect Golang Backend API Architecture',
        desc: 'High-performance Go Gin microservice with pgx pool & memory telemetry',
        category: 'architecture',
        categoryLabel: SECTION_HEADERS.architecture.label,
        icon: <Cpu className="w-4 h-4 text-cyan-400" />,
        badge: 'Go Engine',
        badgeColor: 'cyan',
        action: onOpenGoArchitecture,
      }
    );

    return list;
  }, [
    liveTables,
    liveDatabases,
    activeDatabase,
    hosts,
    snippets,
    onSelectTable,
    onSelectView,
    onCreateTable,
    onChangeDatabase,
    onSelectSuite,
    onSelectHost,
    onSelectSnippet,
    onOpenConnectionSettings,
    onOpenStudioSettings,
    onOpenThemeSettings,
    onOpenGoArchitecture,
  ]);

  // Filter actions based on query and activeFilter tab
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    // 1. Filter by category tab first
    let pool = allActions;
    if (activeFilter === 'tables') {
      pool = allActions.filter((a) => a.category === 'tables' || a.category === 'databases');
    } else if (activeFilter === 'hosts') {
      pool = allActions.filter((a) => a.category === 'hosts');
    } else if (activeFilter === 'snippets') {
      pool = allActions.filter((a) => a.category === 'snippets');
    } else if (activeFilter === 'views') {
      pool = allActions.filter((a) => a.category === 'views');
    } else if (activeFilter === 'settings') {
      pool = allActions.filter((a) => a.category === 'settings' || a.category === 'architecture');
    }

    // 2. Query filter
    if (!q) {
      // If query is empty and showing all, limit tables so it's not overwhelming
      if (activeFilter === 'all') {
        const tableActions = pool.filter((a) => a.category === 'tables');
        const pureTables = tableActions.filter((a) => a.id !== 'action-create-table');
        const createTableAction = tableActions.find((a) => a.id === 'action-create-table');

        let tablesToShow = tableActions;
        if (!isTablesExpanded && pureTables.length > 3) {
          tablesToShow = [
            ...pureTables.slice(0, 3),
            {
              id: 'toggle-expand-tables',
              title: `📁 Tampilkan Semua ${pureTables.length} Tabel Database...`,
              desc: `Menampilkan 3 dari ${pureTables.length} tabel. Klik untuk membuka semua.`,
              category: 'tables',
              categoryLabel: SECTION_HEADERS.tables.label,
              icon: <Table className="w-4 h-4 text-primary" />,
              badge: 'Expand',
              badgeColor: 'amber',
              isToggle: true,
              action: () => setIsTablesExpanded(true),
            },
          ];
          if (createTableAction) tablesToShow.push(createTableAction);
        } else if (isTablesExpanded && pureTables.length > 3) {
          tablesToShow = [
            ...pureTables,
            {
              id: 'toggle-collapse-tables',
              title: `▲ Ciutkan Daftar Tabel`,
              desc: `Sembunyikan daftar tabel penuh (kembali ke 3 tabel utama)`,
              category: 'tables',
              categoryLabel: SECTION_HEADERS.tables.label,
              icon: <Table className="w-4 h-4 text-primary" />,
              badge: 'Collapse',
              badgeColor: 'amber',
              isToggle: true,
              action: () => setIsTablesExpanded(false),
            },
          ];
          if (createTableAction) tablesToShow.push(createTableAction);
        }

        const otherActions = pool.filter((a) => a.category !== 'tables');
        return [
          ...pool.filter((a) => a.category === 'views').slice(0, 5),
          ...pool.filter((a) => a.category === 'hosts').slice(0, 3),
          ...pool.filter((a) => a.category === 'snippets').slice(0, 3),
          ...tablesToShow,
          ...pool.filter((a) => a.category === 'databases').slice(0, 3),
          ...pool.filter((a) => a.category === 'settings'),
          ...pool.filter((a) => a.category === 'architecture'),
        ];
      }
      return pool;
    }

    return pool.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.desc.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
    );
  }, [allActions, query, activeFilter, isTablesExpanded]);

  // Reset selected index when query or activeFilter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeFilter]);

  // Keep selected item visible in viewport
  useEffect(() => {
    const activeEl = listContainerRef.current?.querySelector(
      `[data-index="${selectedIndex}"]`
    );
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleExecuteAction = (item: PaletteAction) => {
    if (item.isToggle) {
      item.action();
    } else {
      item.action();
      onClose();
    }
  };

  // Keyboard navigation (Esc, ArrowDown, ArrowUp, Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery('');
        return;
      }
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filtered.length > 0 ? (prev + 1) % filtered.length : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          handleExecuteAction(filtered[selectedIndex]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, filtered, selectedIndex]);

  if (!isOpen) return null;

  const renderBadge = (item: PaletteAction) => {
    if (!item.badge) return null;
    let colorCls = 'bg-surface-container-high text-on-surface-variant border-surface-container-highest';
    if (item.badgeColor === 'primary') {
      colorCls = 'bg-primary/10 text-primary border-primary/20';
    } else if (item.badgeColor === 'secondary') {
      colorCls = 'bg-secondary/15 text-secondary border-secondary/25';
    } else if (item.badgeColor === 'emerald') {
      colorCls = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    } else if (item.badgeColor === 'amber') {
      colorCls = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    } else if (item.badgeColor === 'cyan') {
      colorCls = 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
    }

    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-mono border font-semibold shrink-0 ${colorCls}`}>
        {item.badge}
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* NexusSH Modern Backdrop */}
      <div className="fixed inset-0 bg-black/75 backdrop-blur-md" />

      {/* Palette Box with NexusSH & pgStudio Styling */}
      <div
        className="relative z-50 w-full max-w-2xl overflow-hidden rounded-2xl border border-surface-container-high bg-surface-container-low shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col max-h-[580px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 bg-surface-container-lowest border-b border-surface-container-high">
          <Search className="h-4 w-4 text-on-surface-variant mr-3 shrink-0" />
          <input
            type="text"
            placeholder="Type a command or search tables, hosts, snippets, navigation..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none font-medium"
          />
          <kbd className="rounded-md border border-surface-container-high bg-surface-container px-2 py-0.5 text-[10px] font-mono text-on-surface-variant shrink-0">
            ESC
          </kbd>
        </div>

        {/* Category Filter Pills (NexusSH UX Upgrade) */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-surface-container-high/60 bg-surface-container-lowest/50 overflow-x-auto select-none">
          {(
            [
              { id: 'all', label: 'Semua' },
              { id: 'views', label: 'Views & Tools' },
              { id: 'hosts', label: 'SSH Hosts' },
              { id: 'snippets', label: 'Snippets' },
              { id: 'tables', label: 'Tabel & DB' },
              { id: 'settings', label: 'Pengaturan' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeFilter === tab.id
                  ? 'bg-primary text-on-primary shadow-xs font-bold'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Results Scroll Area with Section Headers */}
        <div
          ref={listContainerRef}
          className="flex-1 overflow-y-auto p-2 divide-y divide-surface-container-high/30 text-xs scroll-smooth"
        >
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-on-surface-variant text-xs space-y-1.5 select-none">
              <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface-variant mx-auto mb-2 border border-surface-container-high">
                <Search className="w-5 h-5 opacity-60" />
              </div>
              <div className="font-semibold text-on-surface">
                Tidak ada perintah atau item untuk "{query}"
              </div>
              <div className="text-[11px] text-on-surface-variant/70">
                Coba gunakan kata kunci seperti "orders", "terminal", "hosts", atau "logs".
              </div>
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const showCategoryHeader =
                idx === 0 || item.category !== filtered[idx - 1]?.category;

              return (
                <div key={item.id} className="pt-1 pb-1">
                  {showCategoryHeader && (
                    <span className="px-2.5 py-1 text-[10px] text-on-surface-variant/70 uppercase tracking-wider block font-bold select-none">
                      {item.categoryLabel}
                    </span>
                  )}

                  <button
                    data-index={idx}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => handleExecuteAction(item)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-surface-container-high ring-1 ring-primary/40 text-on-surface shadow-xs'
                        : 'hover:bg-surface-container text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                          isSelected
                            ? 'bg-primary/15 border-primary/30 text-primary'
                            : 'bg-surface-container border-surface-container-high text-on-surface-variant'
                        }`}
                      >
                        {item.icon}
                      </div>

                      <div className="truncate min-w-0">
                        <div
                          className={`text-xs font-semibold truncate ${
                            isSelected ? 'text-primary' : 'text-on-surface'
                          }`}
                        >
                          {item.title}
                        </div>
                        <div className="text-[11px] text-on-surface-variant/70 truncate">
                          {item.desc}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {renderBadge(item)}
                      <ArrowRight
                        className={`h-3.5 w-3.5 transition-transform ${
                          isSelected ? 'text-primary translate-x-0.5' : 'text-on-surface-variant/40'
                        }`}
                      />
                    </div>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Navigation Bar matching NexusSH style */}
        <div className="px-4 py-2.5 bg-surface-container-lowest border-t border-surface-container-high flex items-center justify-between text-[11px] text-on-surface-variant select-none">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface font-mono text-[10px] border border-surface-container-high">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface font-mono text-[10px] border border-surface-container-high">
                ↓
              </kbd>
              <span>Navigasi</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface font-mono text-[10px] border border-surface-container-high">
                ↵
              </kbd>
              <span>Pilih</span>
            </span>
            <span className="inline-flex items-center gap-1 hidden sm:inline-flex">
              <kbd className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface font-mono text-[10px] border border-surface-container-high">
                ESC
              </kbd>
              <span>Tutup</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-primary">
              {filtered.length} Perintah
            </span>
            <span className="text-surface-container-highest">·</span>
            <span className="text-[10px] font-mono font-medium text-on-surface-variant/70">
              pgStudio × NexusSH
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
