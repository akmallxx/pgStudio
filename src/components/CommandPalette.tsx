import React, { useEffect, useState } from 'react';
import { DatabaseViewMode } from '../types/database';
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
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectView: (view: DatabaseViewMode) => void;
  onSelectTable: (table: string) => void;
  onOpenGoArchitecture: () => void;
  onOpenConnectionSettings: () => void;
  onOpenStudioSettings?: () => void;
  onOpenThemeSettings?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectView,
  onSelectTable,
  onOpenGoArchitecture,
  onOpenConnectionSettings,
  onOpenStudioSettings,
  onOpenThemeSettings,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery('');
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const renderActionIcon = (icon: string) => {
    switch (icon) {
      case 'table_rows':
        return <Table className="w-4 h-4" />;
      case 'terminal':
        return <Terminal className="w-4 h-4" />;
      case 'account_tree':
        return <GitFork className="w-4 h-4" />;
      case 'query_stats':
        return <Activity className="w-4 h-4" />;
      case 'dns':
        return <Server className="w-4 h-4" />;
      case 'settings_input_component':
        return <Sliders className="w-4 h-4" />;
      case 'palette':
        return <Palette className="w-4 h-4" />;
      case 'code_blocks':
        return <Cpu className="w-4 h-4" />;
      case 'settings':
        return <Settings className="w-4 h-4" />;
      default:
        return <Table className="w-4 h-4" />;
    }
  };

  const actions = [
    {
      id: 'table-orders',
      title: 'Open public.orders Data Grid',
      desc: 'Table viewer • E-commerce transaction records',
      category: 'Tables',
      icon: 'table_rows',
      action: () => {
        onSelectTable('orders');
        onSelectView('table-editor');
      },
    },
    {
      id: 'table-customers',
      title: 'Open public.customers Data Grid',
      desc: 'Table viewer • User identities and profiles',
      category: 'Tables',
      icon: 'table_rows',
      action: () => {
        onSelectTable('customers');
        onSelectView('table-editor');
      },
    },
    {
      id: 'table-products',
      title: 'Open public.products Data Grid',
      desc: 'Table viewer • Catalog with AI vector embeddings',
      category: 'Tables',
      icon: 'table_rows',
      action: () => {
        onSelectTable('products');
        onSelectView('table-editor');
      },
    },
    {
      id: 'view-sql',
      title: 'Open SQL Editor / Scratchpad',
      desc: 'Run queries, EXPLAIN ANALYZE, and CTE analytics',
      category: 'Workspaces',
      icon: 'terminal',
      action: () => onSelectView('sql-editor'),
    },
    {
      id: 'view-erd',
      title: 'Open Interactive ERD Canvas',
      desc: 'Visual relationship graph and Table Inspector',
      category: 'Workspaces',
      icon: 'account_tree',
      action: () => onSelectView('schema-and-erd'),
    },
    {
      id: 'view-performance',
      title: 'Open Performance Cockpit',
      desc: 'Bento metrics, slow queries & active sessions',
      category: 'Telemetry',
      icon: 'query_stats',
      action: () => onSelectView('performance-and-logs'),
    },
    {
      id: 'view-fleet',
      title: 'Manage Workspace Fleet Connections',
      desc: 'PostgreSQL connection profiles & clusters',
      category: 'Connections',
      icon: 'dns',
      action: () => onSelectView('database-connections'),
    },
    {
      id: 'conn-settings',
      title: 'Connection Settings (DBeaver Catalog Scoping & Cluster Config)',
      desc: 'Show all databases on server, exclude template DBs, regex whitelist',
      category: 'Settings',
      icon: 'settings_input_component',
      action: onOpenConnectionSettings,
    },
    {
      id: 'studio-settings',
      title: 'Master Studio Settings (Query Limits, History & Storage)',
      desc: 'Batas riwayat query (default 50), page limit, autocommit, file settings.json',
      category: 'Settings',
      icon: 'settings',
      action: () => {
        onClose();
        if (onOpenStudioSettings) onOpenStudioSettings();
      },
    },
    {
      id: 'theme-settings',
      title: 'Master Pengaturan Tema & Preset (Theme Settings)',
      desc: 'Pilih preset (Tokyo Night, Catppuccin, Dracula, OLED) atau rancang palet custom',
      category: 'Settings',
      icon: 'palette',
      action: () => {
        onClose();
        if (onOpenThemeSettings) onOpenThemeSettings();
      },
    },
    {
      id: 'go-backend',
      title: 'Inspect Golang Backend API Architecture',
      desc: 'High-performance Go Gin microservice with pgx pool',
      category: 'Architecture',
      icon: 'code_blocks',
      action: onOpenGoArchitecture,
    },
  ];

  const filtered = actions.filter(
    (a) =>
      a.title.toLowerCase().includes(query.toLowerCase()) ||
      a.desc.toLowerCase().includes(query.toLowerCase()) ||
      a.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-surface-container-lowest/80 backdrop-blur-sm flex items-start justify-center pt-20 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-surface-container-low border border-surface-container-high rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[540px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-surface-container-lowest border-b border-surface-container-high">
          <Search className="w-5 h-5 text-secondary shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, table name, or feature..."
            className="w-full bg-transparent text-on-surface font-body-md text-base outline-none placeholder:text-on-surface-variant/50"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant text-[11px] font-mono">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-on-surface-variant font-body-sm text-body-sm">
              No matching commands or tables found for "{query}".
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  item.action();
                  onClose();
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-surface-container text-left transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-surface-container-high group-hover:bg-primary/20 text-on-surface group-hover:text-primary flex items-center justify-center transition-colors">
                    {renderActionIcon(item.icon)}
                  </div>
                  <div>
                    <div className="font-headline-sm text-sm text-on-surface font-medium group-hover:text-primary transition-colors">
                      {item.title}
                    </div>
                    <div className="font-body-sm text-xs text-on-surface-variant">{item.desc}</div>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-code-sm text-[10px]">
                  {item.category}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 bg-surface-container-lowest/80 border-t border-surface-container-high flex items-center justify-between text-on-surface-variant font-code-sm text-[11px]">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span className="text-primary font-medium">pgStudio Command Dispatcher</span>
        </div>
      </div>
    </div>
  );
};
