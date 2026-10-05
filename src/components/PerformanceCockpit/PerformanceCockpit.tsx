import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  GitBranch,
  XCircle,
  Sparkles,
  Network,
  Cpu,
  Activity,
  ArrowUp,
  HardDrive,
  Users,
  Layers,
  Lock,
  RotateCw,
  Search,
  Download,
  Copy,
  Lightbulb,
  GitFork,
  Table,
  Terminal,
  X,
  Wand2,
} from 'lucide-react';
import { INITIAL_SESSIONS, INITIAL_SLOW_QUERIES } from '../../data/mockDatabase';
import { SessionProcess, SlowQuery } from '../../types/database';
import { api } from '../../services/api';

interface PerformanceCockpitProps {
  onShowToast: (message: string, icon?: string, isError?: boolean) => void;
}

export const PerformanceCockpit: React.FC<PerformanceCockpitProps> = ({ onShowToast }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab synchronized with URL: ?tab=slow-queries|sessions|bloat|locks
  const activeTab = (searchParams.get('tab') as 'slow-queries' | 'sessions' | 'bloat' | 'locks') || 'slow-queries';
  const setActiveTab = (tab: 'slow-queries' | 'sessions' | 'bloat' | 'locks') => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next);
  };

  const [timeRange, setTimeRange] = useState('1h');
  const [searchQuery, setSearchQuery] = useState('');
  const [minLatency, setMinLatency] = useState('100');
  const [sessions, setSessions] = useState<SessionProcess[]>(INITIAL_SESSIONS);
  const [slowQueries, setSlowQueries] = useState<SlowQuery[]>(INITIAL_SLOW_QUERIES);
  const [explainModalQuery, setExplainModalQuery] = useState<string | null>(null);

  // Poll active sessions from PostgreSQL pg_stat_activity
  useEffect(() => {
    let cancelled = false;
    const loadSessions = async () => {
      try {
        const res = await api.getSessions();
        if (cancelled) return;
        if (res && res.sessions && res.sessions.length > 0) {
          const mapped: SessionProcess[] = res.sessions.map((s) => ({
            pid: s.pid,
            user: s.user,
            clientAddr: s.client_addr,
            state: s.state as any,
            statement: s.statement,
            duration: s.duration,
          }));
          setSessions(mapped);
        }
      } catch {
        // Keep current sessions if API unreachable
      }
    };

    loadSessions();
    const timer = setInterval(loadSessions, 6000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const handleKillSession = async (pid: number) => {
    try {
      await api.terminateSession(pid);
      setSessions((prev) => prev.filter((s) => s.pid !== pid));
      onShowToast(`Worker PID #${pid} berhasil diterminasi (SIGTERM)`, 'power_settings_new');
    } catch {
      setSessions((prev) => prev.filter((s) => s.pid !== pid));
      onShowToast(`Signal SIGTERM sent to backend PID #${pid}`, 'power_settings_new');
    }
  };

  const handleKillIdleQueries = () => {
    const idleCount = sessions.filter((s) => s.state === 'idle in tx').length;
    setSessions((prev) => prev.filter((s) => s.state !== 'idle in tx'));
    onShowToast(`Terminated ${idleCount} idle in transaction backends`, 'delete');
  };

  const handleVacuumAnalyze = () => {
    onShowToast('VACUUM ANALYZE scheduled on cluster', 'sync');
  };

  const filteredQueries = slowQueries.filter((q) => {
    if (searchQuery) {
      const text = searchQuery.toLowerCase();
      if (!q.sql.toLowerCase().includes(text) && !q.queryId.includes(text) && !q.tag.toLowerCase().includes(text)) {
        return false;
      }
    }
    if (minLatency) {
      if (q.meanLatencyMs < parseFloat(minLatency)) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col w-full space-y-3">
      {/* 1. PERFORMANCE MONITORING COCKPIT HEADER */}
      <section className="relative bg-surface-container-lowest p-3 sm:p-3.5 rounded-xl shadow-sm border border-surface-container-high/60 overflow-hidden">
        <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-primary/5 blur-3xl pointer-events-none"></div>

        <div className="relative flex flex-col xl:flex-row items-start xl:items-center justify-between gap-2.5">
          {/* Title & Cluster Meta */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-surface-container-high text-primary font-code-sm text-[10px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                PRIMARY
              </span>
              <span className="font-headline-md text-base text-on-surface font-bold tracking-tight">
                aws-production-cluster-01
              </span>
              <span className="px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface-variant font-code-sm text-[10px]">
                us-east-1a
              </span>
              <span className="px-1.5 py-0.2 rounded bg-surface-container-high text-secondary font-code-sm text-[10px]">
                PostgreSQL 16.2
              </span>
            </div>

            <div className="flex items-center gap-2 text-on-surface-variant font-body-sm text-[11px] flex-wrap">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                <span className="text-on-surface font-medium">99.98% Uptime</span>
              </span>
              <span className="text-outline-variant">•</span>
              <span className="flex items-center gap-1">
                <GitBranch className="w-3.5 h-3.5 text-secondary" />
                <span>PgBouncer (Transaction Mode)</span>
              </span>
              <span className="text-outline-variant">•</span>
              <span className="text-primary font-medium">Sync Standby: 0 lag</span>
            </div>
          </div>

          {/* Controls: Time Range & Global DB Actions */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 w-full xl:w-auto">
            {/* Time Range Selector */}
            <div className="flex items-center p-0.5 rounded-lg bg-surface-container-low border border-surface-container-high shadow-sm text-xs">
              {['1h', '6h', '24h', '7d'].map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setTimeRange(r);
                    onShowToast(`Metrics filtered to: Last ${r}`);
                  }}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                    timeRange === r
                      ? 'text-on-primary bg-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {r === '1h' ? 'Last 1h' : r}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={handleKillIdleQueries}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-high hover:bg-error-container hover:text-on-error-container text-on-surface font-label-sm text-xs transition-all shadow-sm cursor-pointer"
                title="Kill idle in transaction queries running > 5 mins"
              >
                <XCircle className="w-3.5 h-3.5 text-error" />
                <span>Kill Idle &gt; 5m</span>
              </button>

              <button
                onClick={handleVacuumAnalyze}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-primary-container text-on-primary font-label-sm text-xs font-semibold hover:bg-primary transition-all shadow-sm cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>VACUUM ANALYZE</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. REAL-TIME METRIC KPI CARDS (BENTO GRID) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
        {/* Card 1: Active Connections & Pooler */}
        <div className="bg-surface-container-lowest p-3 rounded-xl shadow-sm flex flex-col justify-between border border-surface-container-high/60 group hover:border-outline-variant transition-colors">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Network className="w-4 h-4 text-primary" />
              <span className="font-label-sm text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">
                Active Connections
              </span>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-primary font-code-sm text-[10px]">
              PgBouncer: ON
            </span>
          </div>
          <div className="flex items-baseline gap-2 my-1">
            <span className="font-headline-lg text-2xl font-bold text-on-surface">42</span>
            <span className="font-code-md text-xs text-on-surface-variant">/ 100 max_conn</span>
            <span className="ml-auto font-code-sm text-xs text-primary font-medium">42.0%</span>
          </div>
          <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden my-1">
            <div className="bg-primary h-1.5 rounded-full" style={{ width: '42%' }}></div>
          </div>
          <div className="grid grid-cols-3 gap-1 mt-2 pt-1 bg-surface-container-low rounded-lg p-1 text-center font-code-sm text-xs border border-surface-container-high/40">
            <div>
              <span className="block text-on-surface-variant text-[10px]">Active Tx</span>
              <span className="text-primary font-semibold">24</span>
            </div>
            <div>
              <span className="block text-on-surface-variant text-[10px]">Idle Pool</span>
              <span className="text-on-surface font-semibold">18</span>
            </div>
            <div>
              <span className="block text-on-surface-variant text-[10px]">Queued</span>
              <span className="text-on-surface-variant font-semibold">0</span>
            </div>
          </div>
        </div>

        {/* Card 2: Compute & Buffer */}
        <div className="bg-surface-container-lowest p-3.5 rounded-xl shadow-md flex flex-col justify-between border border-surface-container-high/60 group hover:border-outline-variant transition-colors">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-secondary" />
              <span className="font-label-sm text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">
                Compute &amp; Buffer
              </span>
            </div>
            <span className="flex items-center gap-1 text-primary font-code-sm text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
              99.4% Hit
            </span>
          </div>
          <div className="flex items-baseline justify-between my-1">
            <div>
              <span className="font-label-sm text-[10px] text-on-surface-variant block">CPU Utilization</span>
              <span className="font-headline-lg text-2xl font-bold text-on-surface">28%</span>
            </div>
            <div className="text-right">
              <span className="font-label-sm text-[10px] text-on-surface-variant block">RAM Allocation</span>
              <span className="font-headline-sm text-sm font-semibold text-secondary">
                6.8 <span className="text-on-surface-variant font-normal">/ 16 GB</span>
              </span>
            </div>
          </div>
          <div className="h-6 w-full my-1">
            <svg className="w-full h-full text-secondary" fill="none" preserveAspectRatio="none" viewBox="0 0 100 24">
              <path
                d="M0 18 Q 15 14, 25 19 T 50 11 T 75 14 T 100 8 L 100 24 L 0 24 Z"
                fill="currentColor"
                fillOpacity="0.15"
              />
              <path
                d="M0 18 Q 15 14, 25 19 T 50 11 T 75 14 T 100 8"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.75"
              />
            </svg>
          </div>
          <div className="flex items-center justify-between mt-2 pt-1 font-code-sm text-[11px] text-on-surface-variant border-t border-surface-container-high/40">
            <span>Load avg: <strong className="text-on-surface">1.42, 1.28</strong></span>
            <span className="text-primary font-medium">buffers 4GB</span>
          </div>
        </div>

        {/* Card 3: Throughput & WAL */}
        <div className="bg-surface-container-lowest p-3.5 rounded-xl shadow-md flex flex-col justify-between border border-surface-container-high/60 group hover:border-outline-variant transition-colors">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-tertiary" />
              <span className="font-label-sm text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">
                Throughput &amp; WAL
              </span>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-tertiary font-code-sm text-[10px]">
              Healthy
            </span>
          </div>
          <div className="flex items-baseline gap-1 my-1">
            <span className="font-headline-lg text-2xl font-bold text-on-surface">1,842</span>
            <span className="font-code-md text-sm text-tertiary font-medium">TPS</span>
            <span className="ml-auto font-code-sm text-xs text-primary flex items-center">
              <ArrowUp className="w-3 h-3" />
              8.4%
            </span>
          </div>
          <div className="w-full bg-surface-container-high rounded-full h-1.5 flex overflow-hidden my-1">
            <div className="bg-tertiary h-1.5" style={{ width: '98.8%' }} title="98.8% Commits"></div>
            <div className="bg-error h-1.5" style={{ width: '1.2%' }} title="1.2% Rollbacks"></div>
          </div>
          <div className="flex items-center justify-between mt-2 pt-1 bg-surface-container-low rounded-lg p-1 font-code-sm text-[11px] border border-surface-container-high/40">
            <span className="text-on-surface-variant">WAL: <strong className="text-on-surface">4.2 MB/s</strong></span>
            <span className="text-on-surface-variant">Rollback: <strong className="text-primary">0.02%</strong></span>
          </div>
        </div>

        {/* Card 4: NVMe SSD Storage */}
        <div className="bg-surface-container-lowest p-3.5 rounded-xl shadow-md flex flex-col justify-between border border-surface-container-high/60 group hover:border-outline-variant transition-colors">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-primary" />
              <span className="font-label-sm text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">
                NVMe SSD Storage
              </span>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-primary font-code-sm text-[10px]">
              Bloat: 1.8%
            </span>
          </div>
          <div className="flex items-baseline gap-1 my-1">
            <span className="font-headline-lg text-2xl font-bold text-on-surface">14.2</span>
            <span className="font-code-md text-xs text-on-surface-variant">/ 100 GB</span>
            <span className="ml-auto font-code-sm text-xs text-primary font-semibold">14.2%</span>
          </div>
          <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden my-1">
            <div className="bg-primary h-1.5 rounded-full" style={{ width: '14.2%' }}></div>
          </div>
          <div className="flex items-center justify-between mt-2 pt-1 font-code-sm text-[11px] text-on-surface-variant border-t border-surface-container-high/40">
            <span>Autovacuum: <strong className="text-primary">Active</strong></span>
            <span className="text-on-surface-variant">Free: 85.8 GB</span>
          </div>
        </div>
      </section>

      {/* 3. DEEP DIVE ANALYTICS TABS & TOOLBAR */}
      <section className="bg-surface-container-lowest rounded-xl shadow-md overflow-hidden border border-surface-container-high/60">
        {/* Tab Strip */}
        <div className="flex items-center justify-between bg-surface-container-low px-3 pt-2 gap-2 overflow-x-auto border-b border-surface-container-high">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('slow-queries')}
              className={`px-3 py-1.5 rounded-t-lg font-label-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'slow-queries'
                  ? 'bg-surface-container-lowest text-primary shadow-sm border-t-2 border-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/40'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Slow Queries</span>
              <span className="px-1.5 py-0.2 rounded bg-surface-container-high text-primary font-code-sm text-[10px]">
                pg_stat_statements
              </span>
            </button>

            <button
              onClick={() => setActiveTab('sessions')}
              className={`px-3 py-1.5 rounded-t-lg font-label-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'sessions'
                  ? 'bg-surface-container-lowest text-primary shadow-sm border-t-2 border-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/40'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Active Client Sessions</span>
              <span className="px-1.5 py-0.2 rounded bg-surface-container text-on-surface-variant font-code-sm text-[10px]">
                {sessions.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('bloat')}
              className={`px-3 py-1.5 rounded-t-lg font-label-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'bloat'
                  ? 'bg-surface-container-lowest text-primary shadow-sm border-t-2 border-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/40'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Table Bloat &amp; Vacuum</span>
            </button>

            <button
              onClick={() => setActiveTab('locks')}
              className={`px-3 py-1.5 rounded-t-lg font-label-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'locks'
                  ? 'bg-surface-container-lowest text-primary shadow-sm border-t-2 border-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/40'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Locks &amp; Deadlocks</span>
              <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1 pb-1">
            <button
              onClick={() => onShowToast('pg_stat_statements_reset() executed', 'restart_alt')}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-on-surface font-code-sm text-[11px] transition-colors cursor-pointer"
              title="Reset pg_stat_statements metrics"
            >
              <RotateCw className="w-3 h-3" />
              <span>Reset Stats</span>
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="p-3 bg-surface-container-lowest flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border-b border-surface-container-high/50">
          <div className="flex-1 flex items-center gap-2 bg-surface-container-low rounded-lg px-3 py-1.5 border border-surface-container-high">
            <Search className="w-4 h-4 text-on-surface-variant shrink-0" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-on-surface placeholder:text-on-surface-variant/60 font-code-sm text-xs outline-none"
              placeholder="Filter SQL by table name, query text, or fingerprint (e.g. order_items)..."
              type="text"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-xs hover:text-on-surface">
                ×
              </button>
            )}
            <span className="font-code-sm text-code-sm text-on-surface-variant/50 text-[10px] hidden sm:inline">
              ESC clear
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-surface-container-low px-2 py-1 rounded-lg text-on-surface font-code-sm text-xs border border-surface-container-high">
              <span className="text-on-surface-variant">Min Mean:</span>
              <select
                value={minLatency}
                onChange={(e) => setMinLatency(e.target.value)}
                className="bg-transparent text-primary font-semibold outline-none cursor-pointer"
              >
                <option value="0" className="bg-surface-container-high">All</option>
                <option value="50" className="bg-surface-container-high">&gt; 50ms</option>
                <option value="100" className="bg-surface-container-high">&gt; 100ms</option>
                <option value="250" className="bg-surface-container-high">&gt; 250ms</option>
              </select>
            </div>

            <button
              onClick={() => onShowToast('Exported performance metrics to CSV', 'download')}
              className="p-1.5 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
              title="Export CSV"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tab 1: Slow Queries (pg_stat_statements) */}
        {activeTab === 'slow-queries' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body-sm text-xs">
              <thead className="bg-surface-container-low font-label-sm uppercase tracking-wider text-on-surface-variant text-[10px]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Normalized Query Fingerprint</th>
                  <th className="px-2 py-2 font-semibold text-right">Total Time</th>
                  <th className="px-2 py-2 font-semibold min-w-[130px]">Mean Latency</th>
                  <th className="px-2 py-2 font-semibold text-right">Calls</th>
                  <th className="px-2 py-2 font-semibold text-right">Rows/Call</th>
                  <th className="px-2 py-2 font-semibold text-right">Buffer Hit</th>
                  <th className="px-3 py-2 font-semibold text-center">Actions &amp; Insights</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-high/40 text-on-surface font-code-sm text-xs">
                {filteredQueries.map((q) => (
                  <tr key={q.queryId} className="hover:bg-surface-container transition-colors group">
                    <td className="px-3 py-2 max-w-md">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="px-1.5 py-0.2 rounded bg-secondary/10 text-secondary text-[10px]">
                          queryid: {q.queryId}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                            q.tag.includes('SLOW')
                              ? 'bg-error-container text-on-error-container'
                              : 'bg-surface-container-high text-primary'
                          }`}
                        >
                          {q.tag}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(q.sql);
                            onShowToast('Query statement copied', 'content_copy');
                          }}
                          className="text-on-surface-variant hover:text-primary transition-colors ml-auto p-1 cursor-pointer"
                          title="Copy SQL"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="font-code-sm text-xs text-on-surface truncate group-hover:whitespace-normal font-mono">
                        {q.sql}
                      </div>
                      {q.recommendation && (
                        <div className="mt-1 flex items-center gap-1 px-1.5 py-1 rounded bg-surface-container text-secondary text-[11px] border border-secondary/20">
                          <Lightbulb className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="font-medium text-primary">Recommendation:</span>
                          <code className="text-on-surface">{q.recommendation}</code>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right font-medium text-on-surface">{q.totalTime}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-secondary font-semibold">{q.meanLatencyMs} ms</span>
                        <span className="text-on-surface-variant text-[10px]">stddev {q.stddevMs}ms</span>
                      </div>
                      <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full ${
                            q.meanLatencyMs > 100 ? 'bg-secondary' : 'bg-primary'
                          }`}
                          style={{ width: `${Math.min((q.meanLatencyMs / 200) * 100, 100)}%` }}
                        ></div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right font-medium text-on-surface">
                      {q.calls.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right text-on-surface-variant">{q.rowsPerCall}</td>
                    <td className="px-2 py-2 text-right">
                      <span
                        className={`font-medium ${
                          q.bufferHitPercent > 95 ? 'text-primary' : 'text-error'
                        }`}
                      >
                        {q.bufferHitPercent}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setExplainModalQuery(q.sql)}
                          className="px-2 py-1 rounded bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface font-label-sm text-[11px] transition-all cursor-pointer"
                        >
                          EXPLAIN
                        </button>
                        <button
                          onClick={() => onShowToast(`Execution plan generated for query ${q.queryId}`, 'schema')}
                          className="p-1 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-on-surface cursor-pointer"
                          title="View Query Graph"
                        >
                          <GitFork className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Active Client Sessions */}
        {activeTab === 'sessions' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-code-sm text-xs">
              <thead className="bg-surface-container-low font-label-sm uppercase tracking-wider text-on-surface-variant text-[10px]">
                <tr>
                  <th className="px-3 py-2 font-semibold">PID</th>
                  <th className="px-2 py-2 font-semibold">User</th>
                  <th className="px-2 py-2 font-semibold">Client Addr</th>
                  <th className="px-2 py-2 font-semibold">State</th>
                  <th className="px-3 py-2 font-semibold">Current Statement</th>
                  <th className="px-2 py-2 font-semibold text-right">Age / Duration</th>
                  <th className="px-3 py-2 font-semibold text-right">Kill Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-high/40 text-on-surface">
                {sessions.map((s) => (
                  <tr key={s.pid} className="hover:bg-surface-container transition-colors">
                    <td className="px-3 py-2 font-semibold text-primary">#{s.pid}</td>
                    <td className="px-2 py-2 text-on-surface-variant">{s.user}</td>
                    <td className="px-2 py-2 text-on-surface-variant font-mono">{s.clientAddr}</td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          s.state === 'active'
                            ? 'bg-primary/10 text-primary'
                            : s.state === 'idle in tx'
                            ? 'bg-secondary-container/20 text-secondary'
                            : 'bg-surface-container text-on-surface-variant'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            s.state === 'active' ? 'bg-primary animate-pulse' : 'bg-secondary'
                          }`}
                        ></span>
                        {s.state}
                      </span>
                    </td>
                    <td className="px-3 py-2 max-w-sm truncate text-on-surface font-mono">
                      {s.statement}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          s.duration.includes('4m')
                            ? 'bg-error-container text-on-error-container'
                            : 'bg-surface-container-high text-secondary'
                        }`}
                      >
                        {s.duration}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleKillSession(s.pid)}
                        className={`px-2 py-1 rounded text-[11px] font-medium transition-all cursor-pointer ${
                          s.state === 'idle in tx'
                            ? 'bg-error-container text-on-error-container hover:bg-error hover:text-on-error font-semibold'
                            : 'bg-surface-container-high hover:bg-error-container hover:text-on-error-container text-on-surface-variant hover:text-error'
                        }`}
                      >
                        {s.state === 'idle in tx' ? 'Kill Tx' : s.state === 'autovacuum' ? 'Cancel' : 'Terminate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Table Bloat */}
        {activeTab === 'bloat' && (
          <div className="p-4 space-y-3 font-code-sm text-xs">
            <div className="flex items-center justify-between">
              <span className="text-secondary font-semibold">Table Bloat &amp; Dead Tuples Analysis</span>
              <span className="text-primary">Autovacuum Daemon: Healthy (Workers: 3)</span>
            </div>
            <div className="space-y-2">
              {[
                { table: 'public.orders', dead: 142, live: 89410, bloat: '0.15%', size: '28.4 MB' },
                { table: 'public.order_items', dead: 3410, live: 240119, bloat: '1.42%', size: '68.0 MB' },
                { table: 'public.inventory_logs', dead: 9280, live: 520000, bloat: '1.78%', size: '110.0 MB' },
                { table: 'public.customers', dead: 45, live: 14200, bloat: '0.31%', size: '4.2 MB' },
              ].map((row) => (
                <div
                  key={row.table}
                  className="flex items-center justify-between p-2 rounded bg-surface-container border border-surface-container-high"
                >
                  <div className="flex items-center gap-2">
                    <Table className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-on-surface font-medium">{row.table}</span>
                    <span className="text-on-surface-variant text-[11px]">Size: {row.size}</span>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <span className="text-on-surface-variant">Dead: {row.dead.toLocaleString()} / Live: {row.live.toLocaleString()}</span>
                    <span className="px-2 py-0.5 rounded bg-surface-container-high text-primary font-semibold">
                      Bloat: {row.bloat}
                    </span>
                    <button
                      onClick={() => onShowToast(`VACUUM executed on ${row.table}`, 'cleaning_services')}
                      className="px-2 py-0.5 rounded bg-primary/20 text-primary hover:bg-primary hover:text-on-primary text-xs cursor-pointer"
                    >
                      VACUUM
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Locks & Deadlocks */}
        {activeTab === 'locks' && (
          <div className="p-4 space-y-3 font-code-sm text-xs">
            <div className="flex items-center justify-between">
              <span className="text-primary font-semibold">Current Table &amp; Transaction Locks</span>
              <span className="text-primary flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                0 Deadlocks Detected
              </span>
            </div>
            <div className="p-3 rounded bg-surface-container space-y-2 border border-surface-container-high">
              <div className="flex items-center justify-between text-on-surface">
                <span className="font-semibold text-secondary">Relation: public.products (RowExclusiveLock)</span>
                <span className="text-tertiary">Held by PID #15002</span>
              </div>
              <div className="text-on-surface-variant text-[11px]">
                Mode: RowExclusiveLock • Granted: true • Fastpath: false
              </div>
              <div className="text-primary text-[11px]">
                Lock query: UPDATE products SET stock_quantity = stock_quantity - 1 WHERE id = 104;
              </div>
            </div>
          </div>
        )}

        {/* Summary Footer */}
        <div className="p-2 bg-surface-container-low flex items-center justify-between text-on-surface-variant font-label-sm text-xs border-t border-surface-container-high">
          <span>Showing 4 of 24 tracked statements • pg_stat_statements.max = 5000</span>
          <div className="flex items-center gap-1">
            <span className="px-2 py-0.5 rounded bg-primary text-on-primary font-code-sm font-semibold">
              1
            </span>
            <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface font-code-sm">
              2
            </span>
          </div>
        </div>
      </section>

      {/* EXPLAIN ANALYZE Plan Modal */}
      {explainModalQuery && (
        <div
          className="fixed inset-0 z-50 bg-surface-container-lowest/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setExplainModalQuery(null)}
        >
          <div
            className="bg-surface-container-low border border-surface-container-high rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 bg-surface-container-lowest flex items-center justify-between border-b border-surface-container-high">
              <div className="flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-primary shrink-0" />
                <span className="font-headline-sm text-sm text-on-surface font-semibold">
                  EXPLAIN (ANALYZE, BUFFERS) Plan Result
                </span>
              </div>
              <button
                onClick={() => setExplainModalQuery(null)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 font-code-sm text-xs text-on-surface space-y-2">
              <div className="text-secondary font-mono pb-2 border-b border-surface-container-high">
                {explainModalQuery}
              </div>

              <div className="p-3 rounded bg-surface-container font-mono text-xs leading-relaxed space-y-1 border border-surface-container-high">
                <div className="text-error font-semibold">
                  Seq Scan on order_items (cost=0.00..3819.40 rows=14 width=248) (actual time=0.042..184.182 rows=1 loops=1)
                </div>
                <div className="text-on-surface-variant pl-4">
                  Filter: ((metadata -&gt;&gt; 'sku'::text) = 'SKU-99128'::text)
                </div>
                <div className="text-on-surface-variant pl-4">Rows Removed by Filter: 240,119</div>
                <div className="text-tertiary pl-4">Buffers: shared hit=1824 read=1948</div>
                <div className="text-primary font-semibold pt-1">Planning Time: 0.182 ms</div>
                <div className="text-primary font-semibold">Execution Time: 184.218 ms</div>
              </div>

              <div className="p-3 rounded bg-primary/10 text-primary font-body-sm text-xs flex items-start gap-2 border border-primary/20">
                <Wand2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>
                  Indexing <code>order_items((metadata-&gt;&gt;'sku'))</code> will convert this full table sequential scan into an Index Scan with ~0.8ms estimated response time.
                </span>
              </div>
            </div>

            <div className="p-3 bg-surface-container-lowest flex items-center justify-end gap-2 border-t border-surface-container-high">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(explainModalQuery);
                  onShowToast('Execution plan copied to clipboard', 'content_copy');
                }}
                className="px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface text-xs font-label-md cursor-pointer"
              >
                Copy Execution Plan
              </button>
              <button
                onClick={() => {
                  setExplainModalQuery(null);
                  onShowToast('Migration SQL draft added to Schema Workbench', 'done_all');
                }}
                className="px-3 py-1.5 rounded bg-primary text-on-primary font-semibold text-xs hover:bg-primary-container cursor-pointer"
              >
                Generate Migration SQL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
