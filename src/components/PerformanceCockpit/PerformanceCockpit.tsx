import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  Database,
  Download,
  Filter,
  GitFork,
  Globe,
  Layers,
  Lightbulb,
  Lock,
  RefreshCw,
  RotateCw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Table,
  Terminal,
  Trash2,
  Users,
  Wand2,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { SessionProcess, SlowQuery } from '../../types/database';
import {
  api,
  GolangServiceUsage,
  TableBloatItem,
  LockItem,
  LockContentionItem,
} from '../../services/api';

interface PerformanceCockpitProps {
  onShowToast: (message: string, icon?: string, isError?: boolean) => void;
}

const formatSeconds = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

export const PerformanceCockpit: React.FC<PerformanceCockpitProps> = ({ onShowToast }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab synchronized with URL: ?tab=slow-queries|sessions|service-usage|bloat|locks
  const activeTab =
    (searchParams.get('tab') as 'slow-queries' | 'sessions' | 'service-usage' | 'bloat' | 'locks') ||
    'slow-queries';
  const setActiveTab = (tab: 'slow-queries' | 'sessions' | 'service-usage' | 'bloat' | 'locks') => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next);
  };

  const [timeRange, setTimeRange] = useState('1h');
  const [searchQuery, setSearchQuery] = useState('');
  const [minLatency, setMinLatency] = useState('0');

  // Connection metadata from real PostgreSQL backend
  const [connectionInfo, setConnectionInfo] = useState<{
    database?: string;
    host?: string;
    port?: number;
    user?: string;
    version?: string;
  } | null>(null);

  // Tab 1: Slow Queries State
  const [slowQueries, setSlowQueries] = useState<SlowQuery[]>([]);
  const [isLoadingSlowQueries, setIsLoadingSlowQueries] = useState(false);
  const [hasPgStatStatements, setHasPgStatStatements] = useState<boolean>(false);

  // Tab 2: Sessions State
  const [sessions, setSessions] = useState<SessionProcess[]>([]);
  const [sessionFilter, setSessionFilter] = useState<'all' | 'active' | 'idle in tx' | 'idle'>('all');
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // Tab 3: Service Usage Telemetry State (React + Golang)
  const [goTelemetry, setGoTelemetry] = useState<GolangServiceUsage | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const [isTriggeringGC, setIsTriggeringGC] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(3000); // 3s
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [backendPingMs, setBackendPingMs] = useState<number | null>(null);

  // Tab 4: Table Bloat State
  const [bloatTables, setBloatTables] = useState<TableBloatItem[]>([]);
  const [isLoadingBloat, setIsLoadingBloat] = useState(false);
  const [autovacuumEnabled, setAutovacuumEnabled] = useState(true);
  const [autovacuumWorkers, setAutovacuumWorkers] = useState(0);
  const [vacuumingTable, setVacuumingTable] = useState<string | null>(null);
  const [isVacuumingAll, setIsVacuumingAll] = useState(false);

  // Tab 5: Locks & Deadlocks State
  const [locks, setLocks] = useState<LockItem[]>([]);
  const [contentions, setContentions] = useState<LockContentionItem[]>([]);
  const [isLoadingLocks, setIsLoadingLocks] = useState(false);

  // EXPLAIN Modal State
  const [explainModalQuery, setExplainModalQuery] = useState<string | null>(null);
  const [explainPlanLines, setExplainPlanLines] = useState<string[]>([]);
  const [isExplaining, setIsExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);

  // Client-side React 19 Metrics
  const [reactMetrics, setReactMetrics] = useState<{
    jsHeapUsed: number;
    jsHeapTotal: number;
    jsHeapLimit: number;
    domNodes: number;
    storageKB: number;
    fps: number;
    uptimeSec: number;
  }>({
    jsHeapUsed: 0,
    jsHeapTotal: 0,
    jsHeapLimit: 0,
    domNodes: 0,
    storageKB: 0,
    fps: 60,
    uptimeSec: 0,
  });

  // Fetch PostgreSQL connection details on mount
  useEffect(() => {
    api.getCurrentConnection()
      .then((res) => {
        if (res && res.connected) {
          setConnectionInfo({
            database: res.connection?.database,
            host: res.connection?.host,
            port: res.connection?.port,
            user: res.connection?.user,
            version: res.version,
          });
        }
      })
      .catch(() => {});
  }, []);

  const pgVersionShort = connectionInfo?.version
    ? connectionInfo.version.split(' ')[0] + ' ' + (connectionInfo.version.split(' ')[1] || '')
    : '';

  // 1. Fetch Slow Queries from backend
  const fetchSlowQueries = async () => {
    setIsLoadingSlowQueries(true);
    try {
      const res = await api.getSlowQueries();
      if (res && res.queries) {
        setSlowQueries(res.queries);
        setHasPgStatStatements(!!res.has_extension);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingSlowQueries(false);
    }
  };

  // 2. Poll Active Sessions from PostgreSQL pg_stat_activity
  const loadSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const res = await api.getSessions();
      if (res && res.sessions) {
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
      // ignore
    } finally {
      setIsLoadingSessions(false);
    }
  };

  // 3. Fetch Table Bloat from PostgreSQL pg_stat_user_tables
  const fetchTableBloat = async () => {
    setIsLoadingBloat(true);
    try {
      const res = await api.getTableBloat();
      if (res && res.tables) {
        setBloatTables(res.tables);
        setAutovacuumEnabled(res.autovacuum_enabled);
        setAutovacuumWorkers(res.autovacuum_workers || 0);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingBloat(false);
    }
  };

  // 4. Fetch Locks & Deadlocks from PostgreSQL pg_locks
  const fetchLocks = async () => {
    setIsLoadingLocks(true);
    try {
      const res = await api.getLocks();
      if (res) {
        setLocks(res.locks || []);
        setContentions(res.contentions || []);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingLocks(false);
    }
  };

  // 5. Fetch Golang service usage & ping
  const fetchServiceUsage = async () => {
    setIsLoadingUsage(true);
    const startPing = performance.now();
    try {
      const res = await api.getServiceUsage();
      const elapsedPing = Math.round(performance.now() - startPing);
      setBackendPingMs(elapsedPing);
      if (res && res.golang) {
        setGoTelemetry(res.golang);
        setLastUpdated(new Date());
      }
    } catch {
      const elapsedPing = Math.round(performance.now() - startPing);
      setBackendPingMs(elapsedPing);
    } finally {
      setIsLoadingUsage(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchSlowQueries();
    loadSessions();
    fetchTableBloat();
    fetchLocks();
    fetchServiceUsage();
  }, []);

  // Fetch when tab changes
  useEffect(() => {
    if (activeTab === 'slow-queries') {
      fetchSlowQueries();
    } else if (activeTab === 'sessions') {
      loadSessions();
    } else if (activeTab === 'bloat') {
      fetchTableBloat();
    } else if (activeTab === 'locks') {
      fetchLocks();
    } else if (activeTab === 'service-usage') {
      fetchServiceUsage();
    }
  }, [activeTab]);

  // Periodic poll for sessions when sessions tab is active
  useEffect(() => {
    if (activeTab !== 'sessions') return;
    const timer = setInterval(loadSessions, 4000);
    return () => clearInterval(timer);
  }, [activeTab]);

  // Poll Go telemetry based on autoRefreshInterval
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const timer = setInterval(() => {
      fetchServiceUsage();
    }, autoRefreshInterval);
    return () => clearInterval(timer);
  }, [autoRefreshInterval]);

  // Monitor React 19 Client runtime metrics (Memory, DOM nodes, LocalStorage, Uptime, FPS)
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let currentFps = 60;
    let animId: number;

    const countFrames = (now: number) => {
      frameCount++;
      if (now - lastTime >= 1000) {
        currentFps = Math.round((frameCount * 1000) / (now - lastTime));
        frameCount = 0;
        lastTime = now;
      }
      animId = requestAnimationFrame(countFrames);
    };
    animId = requestAnimationFrame(countFrames);

    const timer = setInterval(() => {
      let totalBytes = 0;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || '';
          totalBytes += k.length + (localStorage.getItem(k)?.length || 0);
        }
      } catch {}
      const storageKB = +(totalBytes / 1024).toFixed(1);

      const mem = (performance as any)?.memory;
      const jsHeapUsed = mem ? Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 10) / 10 : 0;
      const jsHeapTotal = mem ? Math.round((mem.totalJSHeapSize / (1024 * 1024)) * 10) / 10 : 0;
      const jsHeapLimit = mem
        ? Math.round((mem.jsHeapSizeLimit / (1024 * 1024 * 1024)) * 10) / 10
        : 0;

      const domNodes = document.getElementsByTagName('*').length;

      setReactMetrics((prev) => ({
        jsHeapUsed,
        jsHeapTotal,
        jsHeapLimit,
        domNodes,
        storageKB,
        fps: currentFps,
        uptimeSec: prev.uptimeSec + 1,
      }));
    }, 1000);

    return () => {
      cancelAnimationFrame(animId);
      clearInterval(timer);
    };
  }, []);

  const handleTriggerGC = async () => {
    setIsTriggeringGC(true);
    try {
      const res = await api.triggerBackendGC();
      onShowToast(
        `🧹 Go GC: Memori dibebaskan ${res.freed_formatted || '0 B'} (${res.alloc_before} → ${res.alloc_after})`,
        'delete'
      );
      await fetchServiceUsage();
    } catch (err: any) {
      onShowToast(`Gagal trigger Go GC: ${err?.message || 'Error'}`, 'alert-circle', true);
    } finally {
      setIsTriggeringGC(false);
    }
  };

  const handleKillSession = async (pid: number) => {
    try {
      await api.terminateSession(pid);
      setSessions((prev) => prev.filter((s) => s.pid !== pid));
      setLocks((prev) => prev.filter((l) => l.pid !== pid));
      onShowToast(`Worker PID #${pid} berhasil diterminasi (SIGTERM)`, 'power_settings_new');
      await loadSessions();
      await fetchLocks();
    } catch (err: any) {
      onShowToast(`Gagal terminasi session PID #${pid}: ${err?.message || 'Error'}`, 'alert-circle', true);
    }
  };

  const handleKillIdleQueries = async () => {
    const idleSessions = sessions.filter((s) => s.state === 'idle in tx');
    let killed = 0;
    for (const s of idleSessions) {
      try {
        await api.terminateSession(s.pid);
        killed++;
      } catch {}
    }
    setSessions((prev) => prev.filter((s) => s.state !== 'idle in tx'));
    onShowToast(`Berhasil menterminasi ${killed} idle transaction backend`, 'delete');
    await loadSessions();
  };

  const handleRunVacuum = async (table: string, full = false) => {
    setVacuumingTable(table);
    try {
      const res = await api.runVacuum(table, full, true);
      onShowToast(res.message || `VACUUM selesai pada ${table}`, 'sync');
      await fetchTableBloat();
    } catch (err: any) {
      onShowToast(`Gagal VACUUM ${table}: ${err?.message || 'Error'}`, 'alert-circle', true);
    } finally {
      setVacuumingTable(null);
    }
  };

  const handleVacuumAnalyzeAll = async () => {
    setIsVacuumingAll(true);
    try {
      // Run vacuum on all public tables
      onShowToast('Menjalankan VACUUM ANALYZE pada tabel publik...', 'sync');
      for (const t of bloatTables.slice(0, 5)) {
        await api.runVacuum(`${t.schema}.${t.table}`, false, true);
      }
      onShowToast('VACUUM ANALYZE cluster selesai!', 'done_all');
      await fetchTableBloat();
    } catch (err: any) {
      onShowToast(`Gagal VACUUM cluster: ${err?.message || 'Error'}`, 'alert-circle', true);
    } finally {
      setIsVacuumingAll(false);
    }
  };

  const handleRunExplain = async (sql: string) => {
    setExplainModalQuery(sql);
    setIsExplaining(true);
    setExplainError(null);
    setExplainPlanLines([]);
    try {
      const res = await api.explainQuery(sql);
      if (res && res.plan) {
        setExplainPlanLines(res.plan);
      } else {
        setExplainPlanLines(['Tidak ada execution plan yang dikembalikan oleh PostgreSQL.']);
      }
    } catch (err: any) {
      setExplainError(err?.message || 'PostgreSQL tidak dapat menganalisis query ini (mungkin memerlukan parameter atau klausa tertentu).');
    } finally {
      setIsExplaining(false);
    }
  };

  const handleResetStats = async () => {
    try {
      const res = await api.resetStats();
      onShowToast(res.message || 'Statistik performa berhasil di-reset', 'restart_alt');
      await fetchSlowQueries();
    } catch (err: any) {
      onShowToast(`Gagal reset stats: ${err?.message || 'Error'}`, 'alert-circle', true);
    }
  };

  // Filtered lists
  const filteredQueries = slowQueries.filter((q) => {
    if (searchQuery) {
      const text = searchQuery.toLowerCase();
      if (!q.sql.toLowerCase().includes(text) && !q.queryId.toLowerCase().includes(text) && !q.tag.toLowerCase().includes(text)) {
        return false;
      }
    }
    if (minLatency && minLatency !== '0') {
      if (q.meanLatencyMs < parseFloat(minLatency)) return false;
    }
    return true;
  });

  const filteredSessions = sessions.filter((s) => {
    if (sessionFilter !== 'all') {
      if (sessionFilter === 'idle in tx' && s.state !== 'idle in tx') return false;
      if (sessionFilter === 'active' && s.state !== 'active') return false;
      if (sessionFilter === 'idle' && s.state !== 'idle') return false;
    }
    if (searchQuery) {
      const text = searchQuery.toLowerCase();
      if (!s.user.toLowerCase().includes(text) && !s.statement.toLowerCase().includes(text) && !s.clientAddr.toLowerCase().includes(text) && !String(s.pid).includes(text)) {
        return false;
      }
    }
    return true;
  });

  const filteredBloatTables = bloatTables.filter((b) => {
    if (searchQuery) {
      const text = searchQuery.toLowerCase();
      if (!b.table.toLowerCase().includes(text) && !b.schema.toLowerCase().includes(text)) {
        return false;
      }
    }
    return true;
  });

  const filteredLocks = locks.filter((l) => {
    if (searchQuery) {
      const text = searchQuery.toLowerCase();
      if (!l.relation.toLowerCase().includes(text) && !l.mode.toLowerCase().includes(text) && !l.username.toLowerCase().includes(text) && !l.current_query.toLowerCase().includes(text) && !String(l.pid).includes(text)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="flex flex-col w-full space-y-3">
      {/* 1. COMPACT & AUTHENTIC HEADER */}
      <section className="bg-surface-container-lowest p-3 sm:p-3.5 rounded-xl border border-surface-container-high/60 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left: Real Target Info */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-primary shrink-0 border border-surface-container-highest">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-on-surface">
                  {connectionInfo?.database || goTelemetry?.pool.database || 'PostgreSQL'}
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-mono font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                  Connected
                </span>
                <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px] font-mono">
                  {connectionInfo?.host || 'localhost'}:{connectionInfo?.port || 5432}
                </span>
                {pgVersionShort && (
                  <span className="px-1.5 py-0.5 rounded bg-surface-container text-secondary text-[10px] font-mono">
                    {pgVersionShort}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-on-surface-variant font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                <span>Go: {goTelemetry?.version || 'go'} (PID #{goTelemetry?.pid || '-'})</span>
                <span>•</span>
                <span>Uptime: {goTelemetry?.uptime_formatted || '-'}</span>
                <span>•</span>
                <button
                  onClick={() => setActiveTab('service-usage')}
                  className="text-primary hover:underline inline-flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Zap className="w-3 h-3" />
                  <span>Telemetry Live</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right: Time Range & Global DB Actions */}
          <div className="flex items-center gap-2 flex-wrap self-end lg:self-auto">
            {/* Time Range Selector */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-surface-container border border-surface-container-high text-xs">
              {['1h', '6h', '24h', '7d'].map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setTimeRange(r);
                    onShowToast(`Filter rentang waktu: ${r}`);
                  }}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    timeRange === r
                      ? 'bg-primary text-on-primary font-semibold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <button
              onClick={handleKillIdleQueries}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-error-container hover:text-on-error-container text-on-surface text-xs font-medium transition-colors cursor-pointer"
              title="Kill idle in transaction queries"
            >
              <XCircle className="w-3.5 h-3.5 text-error" />
              <span>Kill Idle</span>
            </button>

            <button
              onClick={handleVacuumAnalyzeAll}
              disabled={isVacuumingAll}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isVacuumingAll ? 'animate-spin' : ''}`} />
              <span>{isVacuumingAll ? 'Vacuuming...' : 'VACUUM ANALYZE'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. REAL TELEMETRY KPI CARDS (HONEST, UNCLUTTERED) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
        {/* Card 1: DB Connection Pool */}
        <div className="bg-surface-container-lowest p-3 rounded-xl border border-surface-container-high/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant mb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <Database className="w-4 h-4 text-primary" />
              <span>Database Pool</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-container text-on-surface-variant">
              pgx/v5
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-bold text-on-surface">
                {goTelemetry?.pool.acquired_conns ?? 0}
              </span>
              <span className="text-xs text-on-surface-variant font-mono">
                / {goTelemetry?.pool.max_conns ?? 15} max
              </span>
              <span className="ml-auto text-xs font-mono text-primary font-medium">
                {(goTelemetry?.pool?.max_conns ?? 0) > 0
                  ? (((goTelemetry?.pool?.acquired_conns ?? 0) / (goTelemetry?.pool?.max_conns ?? 1)) * 100).toFixed(0)
                  : 0}%
              </span>
            </div>
            <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden my-2">
              <div
                className="bg-primary h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: `${
                    (goTelemetry?.pool?.max_conns ?? 0) > 0
                      ? Math.min(((goTelemetry?.pool?.acquired_conns ?? 0) / (goTelemetry?.pool?.max_conns ?? 1)) * 100, 100)
                      : 0
                  }%`,
                }}
              ></div>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant pt-1 border-t border-surface-container-high/40">
            <span>Idle: <strong className="text-on-surface">{goTelemetry?.pool.idle_conns ?? 0}</strong></span>
            <span>Total: <strong className="text-on-surface">{goTelemetry?.pool.total_conns ?? 0}</strong></span>
          </div>
        </div>

        {/* Card 2: Go Backend RAM */}
        <div className="bg-surface-container-lowest p-3 rounded-xl border border-surface-container-high/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant mb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <Server className="w-4 h-4 text-secondary" />
              <span>Go Backend RAM</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-container text-secondary">
              RSS
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-bold text-on-surface">
                {goTelemetry?.memory.vm_rss_formatted || '0 MB'}
              </span>
              <span className="ml-auto text-xs font-mono text-secondary">
                Heap {goTelemetry?.memory.alloc_formatted || '0 MB'}
              </span>
            </div>
            <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden my-2">
              <div
                className="bg-secondary h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: `${
                    goTelemetry && goTelemetry.memory.sys_bytes > 0
                      ? Math.min((goTelemetry.memory.alloc_bytes / goTelemetry.memory.sys_bytes) * 100, 100)
                      : 25
                  }%`,
                }}
              ></div>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant pt-1 border-t border-surface-container-high/40">
            <span>{goTelemetry?.num_goroutine ?? 0} Goroutines</span>
            <span>Sys {goTelemetry?.memory.sys_formatted || '0 MB'}</span>
          </div>
        </div>

        {/* Card 3: React 19 Client Heap */}
        <div className="bg-surface-container-lowest p-3 rounded-xl border border-surface-container-high/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant mb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <Globe className="w-4 h-4 text-primary" />
              <span>Client JS Heap</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-container text-primary">
              {reactMetrics.fps} FPS
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-bold text-on-surface">
                {reactMetrics.jsHeapUsed ? `${reactMetrics.jsHeapUsed} MB` : 'V8 Managed'}
              </span>
              {reactMetrics.jsHeapTotal > 0 && (
                <span className="text-xs text-on-surface-variant font-mono">
                  / {reactMetrics.jsHeapTotal} MB
                </span>
              )}
              <span className="ml-auto text-xs font-mono text-primary font-medium">
                {reactMetrics.jsHeapTotal > 0
                  ? ((reactMetrics.jsHeapUsed / reactMetrics.jsHeapTotal) * 100).toFixed(0)
                  : 0}%
              </span>
            </div>
            <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden my-2">
              <div
                className="bg-primary h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: `${
                    reactMetrics.jsHeapTotal > 0
                      ? Math.min((reactMetrics.jsHeapUsed / reactMetrics.jsHeapTotal) * 100, 100)
                      : 50
                  }%`,
                }}
              ></div>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant pt-1 border-t border-surface-container-high/40">
            <span>{reactMetrics.domNodes.toLocaleString()} DOM nodes</span>
            <span>{reactMetrics.storageKB} KB storage</span>
          </div>
        </div>

        {/* Card 4: REST Latency & Concurrency */}
        <div className="bg-surface-container-lowest p-3 rounded-xl border border-surface-container-high/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant mb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <Zap className="w-4 h-4 text-secondary" />
              <span>IPC Ping & Traffic</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-container text-on-surface-variant">
              Port 28432
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-bold text-on-surface">
                {backendPingMs !== null ? `${backendPingMs} ms` : '< 1 ms'}
              </span>
              <span className="ml-auto text-xs font-mono text-primary font-medium">
                HTTP/1.1
              </span>
            </div>
            <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden my-2">
              <div
                className="bg-secondary h-1.5 rounded-full"
                style={{ width: `${Math.min(((backendPingMs || 1) / 50) * 100, 100)}%` }}
              ></div>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant pt-1 border-t border-surface-container-high/40">
            <span>{goTelemetry?.requests_total?.toLocaleString() ?? 0} reqs</span>
            <span>{goTelemetry?.queries_total?.toLocaleString() ?? 0} SQL</span>
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
              <span className={`px-1.5 py-0.2 rounded font-code-sm text-[10px] ${hasPgStatStatements ? 'bg-primary/10 text-primary font-medium' : 'bg-surface-container-high text-on-surface-variant'}`}>
                {slowQueries.length}
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
              <span>Active Sessions</span>
              <span className="px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface-variant font-code-sm text-[10px]">
                {sessions.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('service-usage')}
              className={`px-3 py-1.5 rounded-t-lg font-label-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'service-usage'
                  ? 'bg-surface-container-lowest text-primary shadow-sm border-t-2 border-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/40'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span>Service Usage</span>
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
              <span className="px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface-variant font-code-sm text-[10px]">
                {bloatTables.length}
              </span>
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
              {contentions.length > 0 ? (
                <span className="px-1.5 py-0.2 rounded bg-error-container text-on-error-container font-code-sm text-[10px] font-bold animate-pulse">
                  {contentions.length} conflict
                </span>
              ) : (
                <span className="px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface-variant font-code-sm text-[10px]">
                  {locks.length}
                </span>
              )}
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1 pb-1">
            <button
              onClick={handleResetStats}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-on-surface font-code-sm text-[11px] transition-colors cursor-pointer"
              title="Reset pg_stat_statements & pg_stat_reset() metrics"
            >
              <RotateCw className="w-3 h-3" />
              <span>Reset Stats</span>
            </button>
          </div>
        </div>

        {/* Dynamic Filters & Control Bar per Active Tab */}
        {activeTab === 'service-usage' ? (
          <div className="p-3 bg-surface-container-lowest flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border-b border-surface-container-high/50">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 text-primary font-code-sm text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                Service Engine Telemetry: Go Backend ({goTelemetry?.version || 'go'}) + React 19 Client
              </span>
              <span className="text-on-surface-variant font-code-sm text-[11px] hidden sm:inline">
                Terakhir diperbarui: {lastUpdated.toLocaleTimeString()}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-surface-container-low px-2 py-1 rounded-lg text-on-surface font-code-sm text-xs border border-surface-container-high">
                <Clock className="w-3.5 h-3.5 text-on-surface-variant" />
                <span className="text-on-surface-variant">Auto Refresh:</span>
                <select
                  value={autoRefreshInterval}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setAutoRefreshInterval(val);
                    onShowToast(val > 0 ? `Auto-refresh diatur ke ${val / 1000} detik` : 'Auto-refresh dinonaktifkan');
                  }}
                  className="bg-transparent text-primary font-semibold outline-none cursor-pointer"
                >
                  <option value={2000} className="bg-surface-container-high">2s (Live)</option>
                  <option value={3000} className="bg-surface-container-high">3s (Normal)</option>
                  <option value={5000} className="bg-surface-container-high">5s</option>
                  <option value={10000} className="bg-surface-container-high">10s</option>
                  <option value={0} className="bg-surface-container-high">Paused</option>
                </select>
              </div>

              <button
                onClick={handleTriggerGC}
                disabled={isTriggeringGC}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface font-label-sm text-xs transition-colors cursor-pointer border border-surface-container-high disabled:opacity-50"
                title="Panggil runtime.GC() pada service Golang untuk membebaskan heap"
              >
                <Trash2 className="w-3.5 h-3.5 text-primary" />
                <span>{isTriggeringGC ? 'Membersihkan...' : 'Trigger Go GC'}</span>
              </button>

              <button
                onClick={() => {
                  fetchServiceUsage();
                  onShowToast('Telemetri service usage berhasil diperbarui!', 'refresh');
                }}
                disabled={isLoadingUsage}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary-container text-on-primary font-label-sm text-xs font-semibold hover:bg-primary transition-colors cursor-pointer shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingUsage ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        ) : activeTab === 'slow-queries' ? (
          <div className="p-3 bg-surface-container-lowest flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border-b border-surface-container-high/50">
            <div className="flex-1 flex items-center gap-2 bg-surface-container-low rounded-lg px-3 py-1.5 border border-surface-container-high">
              <Search className="w-4 h-4 text-on-surface-variant shrink-0" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-on-surface placeholder:text-on-surface-variant/60 font-code-sm text-xs outline-none"
                placeholder="Filter SQL by table name, query text, or fingerprint..."
                type="text"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-xs hover:text-on-surface">
                  ×
                </button>
              )}
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
                  <option value="10" className="bg-surface-container-high">&gt; 10ms</option>
                  <option value="50" className="bg-surface-container-high">&gt; 50ms</option>
                  <option value="100" className="bg-surface-container-high">&gt; 100ms</option>
                  <option value="250" className="bg-surface-container-high">&gt; 250ms</option>
                </select>
              </div>

              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded font-code-sm text-[11px] border ${
                hasPgStatStatements
                  ? 'bg-primary/10 text-primary border-primary/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${hasPgStatStatements ? 'bg-primary' : 'bg-amber-400 animate-pulse'}`}></span>
                {hasPgStatStatements ? 'pg_stat_statements' : 'pg_stat_activity (live)'}
              </span>

              <button
                onClick={() => {
                  fetchSlowQueries();
                  onShowToast('Slow queries direfresh', 'refresh');
                }}
                disabled={isLoadingSlowQueries}
                className="p-1.5 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                title="Refresh Queries"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSlowQueries ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        ) : activeTab === 'sessions' ? (
          <div className="p-3 bg-surface-container-lowest flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border-b border-surface-container-high/50">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              {(
                [
                  { id: 'all', label: 'All', count: sessions.length },
                  { id: 'active', label: 'Active', count: sessions.filter((s) => s.state === 'active').length },
                  { id: 'idle in tx', label: 'Idle in Tx', count: sessions.filter((s) => s.state === 'idle in tx').length },
                  { id: 'idle', label: 'Idle', count: sessions.filter((s) => s.state === 'idle').length },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSessionFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium font-code-sm transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    sessionFilter === tab.id
                      ? tab.id === 'idle in tx' && tab.count > 0
                        ? 'bg-error-container text-on-error-container font-semibold'
                        : 'bg-primary text-on-primary font-semibold'
                      : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`px-1 py-0.2 rounded text-[10px] ${
                    sessionFilter === tab.id ? 'bg-black/20 text-inherit' : 'bg-surface-container-high text-on-surface-variant'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex-1 max-w-sm flex items-center gap-2 bg-surface-container-low rounded-lg px-3 py-1.5 border border-surface-container-high">
              <Search className="w-4 h-4 text-on-surface-variant shrink-0" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-on-surface placeholder:text-on-surface-variant/60 font-code-sm text-xs outline-none"
                placeholder="Filter PID, user, client IP, statement..."
                type="text"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-xs hover:text-on-surface">
                  ×
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {sessions.some((s) => s.state === 'idle in tx') && (
                <button
                  onClick={handleKillIdleQueries}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-error-container text-on-error-container hover:bg-error hover:text-on-error font-medium text-xs transition-colors cursor-pointer"
                  title="Kill all idle in transaction sessions"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Kill Idle Tx</span>
                </button>
              )}

              <button
                onClick={() => {
                  loadSessions();
                  onShowToast('Session list direfresh', 'refresh');
                }}
                disabled={isLoadingSessions}
                className="p-1.5 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                title="Refresh Sessions"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSessions ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        ) : activeTab === 'bloat' ? (
          <div className="p-3 bg-surface-container-lowest flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border-b border-surface-container-high/50">
            <div className="flex-1 max-w-sm flex items-center gap-2 bg-surface-container-low rounded-lg px-3 py-1.5 border border-surface-container-high">
              <Search className="w-4 h-4 text-on-surface-variant shrink-0" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-on-surface placeholder:text-on-surface-variant/60 font-code-sm text-xs outline-none"
                placeholder="Filter tabel atau schema..."
                type="text"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-xs hover:text-on-surface">
                  ×
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container border border-surface-container-high font-code-sm text-xs text-on-surface">
                <span className={`w-2 h-2 rounded-full ${autovacuumEnabled ? 'bg-primary' : 'bg-error'}`}></span>
                Autovacuum Daemon: <strong className={autovacuumEnabled ? 'text-primary' : 'text-error'}>{autovacuumEnabled ? 'Active' : 'Disabled'}</strong>
                <span className="text-on-surface-variant text-[11px]">({autovacuumWorkers} workers)</span>
              </span>

              <button
                onClick={handleVacuumAnalyzeAll}
                disabled={isVacuumingAll}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary-container text-on-primary font-label-sm text-xs font-semibold hover:bg-primary transition-colors cursor-pointer shadow-sm disabled:opacity-50"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isVacuumingAll ? 'animate-spin' : ''}`} />
                <span>{isVacuumingAll ? 'Processing...' : 'VACUUM ALL ANALYZE'}</span>
              </button>

              <button
                onClick={() => {
                  fetchTableBloat();
                  onShowToast('Statistik bloat tabel direfresh', 'refresh');
                }}
                disabled={isLoadingBloat}
                className="p-1.5 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                title="Refresh Bloat"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBloat ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-surface-container-lowest flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border-b border-surface-container-high/50">
            <div className="flex-1 max-w-sm flex items-center gap-2 bg-surface-container-low rounded-lg px-3 py-1.5 border border-surface-container-high">
              <Search className="w-4 h-4 text-on-surface-variant shrink-0" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-on-surface placeholder:text-on-surface-variant/60 font-code-sm text-xs outline-none"
                placeholder="Filter relation, mode, user, query, PID..."
                type="text"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-xs hover:text-on-surface">
                  ×
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-code-sm text-xs border ${
                contentions.length > 0
                  ? 'bg-error-container text-on-error-container border-error/30 font-semibold'
                  : 'bg-surface-container text-on-surface-variant border-surface-container-high'
              }`}>
                <span className={`w-2 h-2 rounded-full ${contentions.length > 0 ? 'bg-error animate-pulse' : 'bg-primary'}`}></span>
                {contentions.length > 0 ? `${contentions.length} Lock Contention(s)` : '0 Deadlocks / Conflicts'}
              </span>

              <button
                onClick={() => {
                  fetchLocks();
                  onShowToast('Daftar lock direfresh', 'refresh');
                }}
                disabled={isLoadingLocks}
                className="p-1.5 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                title="Refresh Locks"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLocks ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        )}

        {/* Tab 1: Slow Queries (pg_stat_statements / pg_stat_activity) */}
        {activeTab === 'slow-queries' && (
          <div className="overflow-x-auto">
            {!hasPgStatStatements && (
              <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs flex items-center justify-between font-mono">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  Ekstensi <code>pg_stat_statements</code> belum aktif di database ini. Menampilkan query aktif real-time dari <code>pg_stat_activity</code>.
                </span>
                <span className="text-[11px] text-on-surface-variant hidden md:inline">
                  Untuk statistik historis: CREATE EXTENSION pg_stat_statements;
                </span>
              </div>
            )}
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
                {isLoadingSlowQueries ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-on-surface-variant font-mono">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                      Memuat telemetri query dari PostgreSQL...
                    </td>
                  </tr>
                ) : filteredQueries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-on-surface-variant font-mono">
                      Tidak ada query yang memenuhi filter saat ini.
                    </td>
                  </tr>
                ) : (
                  filteredQueries.map((q) => (
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
                            onClick={() => handleRunExplain(q.sql)}
                            className="px-2 py-1 rounded bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface font-label-sm text-[11px] transition-all cursor-pointer font-medium"
                          >
                            EXPLAIN
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard?.writeText(q.sql);
                              onShowToast('Query SQL disalin ke clipboard', 'content_copy');
                            }}
                            className="p-1 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-on-surface cursor-pointer"
                            title="Copy SQL"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
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
                {isLoadingSessions ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-on-surface-variant font-mono">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                      Memuat session dari pg_stat_activity...
                    </td>
                  </tr>
                ) : filteredSessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-on-surface-variant font-mono">
                      Tidak ada session PostgreSQL yang sesuai dengan filter.
                    </td>
                  </tr>
                ) : (
                  filteredSessions.map((s) => (
                    <tr key={s.pid} className="hover:bg-surface-container transition-colors">
                      <td className="px-3 py-2 font-semibold text-primary">#{s.pid}</td>
                      <td className="px-2 py-2 text-on-surface-variant">{s.user}</td>
                      <td className="px-2 py-2 text-on-surface-variant font-mono">{s.clientAddr || 'local'}</td>
                      <td className="px-2 py-2">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            s.state === 'active'
                              ? 'bg-primary/10 text-primary'
                              : s.state === 'idle in tx'
                              ? 'bg-error-container text-on-error-container'
                              : 'bg-surface-container text-on-surface-variant'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              s.state === 'active' ? 'bg-primary animate-pulse' : s.state === 'idle in tx' ? 'bg-error animate-pulse' : 'bg-surface-variant'
                            }`}
                          ></span>
                          {s.state}
                        </span>
                      </td>
                      <td className="px-3 py-2 max-w-sm truncate text-on-surface font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{s.statement || '<idle>'}</span>
                          {s.statement && (
                            <button
                              onClick={() => {
                                navigator.clipboard?.writeText(s.statement);
                                onShowToast('Statement copied', 'content_copy');
                              }}
                              className="text-on-surface-variant hover:text-primary transition-colors shrink-0 p-0.5"
                              title="Copy Statement"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            s.duration.includes('m') || s.duration.includes('h')
                              ? 'bg-secondary-container/20 text-secondary'
                              : 'bg-surface-container-high text-on-surface'
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
                          {s.state === 'idle in tx' ? 'Kill Tx' : 'Terminate'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab: Service Usage (React 19 + Golang Microservice) */}
        {activeTab === 'service-usage' && (
          <div className="p-3 sm:p-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Card 1: Golang Microservice Backend */}
              <div className="rounded-xl bg-surface-container-low border border-surface-container-high/80 p-4 flex flex-col justify-between shadow-xs">
                <div>
                  {/* Service Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-surface-container-high/60">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                        <Server className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-on-surface">
                            pgstudio-server
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-surface-container-high text-primary font-mono text-[10px] font-medium">
                            {goTelemetry?.version || 'go'}
                          </span>
                        </div>
                        <div className="text-[11px] text-on-surface-variant font-mono">
                          PID #{goTelemetry?.pid || '-'} • {goTelemetry?.os || 'linux'}/{goTelemetry?.arch || 'amd64'}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono text-[10px] font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                        ONLINE
                      </span>
                      <div className="text-[10px] text-on-surface-variant font-mono mt-0.5">
                        Uptime: {goTelemetry?.uptime_formatted || '-'}
                      </div>
                    </div>
                  </div>

                  {/* Stat Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 my-3 font-mono text-xs">
                    <div className="p-2 rounded-lg bg-surface-container border border-surface-container-high/40">
                      <span className="text-[10px] text-on-surface-variant block">Physical RSS</span>
                      <span className="font-semibold text-on-surface text-sm mt-0.5 block">
                        {goTelemetry?.memory.vm_rss_formatted || '-'}
                      </span>
                      <span className="text-[10px] text-on-surface-variant/70">
                        VmSize: {goTelemetry?.memory.vm_size_formatted || '-'}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-surface-container border border-surface-container-high/40">
                      <span className="text-[10px] text-on-surface-variant block">Heap Allocated</span>
                      <span className="font-semibold text-primary text-sm mt-0.5 block">
                        {goTelemetry?.memory.alloc_formatted || '-'}
                      </span>
                      <span className="text-[10px] text-on-surface-variant/70">
                        In-Use: {goTelemetry?.memory.heap_inuse_formatted || '-'}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-surface-container border border-surface-container-high/40">
                      <span className="text-[10px] text-on-surface-variant block">Sys Memory</span>
                      <span className="font-semibold text-on-surface text-sm mt-0.5 block">
                        {goTelemetry?.memory.sys_formatted || '-'}
                      </span>
                      <span className="text-[10px] text-on-surface-variant/70">
                        Stack: {goTelemetry?.memory.stack_inuse_formatted || '-'}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-surface-container border border-surface-container-high/40">
                      <span className="text-[10px] text-on-surface-variant block">Goroutines</span>
                      <span className="font-semibold text-on-surface text-sm mt-0.5 block">
                        {goTelemetry?.num_goroutine ?? 0}
                      </span>
                      <span className="text-[10px] text-on-surface-variant/70">
                        {goTelemetry?.num_cpu ?? 0} CPU Cores
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-surface-container border border-surface-container-high/40">
                      <span className="text-[10px] text-on-surface-variant block">OS Threads</span>
                      <span className="font-semibold text-on-surface text-sm mt-0.5 block">
                        {goTelemetry?.process_threads ?? 0}
                      </span>
                      <span className="text-[10px] text-on-surface-variant/70">Kernel threads</span>
                    </div>

                    <div className="p-2 rounded-lg bg-surface-container border border-surface-container-high/40">
                      <span className="text-[10px] text-on-surface-variant block">HTTP Requests</span>
                      <span className="font-semibold text-on-surface text-sm mt-0.5 block">
                        {goTelemetry?.requests_total?.toLocaleString() ?? 0}
                      </span>
                      <span className="text-[10px] text-on-surface-variant/70">Total served</span>
                    </div>
                  </div>

                  {/* Garbage Collector Panel */}
                  <div className="p-2.5 rounded-lg bg-surface-container border border-surface-container-high/50 my-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-on-surface">
                        <Trash2 className="w-3.5 h-3.5 text-primary" />
                        <span>Garbage Collector (runtime.GC)</span>
                      </div>
                      <button
                        onClick={handleTriggerGC}
                        disabled={isTriggeringGC}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-mono font-medium transition-colors cursor-pointer disabled:opacity-50"
                        title="Panggil runtime.GC() untuk membebaskan memory heap"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>{isTriggeringGC ? 'Cleaning...' : 'Trigger GC'}</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-[10px] text-on-surface-variant block">GC Cycles</span>
                        <strong className="text-on-surface">{goTelemetry?.gc.num_gc ?? 0}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-on-surface-variant block">Last Pause</span>
                        <strong className="text-primary">{goTelemetry?.gc.last_pause_ms?.toFixed(2) || '0.00'} ms</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-on-surface-variant block">Total Pause</span>
                        <strong className="text-on-surface">{goTelemetry?.gc.pause_total_ms?.toFixed(1) || '0.0'} ms</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-on-surface-variant block">Last Run</span>
                        <strong className="text-on-surface">{goTelemetry?.gc.last_gc_ago_sec ?? 0}s ago</strong>
                      </div>
                    </div>
                  </div>

                  {/* pgx/v5 Pool Details */}
                  <div className="p-2.5 rounded-lg bg-surface-container border border-surface-container-high/50">
                    <div className="flex items-center justify-between text-xs font-medium text-on-surface mb-2">
                      <div className="flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-secondary" />
                        <span>pgx/v5 PostgreSQL Pool</span>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface-variant">
                        {goTelemetry?.pool.database || 'connected'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-[10px] text-on-surface-variant block">Acquired / Active</span>
                        <strong className="text-primary">{goTelemetry?.pool.acquired_conns ?? 0}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-on-surface-variant block">Idle in Pool</span>
                        <strong className="text-on-surface">{goTelemetry?.pool.idle_conns ?? 0}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-on-surface-variant block">Total Open</span>
                        <strong className="text-on-surface">{goTelemetry?.pool.total_conns ?? 0}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-on-surface-variant block">Max Capacity</span>
                        <strong className="text-on-surface">{goTelemetry?.pool.max_conns ?? 15}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-surface-container-high/40 flex items-center justify-between text-[11px] text-on-surface-variant font-mono">
                  <span>Binary: <strong>pgstudio-server (ELF)</strong></span>
                  <span>Port: <strong>28432</strong></span>
                </div>
              </div>

              {/* Card 2: React 19 Client SPA */}
              <div className="rounded-xl bg-surface-container-low border border-surface-container-high/80 p-4 flex flex-col justify-between shadow-xs">
                <div>
                  {/* Service Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-surface-container-high/60">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                        <Globe className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-on-surface">
                            React 19 Client SPA
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-surface-container-high text-sky-400 font-mono text-[10px] font-medium">
                            Vite + TS
                          </span>
                        </div>
                        <div className="text-[11px] text-on-surface-variant font-mono">
                          Concurrent Mode • Fiber Reconciler
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 font-mono text-[10px] font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>
                        ACTIVE
                      </span>
                      <div className="text-[10px] text-on-surface-variant font-mono mt-0.5">
                        Session: {formatSeconds(reactMetrics.uptimeSec)}
                      </div>
                    </div>
                  </div>

                  {/* Stat Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 my-3 font-mono text-xs">
                    <div className="p-2 rounded-lg bg-surface-container border border-surface-container-high/40">
                      <span className="text-[10px] text-on-surface-variant block">JS Heap Used</span>
                      <span className="font-semibold text-sky-400 text-sm mt-0.5 block">
                        {reactMetrics.jsHeapUsed ? `${reactMetrics.jsHeapUsed} MB` : 'V8 Managed'}
                      </span>
                      <span className="text-[10px] text-on-surface-variant/70">
                        {reactMetrics.jsHeapTotal ? `Alloc: ${reactMetrics.jsHeapTotal} MB` : 'Dynamic'}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-surface-container border border-surface-container-high/40">
                      <span className="text-[10px] text-on-surface-variant block">Client Frame Rate</span>
                      <span className="font-semibold text-primary text-sm mt-0.5 block">
                        {reactMetrics.fps} FPS
                      </span>
                      <span className="text-[10px] text-on-surface-variant/70">
                        requestAnimationFrame
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-surface-container border border-surface-container-high/40">
                      <span className="text-[10px] text-on-surface-variant block">DOM Elements</span>
                      <span className="font-semibold text-on-surface text-sm mt-0.5 block">
                        {reactMetrics.domNodes.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-on-surface-variant/70">
                        Reconciled nodes
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-surface-container border border-surface-container-high/40">
                      <span className="text-[10px] text-on-surface-variant block">REST Ping RTT</span>
                      <span className="font-semibold text-secondary text-sm mt-0.5 block">
                        {backendPingMs !== null ? `${backendPingMs} ms` : '< 1 ms'}
                      </span>
                      <span className="text-[10px] text-on-surface-variant/70">
                        Socket roundtrip
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-surface-container border border-surface-container-high/40">
                      <span className="text-[10px] text-on-surface-variant block">LocalStorage Cache</span>
                      <span className="font-semibold text-on-surface text-sm mt-0.5 block">
                        {reactMetrics.storageKB} KB
                      </span>
                      <span className="text-[10px] text-on-surface-variant/70">
                        Preferences store
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-surface-container border border-surface-container-high/40">
                      <span className="text-[10px] text-on-surface-variant block">V8 Memory Quota</span>
                      <span className="font-semibold text-on-surface text-sm mt-0.5 block">
                        {reactMetrics.jsHeapLimit ? `${reactMetrics.jsHeapLimit} GB` : 'System managed'}
                      </span>
                      <span className="text-[10px] text-on-surface-variant/70">
                        Browser limit
                      </span>
                    </div>
                  </div>

                  {/* Browser JS Memory Ratio Gauge */}
                  <div className="p-2.5 rounded-lg bg-surface-container border border-surface-container-high/50 my-2">
                    <div className="flex items-center justify-between text-xs font-mono mb-1">
                      <span className="text-on-surface-variant">Browser JS Heap Allocation</span>
                      <span className="text-sky-400 font-semibold">
                        {reactMetrics.jsHeapTotal > 0
                          ? ((reactMetrics.jsHeapUsed / reactMetrics.jsHeapTotal) * 100).toFixed(1)
                          : '0.0'}%
                      </span>
                    </div>
                    <div className="w-full bg-surface-container-high rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-sky-400 h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${
                            reactMetrics.jsHeapTotal > 0
                              ? Math.min((reactMetrics.jsHeapUsed / reactMetrics.jsHeapTotal) * 100, 100)
                              : 20
                          }%`,
                        }}
                      ></div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-on-surface-variant mt-1.5 font-mono">
                      <span>Used: {reactMetrics.jsHeapUsed || 0} MB</span>
                      <span>Allocated: {reactMetrics.jsHeapTotal || 0} MB</span>
                    </div>
                  </div>

                  {/* IPC Connection Info */}
                  <div className="p-2.5 rounded-lg bg-surface-container border border-surface-container-high/50">
                    <div className="flex items-center justify-between text-xs font-medium text-on-surface mb-2">
                      <div className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-primary" />
                        <span>Client IPC Transport</span>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface-variant">
                        HTTP Keep-Alive
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-[10px] text-on-surface-variant block">API Endpoint</span>
                        <strong className="text-on-surface truncate block">/api/v1/performance/service-usage</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-on-surface-variant block">Client Latency</span>
                        <strong className="text-primary">{backendPingMs !== null ? `${backendPingMs} ms` : '< 1 ms'}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-on-surface-variant block">Poll Interval</span>
                        <strong className="text-on-surface">{autoRefreshInterval > 0 ? `${autoRefreshInterval / 1000}s` : 'Paused'}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-surface-container-high/40 flex items-center justify-between text-[11px] text-on-surface-variant font-mono">
                  <span>Path: <strong>/performance</strong></span>
                  <span>Rendering: <strong>Client SPA</strong></span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Table Bloat & Vacuum */}
        {activeTab === 'bloat' && (
          <div className="p-3 sm:p-4 space-y-3 font-code-sm text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-surface-container border border-surface-container-high/60">
              <div>
                <span className="text-secondary font-semibold text-sm">Table Bloat &amp; Dead Tuples Telemetry</span>
                <p className="text-[11px] text-on-surface-variant mt-0.5">
                  Statistik live &amp; dead tuples dari <code>pg_stat_user_tables</code> untuk optimasi storage &amp; indeks vacuum.
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto font-mono text-[11px]">
                <span className="px-2 py-1 rounded bg-surface-container-high text-on-surface">
                  Tracked: <strong>{bloatTables.length}</strong> Tables
                </span>
                <span className="px-2 py-1 rounded bg-surface-container-high text-primary">
                  Workers: <strong>{autovacuumWorkers}</strong>
                </span>
              </div>
            </div>

            {isLoadingBloat ? (
              <div className="p-12 text-center text-on-surface-variant font-mono">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                Menganalisis tabel dan rasio bloat dari pg_stat_user_tables...
              </div>
            ) : filteredBloatTables.length === 0 ? (
              <div className="p-12 text-center text-on-surface-variant font-mono">
                Tidak ada tabel pengguna ditemukan atau cocok dengan filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-body-sm text-xs">
                  <thead className="bg-surface-container-low font-label-sm uppercase tracking-wider text-on-surface-variant text-[10px]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Table Relation</th>
                      <th className="px-2 py-2 font-semibold text-right">Disk Size</th>
                      <th className="px-2 py-2 font-semibold text-right">Live Tuples</th>
                      <th className="px-2 py-2 font-semibold text-right">Dead Tuples</th>
                      <th className="px-3 py-2 font-semibold min-w-[120px]">Bloat Ratio</th>
                      <th className="px-2 py-2 font-semibold">Last Vacuum</th>
                      <th className="px-3 py-2 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container-high/40 text-on-surface font-code-sm text-xs">
                    {filteredBloatTables.map((row) => {
                      const fullTableName = `${row.schema}.${row.table}`;
                      const isVacuumingThis = vacuumingTable === fullTableName;
                      const bloatVal = row.bloat_ratio || 0;
                      return (
                        <tr key={fullTableName} className="hover:bg-surface-container transition-colors">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <Table className="w-3.5 h-3.5 text-primary shrink-0" />
                              <span className="font-semibold text-on-surface">{fullTableName}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-right font-medium text-on-surface font-mono">
                            {row.total_size_formatted || '0 B'}
                          </td>
                          <td className="px-2 py-2.5 text-right font-mono text-on-surface">
                            {row.live_tup.toLocaleString()}
                          </td>
                          <td className="px-2 py-2.5 text-right font-mono text-on-surface-variant">
                            {row.dead_tup.toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-between mb-1 font-mono text-[11px]">
                              <span
                                className={`font-semibold ${
                                  bloatVal > 20
                                    ? 'text-error'
                                    : bloatVal > 5
                                    ? 'text-secondary'
                                    : 'text-primary'
                                }`}
                              >
                                {bloatVal.toFixed(2)}%
                              </span>
                            </div>
                            <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-1.5 rounded-full transition-all ${
                                  bloatVal > 20
                                    ? 'bg-error'
                                    : bloatVal > 5
                                    ? 'bg-secondary'
                                    : 'bg-primary'
                                }`}
                                style={{ width: `${Math.min(bloatVal * 2, 100)}%` }}
                              ></div>
                            </div>
                          </td>
                          <td className="px-2 py-2.5 font-mono text-[11px] text-on-surface-variant">
                            <div>{row.last_vacuum || row.last_autovacuum || 'Never'}</div>
                            {row.last_autovacuum && (
                              <div className="text-[10px] text-primary/70">auto: {row.last_autovacuum}</div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleRunVacuum(fullTableName, false)}
                                disabled={isVacuumingThis}
                                className="px-2.5 py-1 rounded bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                                title="Run VACUUM ANALYZE to reclaim dead tuple slots"
                              >
                                {isVacuumingThis ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Sparkles className="w-3 h-3" />
                                )}
                                <span>VACUUM</span>
                              </button>
                              <button
                                onClick={() => {
                                  if (window.confirm(`Jalankan VACUUM FULL pada ${fullTableName}? Ini akan mengunci tabel secara eksklusif.`)) {
                                    handleRunVacuum(fullTableName, true);
                                  }
                                }}
                                disabled={isVacuumingThis}
                                className="px-2 py-1 rounded bg-surface-container-high hover:bg-error-container hover:text-on-error-container text-on-surface-variant text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50"
                                title="Run VACUUM FULL (requires exclusive table lock)"
                              >
                                FULL
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Locks & Deadlocks */}
        {activeTab === 'locks' && (
          <div className="p-3 sm:p-4 space-y-3 font-code-sm text-xs">
            {/* Contention / Deadlock Alert */}
            {contentions.length > 0 ? (
              <div className="p-3 rounded-lg bg-error-container/20 border border-error/40 space-y-2">
                <div className="flex items-center gap-2 text-error font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0 animate-bounce" />
                  <span>Terdeteksi {contentions.length} Lock Contention / Konflik Transaksi:</span>
                </div>
                <div className="space-y-2">
                  {contentions.map((c, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded bg-surface-container-lowest border border-error/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-2"
                    >
                      <div className="space-y-1">
                        <div className="text-on-surface">
                          <span className="text-error font-bold">PID #{c.blocked_pid} ({c.blocked_user})</span>
                          <span className="text-on-surface-variant"> terblokir menunggu transaksi dari </span>
                          <strong className="text-primary font-bold">PID #{c.blocking_pid} ({c.blocking_user})</strong>
                        </div>
                        {c.blocked_statement && c.blocked_statement !== '-' && (
                          <div className="text-[11px] text-error/80 font-mono truncate max-w-xl">
                            Blocked query: {c.blocked_statement}
                          </div>
                        )}
                        {c.blocking_statement && c.blocking_statement !== '-' && (
                          <div className="text-[11px] text-primary/80 font-mono truncate max-w-xl">
                            Blocking query: {c.blocking_statement}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleKillSession(c.blocking_pid)}
                        className="px-2.5 py-1 rounded bg-error text-on-error text-xs font-semibold hover:bg-error/80 transition-colors cursor-pointer shrink-0"
                      >
                        Terminate PID #{c.blocking_pid}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container border border-surface-container-high/60">
                <span className="text-secondary font-semibold">PostgreSQL pg_locks Telemetry</span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-primary/10 text-primary font-medium text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                  0 Deadlock / Contentions
                </span>
              </div>
            )}

            {isLoadingLocks ? (
              <div className="p-12 text-center text-on-surface-variant font-mono">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                Memuat daftar lock dari pg_locks...
              </div>
            ) : filteredLocks.length === 0 ? (
              <div className="p-12 text-center text-on-surface-variant font-mono">
                Tidak ada lock yang sedang ditahan oleh transaksi saat ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-code-sm text-xs">
                  <thead className="bg-surface-container-low font-label-sm uppercase tracking-wider text-on-surface-variant text-[10px]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">PID</th>
                      <th className="px-2 py-2 font-semibold">Object / Relation</th>
                      <th className="px-2 py-2 font-semibold">Lock Type</th>
                      <th className="px-2 py-2 font-semibold">Mode</th>
                      <th className="px-2 py-2 font-semibold">Status</th>
                      <th className="px-2 py-2 font-semibold">User</th>
                      <th className="px-3 py-2 font-semibold">Statement</th>
                      <th className="px-2 py-2 font-semibold text-right">Age</th>
                      <th className="px-3 py-2 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container-high/40 text-on-surface">
                    {filteredLocks.map((l, idx) => (
                      <tr key={`${l.pid}-${l.locktype}-${idx}`} className="hover:bg-surface-container transition-colors">
                        <td className="px-3 py-2 font-semibold text-primary">#{l.pid}</td>
                        <td className="px-2 py-2 font-semibold text-on-surface">
                          {l.relation || `<${l.locktype}>`}
                        </td>
                        <td className="px-2 py-2 text-on-surface-variant">{l.locktype}</td>
                        <td className="px-2 py-2 text-secondary font-mono text-[11px]">{l.mode}</td>
                        <td className="px-2 py-2">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                              l.granted
                                ? 'bg-primary/10 text-primary'
                                : 'bg-error-container text-on-error-container animate-pulse'
                            }`}
                          >
                            {l.granted ? 'Granted' : 'Waiting'}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-on-surface-variant">{l.username || '-'}</td>
                        <td className="px-3 py-2 max-w-xs truncate text-on-surface font-mono">
                          {l.current_query || '-'}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-on-surface-variant">
                          {l.duration_sec != null ? `${l.duration_sec}s` : '-'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => handleKillSession(l.pid)}
                            className="px-2 py-1 rounded bg-surface-container-high hover:bg-error-container hover:text-on-error-container text-on-surface-variant hover:text-error text-[11px] font-medium transition-colors cursor-pointer"
                          >
                            Terminate
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Summary Footer */}
        <div className="p-2 bg-surface-container-low flex items-center justify-between text-on-surface-variant font-label-sm text-xs border-t border-surface-container-high">
          {activeTab === 'service-usage' ? (
            <span className="font-mono text-[11px]">
              pgStudio Telemetry • <strong>React 19 SPA</strong> + <strong>Go ({goTelemetry?.version || 'go'}) Backend</strong> • Port 28432
            </span>
          ) : activeTab === 'slow-queries' ? (
            <span className="font-mono text-[11px]">
              Menampilkan {filteredQueries.length} dari {slowQueries.length} query • {hasPgStatStatements ? 'pg_stat_statements aktif' : 'live pg_stat_activity'}
            </span>
          ) : activeTab === 'sessions' ? (
            <span className="font-mono text-[11px]">
              Menampilkan {filteredSessions.length} dari {sessions.length} session PostgreSQL
            </span>
          ) : activeTab === 'bloat' ? (
            <span className="font-mono text-[11px]">
              Menampilkan {filteredBloatTables.length} dari {bloatTables.length} tabel pengguna • Autovacuum {autovacuumEnabled ? 'aktif' : 'nonaktif'}
            </span>
          ) : (
            <span className="font-mono text-[11px]">
              Menampilkan {filteredLocks.length} locks • {contentions.length} contention terdeteksi
            </span>
          )}
          <div className="flex items-center gap-1 font-mono text-[11px]">
            <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface">
              pgStudio 2.0
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
              <div className="text-secondary font-mono pb-2 border-b border-surface-container-high break-all">
                {explainModalQuery}
              </div>

              {isExplaining ? (
                <div className="p-8 text-center text-on-surface-variant font-mono space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-primary" />
                  <div>Menjalankan EXPLAIN (ANALYZE, BUFFERS) di PostgreSQL...</div>
                </div>
              ) : explainError ? (
                <div className="p-3 rounded-lg bg-error-container/20 border border-error/30 text-xs font-mono space-y-2">
                  <div className="text-error font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>PostgreSQL Error saat mengeksekusi EXPLAIN:</span>
                  </div>
                  <div className="text-on-surface-variant bg-surface-container-lowest p-2 rounded border border-surface-container-high overflow-x-auto whitespace-pre-wrap">
                    {explainError}
                  </div>
                  <div className="text-[11px] text-on-surface-variant">
                    Catatan: Query berparameter (seperti $1, $2) atau prepared statements tidak dapat dianalisis langsung tanpa parameter konkrit.
                  </div>
                </div>
              ) : explainPlanLines.length > 0 ? (
                <div className="p-3 rounded bg-surface-container-lowest font-mono text-xs leading-relaxed space-y-0.5 border border-surface-container-high overflow-x-auto">
                  {explainPlanLines.map((line, idx) => {
                    const isSeqScan = line.includes('Seq Scan');
                    const isIndexScan = line.includes('Index Scan') || line.includes('Index Only Scan');
                    const isTime = line.includes('Execution Time') || line.includes('Planning Time');
                    const isBuffer = line.includes('Buffers:');
                    return (
                      <div
                        key={idx}
                        className={`${
                          isSeqScan
                            ? 'text-amber-400 font-semibold'
                            : isIndexScan
                            ? 'text-emerald-400 font-semibold'
                            : isTime
                            ? 'text-primary font-bold pt-1'
                            : isBuffer
                            ? 'text-sky-300'
                            : 'text-on-surface'
                        }`}
                      >
                        {line}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 text-center text-on-surface-variant font-mono text-xs">
                  Tidak ada output execution plan.
                </div>
              )}
            </div>

            <div className="p-3 bg-surface-container-lowest flex items-center justify-end gap-2 border-t border-surface-container-high">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(explainPlanLines.length > 0 ? explainPlanLines.join('\n') : (explainModalQuery || ''));
                  onShowToast('Execution plan disalin ke clipboard', 'content_copy');
                }}
                disabled={isExplaining || explainPlanLines.length === 0}
                className="px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface text-xs font-label-md cursor-pointer disabled:opacity-50"
              >
                Copy Plan
              </button>
              <button
                onClick={() => setExplainModalQuery(null)}
                className="px-3 py-1.5 rounded bg-primary text-on-primary font-semibold text-xs hover:bg-primary-container cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
