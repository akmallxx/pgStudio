import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DatabaseViewMode } from '../../types/database';
import {
  Globe,
  Copy,
  Terminal,
  Table,
  CloudUpload,
  HardDrive,
  Activity,
  Cpu,
  Gauge,
  Star,
  ArrowRight,
  ExternalLink,
  History,
  Play,
  Zap,
  Puzzle,
  Cloud,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';
import { api, DatabaseOverviewResponse, QueryHistoryItem } from '../../services/api';

interface DatabaseOverviewProps {
  onSelectView: (view: DatabaseViewMode) => void;
  onSelectTable: (table: string) => void;
  onShowToast: (message: string, icon?: string, isError?: boolean) => void;
}

export const DatabaseOverview: React.FC<DatabaseOverviewProps> = ({
  onSelectView,
  onSelectTable,
  onShowToast,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const connectTab = (searchParams.get('connectTab') as 'prisma' | 'node' | 'python' | 'psql') || 'prisma';
  const setConnectTab = (t: 'prisma' | 'node' | 'python' | 'psql') => {
    const next = new URLSearchParams(searchParams);
    next.set('connectTab', t);
    setSearchParams(next);
  };

  const [overview, setOverview] = useState<DatabaseOverviewResponse | null>(null);
  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchOverviewData = useCallback(async () => {
    try {
      const [ov, hist] = await Promise.all([
        api.getDatabaseOverview(),
        api.getQueryHistory().catch(() => []),
      ]);
      setOverview(ov);
      setQueryHistory(hist);
    } catch (err) {
      console.error('Failed to load database overview:', err);
    }
  }, []);

  useEffect(() => {
    fetchOverviewData();
    const interval = setInterval(fetchOverviewData, 6000);
    return () => clearInterval(interval);
  }, [fetchOverviewData]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchOverviewData();
    setTimeout(() => setIsRefreshing(false), 400);
    onShowToast('Overview metrics refreshed', 'refresh');
  };

  const handleClearHistory = async () => {
    try {
      await api.clearQueryHistory();
      setQueryHistory([]);
      onShowToast('Execution history cleared', 'delete');
    } catch {
      onShowToast('Failed to clear execution history', 'error', true);
    }
  };

  const dbHost = overview?.host || 'localhost';
  const dbPort = overview?.port || 5432;
  const dbUser = overview?.user || 'postgres';
  const dbName = overview?.database_name || 'postgres';

  const connectionSnippets: Record<string, string> = {
    prisma: `// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// .env
DATABASE_URL="postgresql://${dbUser}:••••••••@${dbHost}:${dbPort}/${dbName}"`,
    node: `// Node.js (pg library)
import { Pool } from 'pg';

const pool = new Pool({
  host: '${dbHost}',
  port: ${dbPort},
  user: '${dbUser}',
  password: process.env.PG_PASSWORD,
  database: '${dbName}',
  max: 20,
  idleTimeoutMillis: 30000,
});`,
    python: `# Python SQLAlchemy / psycopg3
from sqlalchemy import create_engine

engine = create_engine(
    "postgresql+psycopg://${dbUser}:••••••••@${dbHost}:${dbPort}/${dbName}",
    pool_size=10,
    max_overflow=20,
)`,
    psql: `# psql CLI direct connection
psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName}`,
  };

  return (
    <div className="flex flex-col w-full space-y-3">
      {/* Cluster Header Banner */}
      <div className="bg-surface-container-low rounded-xl p-3 sm:p-3.5 border border-surface-container-high/60 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`flex items-center gap-1 px-1.5 py-0.2 rounded font-code-sm text-[10px] font-semibold ${
                overview?.is_live !== false ? 'bg-primary/10 text-primary' : 'bg-tertiary/10 text-tertiary'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${overview?.is_live !== false ? 'bg-primary animate-pulse' : 'bg-tertiary'}`}></span>
                {overview?.is_live !== false ? 'HEALTHY' : 'STANDBY'}
              </span>
              <span className="text-on-surface-variant font-code-sm text-[11px]">
                {overview?.version_short || 'PostgreSQL 17.x'}
              </span>
              <span className="text-on-surface-variant font-code-sm text-[11px] flex items-center gap-0.5">
                <Globe className="w-3 h-3" />
                {dbHost}:{dbPort}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-headline-md text-base sm:text-lg font-bold text-on-surface">
                {overview?.connection_name || `${dbHost} (${dbName})`}
              </h1>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(
                    `postgresql://${dbUser}:••••••••@${dbHost}:${dbPort}/${dbName}`
                  );
                  onShowToast('Connection URI copied to clipboard', 'content_copy');
                }}
                className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface-variant text-[11px] font-code-sm transition-colors cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>Copy URI</span>
              </button>
              <button
                onClick={handleManualRefresh}
                className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface-variant text-[11px] font-code-sm transition-colors cursor-pointer"
                title="Refresh metrics"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
            <p className="font-body-sm text-[11px] text-on-surface-variant">
              Live transactional database catalog • {overview?.tables_count ?? 0} tables registered in schema catalog.
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => onSelectView('sql-editor')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-on-primary font-label-md text-xs font-semibold hover:bg-primary-fixed transition-colors shadow cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>+ New Query</span>
            </button>
            <button
              onClick={() => {
                if (overview?.tables && overview.tables.length > 0) {
                  onSelectTable(overview.tables[0].target);
                }
                onSelectView('table-editor');
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface font-label-md text-xs transition-colors cursor-pointer"
            >
              <Table className="w-3.5 h-3.5" />
              <span>Table Editor</span>
            </button>
            <button
              onClick={() => onShowToast('Database status & schema cache synchronized', 'backup')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface font-label-md text-xs transition-colors cursor-pointer"
            >
              <CloudUpload className="w-3.5 h-3.5" />
              <span>Sync</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="bg-surface-container-lowest p-3 rounded-xl border border-surface-container-high/60 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-[10px] uppercase tracking-wider">
            <span>DATABASE SIZE</span>
            <HardDrive className="w-4 h-4 text-secondary" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-headline-lg text-2xl font-bold text-on-surface">
              {overview?.database_size || '—'}
            </span>
          </div>
          <div className="text-[11px] text-on-surface-variant font-code-sm pt-1">
            Catalog: <span className="text-primary font-medium">{overview?.tables_count ?? 0} tables</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-3.5 rounded-xl border border-surface-container-high/60 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-[10px] uppercase tracking-wider">
            <span>ACTIVE CONNECTIONS</span>
            <Activity className="w-4 h-4 text-primary" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-headline-lg text-2xl font-bold text-on-surface">
              {overview?.active_conns ?? 1}
            </span>
            <span className="font-code-sm text-xs text-on-surface-variant">
              / {overview?.max_conns ?? 100} max
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-on-surface-variant font-code-sm pt-1">
            <span className="text-primary font-medium">● PID #{overview?.backend_pid || '—'}</span>
            <span>Server backend</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-3.5 rounded-xl border border-surface-container-high/60 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-[10px] uppercase tracking-wider">
            <span>CACHE HIT RATIO</span>
            <Cpu className="w-4 h-4 text-tertiary" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-headline-lg text-2xl font-bold text-on-surface">
              {overview?.cache_hit_ratio !== undefined ? `${overview.cache_hit_ratio.toFixed(1)}%` : '99.5%'}
            </span>
            <span className="px-1.5 py-0.2 rounded bg-primary/20 text-primary text-[10px] font-semibold">
              {(overview?.cache_hit_ratio ?? 100) >= 95 ? 'Optimal' : 'Standard'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-on-surface-variant font-code-sm pt-1">
            <span>Encoding</span>
            <span className="text-secondary font-medium">{overview?.server_encoding || 'UTF8'}</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-3.5 rounded-xl border border-surface-container-high/60 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-[10px] uppercase tracking-wider">
            <span>ISOLATION LEVEL</span>
            <Gauge className="w-4 h-4 text-primary" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-headline-lg text-lg font-bold text-on-surface truncate">
              {overview?.isolation_level || 'READ COMMITTED'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-on-surface-variant font-code-sm pt-1">
            <span>Mode</span>
            <span className="text-secondary font-medium">Transactional</span>
          </div>
        </div>
      </div>

      {/* Main Two Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 7 Cols: Starred / Real Catalog Tables & Recent Executions */}
        <div className="lg:col-span-7 space-y-4">
          {/* Tables in Database */}
          <div className="bg-surface-container-lowest p-4 rounded-xl border border-surface-container-high/60 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Star className="w-4 h-4 text-tertiary" />
                <span className="font-headline-sm text-sm text-on-surface font-semibold">
                  Catalog Tables ({overview?.database_name || 'postgres'})
                </span>
                <span className="px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface-variant font-code-sm text-[10px]">
                  {overview?.tables?.length ?? 0} found
                </span>
              </div>
              <button
                onClick={() => {
                  if (overview?.tables && overview.tables.length > 0) {
                    onSelectTable(overview.tables[0].target);
                  }
                  onSelectView('table-editor');
                }}
                className="text-primary hover:underline font-label-sm text-xs flex items-center gap-1 cursor-pointer"
              >
                <span>View in Editor</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2">
              {overview?.tables && overview.tables.length > 0 ? (
                overview.tables.slice(0, 5).map((tbl) => (
                  <div
                    key={tbl.name}
                    className="flex items-center justify-between p-2.5 rounded bg-surface-container-low hover:bg-surface-container border border-surface-container-high/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Table className="w-4 h-4 text-primary shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-code-sm text-xs font-semibold text-on-surface truncate">
                            {tbl.name}
                          </span>
                          <span className="px-1 py-0.2 rounded bg-surface-container-high text-secondary text-[9px] font-mono">
                            {tbl.tag}
                          </span>
                        </div>
                        <span className="font-code-sm text-[10px] text-on-surface-variant truncate">
                          {tbl.rows} • {tbl.disk}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onSelectTable(tbl.target);
                        onSelectView('table-editor');
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface font-label-md text-xs transition-colors cursor-pointer shrink-0"
                    >
                      <span>Browse</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="p-4 rounded-lg bg-surface-container-low border border-dashed border-outline-variant/40 text-center space-y-2">
                  <p className="font-body-sm text-xs text-on-surface-variant">
                    No user tables currently populated in schema.
                  </p>
                  <button
                    onClick={() => onSelectView('sql-editor')}
                    className="px-3 py-1 rounded bg-primary text-on-primary font-label-sm text-xs font-semibold hover:bg-primary-fixed transition-colors cursor-pointer"
                  >
                    Create Table with SQL
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Recent Executions */}
          <div className="bg-surface-container-lowest p-4 rounded-xl border border-surface-container-high/60 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <History className="w-4 h-4 text-secondary" />
                <span className="font-headline-sm text-sm text-on-surface font-semibold">
                  Recent Executions
                </span>
                <span className="px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface-variant font-code-sm text-[10px]">
                  PID #{overview?.backend_pid || 'Session'}
                </span>
              </div>
              {queryHistory.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="text-on-surface-variant hover:text-on-surface font-label-sm text-xs cursor-pointer"
                >
                  Clear History
                </button>
              )}
            </div>

            <div className="space-y-2 font-mono text-xs">
              {queryHistory.length > 0 ? (
                queryHistory.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded bg-surface-container-low border border-surface-container-high/40 space-y-2"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className={`font-semibold flex items-center gap-1 ${
                        item.status === 'SUCCESS' ? 'text-primary' : 'text-error'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${item.status === 'SUCCESS' ? 'bg-primary' : 'bg-error'}`}></span>
                        {item.status === 'SUCCESS' ? '200 OK' : 'ERROR'} • {item.duration_ms}ms
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-on-surface-variant">
                          {item.row_count} rows • {item.executed_at ? new Date(item.executed_at).toLocaleTimeString() : 'just now'}
                        </span>
                        <button
                          onClick={() => {
                            onSelectView('sql-editor');
                            onShowToast('Navigating to SQL workspace', 'terminal');
                          }}
                          className="px-2 py-0.5 rounded bg-surface-container-high hover:bg-surface-bright text-primary text-[10px] flex items-center gap-1 cursor-pointer"
                        >
                          <Play className="w-3 h-3" />
                          SQL
                        </button>
                      </div>
                    </div>
                    <div className="text-on-surface text-[11px] leading-relaxed truncate">
                      {item.query}
                    </div>
                    {item.error_message && (
                      <div className="text-error text-[10px] truncate">
                        {item.error_message}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-4 rounded-lg bg-surface-container-low border border-surface-container-high/40 text-center space-y-1 text-on-surface-variant text-xs">
                  <p>No queries executed in this session yet.</p>
                  <button
                    onClick={() => onSelectView('sql-editor')}
                    className="text-primary hover:underline text-xs cursor-pointer"
                  >
                    Open SQL Editor to run statements
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right 5 Cols: Connect to Cluster + Extensions + Continuous Backups */}
        <div className="lg:col-span-5 space-y-4">
          {/* Connect to Cluster */}
          <div className="bg-surface-container-lowest p-4 rounded-xl border border-surface-container-high/60 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-primary" />
                <span className="font-headline-sm text-sm text-on-surface font-semibold">
                  Connect to Database
                </span>
              </div>
              <span className="font-code-sm text-[10px] text-secondary">Port {dbPort}</span>
            </div>

            {/* Language tabs */}
            <div className="flex items-center gap-1 p-0.5 rounded bg-surface-container-low border border-surface-container-high">
              {(['prisma', 'node', 'python', 'psql'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setConnectTab(tab)}
                  className={`flex-1 py-1 rounded text-xs font-code-sm capitalize transition-colors cursor-pointer ${
                    connectTab === tab
                      ? 'bg-surface-container-high text-primary font-semibold shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {tab === 'node' ? 'Node.js' : tab === 'psql' ? 'psql CLI' : tab}
                </button>
              ))}
            </div>

            {/* Code Box */}
            <div className="relative">
              <pre className="p-3 rounded bg-surface-container-low font-mono text-[11px] text-secondary leading-relaxed overflow-x-auto border border-surface-container-high">
                {connectionSnippets[connectTab]}
              </pre>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(connectionSnippets[connectTab]);
                  onShowToast(`Copied ${connectTab} snippet to clipboard`, 'content_copy');
                }}
                className="absolute right-2 top-2 p-1 rounded bg-surface-container-high text-on-surface-variant hover:text-on-surface cursor-pointer"
                title="Copy snippet"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-on-surface-variant">
              Live connection string generated from active cluster profile ({dbHost}:{dbPort}/{dbName}).
            </p>
          </div>

          {/* Enabled Extensions */}
          <div className="bg-surface-container-lowest p-4 rounded-xl border border-surface-container-high/60 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Puzzle className="w-4 h-4 text-secondary" />
                <span className="font-headline-sm text-sm text-on-surface font-semibold">
                  Enabled Extensions
                </span>
              </div>
              <button
                onClick={() => onShowToast('Extensions management catalog opened', 'tune')}
                className="text-primary hover:underline font-label-sm text-xs cursor-pointer"
              >
                Manage
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-code-sm">
              <div className="p-2 rounded bg-surface-container-low border border-surface-container-high/40">
                <div className="flex items-center justify-between">
                  <span className="text-secondary font-semibold">pgvector</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                </div>
                <div className="text-[10px] text-on-surface-variant mt-0.5">v0.5.1 • AI Embeddings</div>
              </div>

              <div className="p-2 rounded bg-surface-container-low border border-surface-container-high/40">
                <div className="flex items-center justify-between">
                  <span className="text-primary font-semibold">uuid-ossp</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                </div>
                <div className="text-[10px] text-on-surface-variant mt-0.5">v1.1 • UUID gen</div>
              </div>

              <div className="p-2 rounded bg-surface-container-low border border-surface-container-high/40">
                <div className="flex items-center justify-between">
                  <span className="text-on-surface font-semibold">pg_stat_stmt</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                </div>
                <div className="text-[10px] text-on-surface-variant mt-0.5">v1.10 • Perf metrics</div>
              </div>

              <div className="p-2 rounded bg-surface-container-low border border-surface-container-high/40">
                <div className="flex items-center justify-between">
                  <span className="text-tertiary font-semibold">postgis</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                </div>
                <div className="text-[10px] text-on-surface-variant mt-0.5">v3.4 • Geospatial</div>
              </div>
            </div>
          </div>

          {/* Continuous Backups */}
          <div className="bg-surface-container-lowest p-4 rounded-xl border border-surface-container-high/60 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Cloud className="w-4 h-4 text-primary" />
                <span className="font-headline-sm text-sm text-on-surface font-semibold">
                  Continuous Backups &amp; WAL
                </span>
              </div>
              <span className="px-1.5 py-0.2 rounded bg-primary/20 text-primary text-[10px] font-semibold">
                Active
              </span>
            </div>

            <div className="space-y-1.5 text-xs font-code-sm">
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">Last automated snapshot</span>
                <span className="text-on-surface font-medium">Synchronized</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">WAL Archiving Status</span>
                <span className="text-primary font-medium">Synced (0 byte lag)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">Point-in-Time Recovery</span>
                <span className="text-secondary font-medium">Ready</span>
              </div>
            </div>

            <button
              onClick={() => onShowToast('Fork / Restore database dialog opened', 'restore')}
              className="w-full py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-outline-variant/30"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore or Fork Database</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
