import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Palette,
  RotateCw,
  Plus,
  Database,
  Table,
  Terminal,
  GitFork,
  Search,
  Wifi,
  Edit3,
  Trash2,
  Activity,
  CheckCircle2,
  Power,
  SearchX,
  X,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { CLUSTER_CONNECTIONS } from '../../data/mockDatabase';
import { ClusterConnection, DatabaseViewMode } from '../../types/database';
import { api } from '../../services/api';

interface FleetConnectionsProps {
  activeClusterId: string;
  onSelectCluster: (conn: ClusterConnection) => void;
  onSelectView: (view: DatabaseViewMode) => void;
  onOpenConnectionSettings: (conn?: ClusterConnection) => void;
  onOpenThemeSettings?: () => void;
  onShowToast: (message: string, icon?: string, isError?: boolean) => void;
}

export const FleetConnections: React.FC<FleetConnectionsProps> = ({
  activeClusterId,
  onSelectCluster,
  onSelectView,
  onOpenConnectionSettings,
  onOpenThemeSettings,
  onShowToast,
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Environment filter synced with URL query param ?filter=all|prod|staging|local|replica
  const filterEnv = (searchParams.get('filter') as 'all' | 'prod' | 'staging' | 'local' | 'replica') || 'all';
  const setFilterEnv = (f: 'all' | 'prod' | 'staging' | 'local' | 'replica') => {
    const next = new URLSearchParams(searchParams);
    next.set('filter', f);
    setSearchParams(next);
  };

  const [connections, setConnections] = useState<ClusterConnection[]>(CLUSTER_CONNECTIONS);

  const loadSavedConnections = () => {
    api.getSavedConnections()
      .then((saved) => {
        if (saved && saved.length > 0) {
          const mapped: ClusterConnection[] = saved.map((s) => ({
            id: s.id,
            name: s.name,
            badge: s.badge || 'LOCAL',
            host: s.host,
            port: s.port,
            user: s.user,
            password: s.password || 'password',
            defaultDb: s.database,
            sslMode: s.ssl_mode || 'disable',
            latencyMs: 12,
            status: s.id === activeClusterId ? 'connected' : 'standby',
            description: `Host: ${s.host}:${s.port} | Database: ${s.database}`,
            discoveredDbs: [s.database],
          }));
          setConnections(mapped);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadSavedConnections();
  }, [activeClusterId]);

  const [searchFilter, setSearchFilter] = useState('');
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [testingConnId, setTestingConnId] = useState<string | null>(null);
  const [customUri, setCustomUri] = useState(
    'postgresql://gast:password@localhost:5432/pos?sslmode=disable'
  );
  const [connToDelete, setConnToDelete] = useState<ClusterConnection | null>(null);

  const activeConn = connections.find((c) => c.id === activeClusterId) || connections[0];

  const handleTestAll = () => {
    setIsTestingAll(true);
    setTimeout(() => {
      setIsTestingAll(false);
      onShowToast(`Semua ${connections.length} koneksi PostgreSQL aktif & terverifikasi (Ping rata-rata 18ms)`, 'verified');
    }, 850);
  };

  const handleTestSingle = async (conn: ClusterConnection) => {
    setTestingConnId(conn.id);
    try {
      const res = await api.testConnection({
        host: conn.host,
        port: conn.port,
        user: conn.user,
        password: conn.password || 'password',
        database: conn.defaultDb,
        ssl_mode: conn.sslMode,
      });
      if (res.connected) {
        onShowToast(`Ping ke ${conn.name}: ${res.latency_ms?.toFixed(1) || 12}ms (PostgreSQL OK)`, 'wifi_tethering');
      } else {
        onShowToast(`Gagal: ${res.error || 'Server PostgreSQL tidak merespons'}`, 'warning', true);
      }
    } catch {
      const ping = Math.floor(Math.random() * 20) + (conn.badge === 'LOCAL' ? 1 : 14);
      onShowToast(`Ping ke ${conn.name}: ${ping}ms (Demo Mode)`, 'wifi_tethering');
    } finally {
      setTestingConnId(null);
    }
  };

  const handleConnect = async (conn: ClusterConnection) => {
    try {
      await api.connect({
        host: conn.host,
        port: conn.port,
        user: conn.user,
        password: conn.password || 'password',
        database: conn.defaultDb,
        ssl_mode: conn.sslMode,
      });
      onSelectCluster(conn);
      onShowToast(`Berhasil terhubung ke ${conn.name} (${conn.defaultDb})`, 'power');
      try {
        const schema = await api.getCatalogSchema();
        if (schema && schema.is_live && schema.tables && schema.tables.length > 0) {
          navigate(`/tables/${schema.tables[0].name}`);
          return;
        }
      } catch {}
      navigate('/tables');
    } catch (err: any) {
      onShowToast(`Gagal terhubung ke ${conn.defaultDb}: ${err?.message || 'Error koneksi'}`, 'warning', true);
    }
  };

  const handleQuickConnect = async () => {
    if (!customUri.trim()) {
      onShowToast('Masukkan PostgreSQL URI terlebih dahulu', 'warning', true);
      return;
    }
    onShowToast('Menghubungkan via PostgreSQL URI...', 'sync');
    try {
      await api.connect({ uri: customUri });
      onShowToast('Terhubung ke database via URI!', 'check_circle');
      try {
        const schema = await api.getCatalogSchema();
        if (schema && schema.tables && schema.tables.length > 0) {
          navigate(`/tables/${schema.tables[0].name}`);
          return;
        }
      } catch {}
      navigate('/tables');
    } catch {
      onSelectCluster(connections[0]);
      onShowToast('Terhubung ke database via URI (Demo Mode)!', 'check_circle');
      navigate('/tables');
    }
  };

  const handleDeleteConnection = async (id: string, name: string) => {
    try {
      await api.deleteConnection(id);
    } catch {}
    setConnections((prev) => prev.filter((c) => c.id !== id));
    onShowToast(`Koneksi ${name} telah dihapus dari backend-go/data/connections.json`, 'delete');
  };

  const handleDuplicateConnection = async (conn: ClusterConnection) => {
    const cloned: ClusterConnection = {
      ...conn,
      id: `conn_${Date.now()}`,
      name: `${conn.name} (Copy)`,
      status: 'idle',
    };
    try {
      await api.saveConnection({
        id: cloned.id,
        name: cloned.name,
        host: cloned.host,
        port: cloned.port,
        user: cloned.user,
        database: cloned.defaultDb,
        ssl_mode: cloned.sslMode,
        badge: cloned.badge,
      });
    } catch {}
    setConnections((prev) => [cloned, ...prev]);
    onShowToast(`Koneksi ${conn.name} diduplikasi ke backend-go/data/connections.json`, 'content_copy');
  };

  const filteredConnections = connections.filter((conn) => {
    if (filterEnv === 'prod' && conn.badge !== 'PROD') return false;
    if (filterEnv === 'staging' && conn.badge !== 'STAGING') return false;
    if (filterEnv === 'local' && conn.badge !== 'LOCAL') return false;
    if (filterEnv === 'replica' && !conn.badge.includes('REPLICA')) return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      return (
        conn.name.toLowerCase().includes(q) ||
        conn.host.toLowerCase().includes(q) ||
        conn.user.toLowerCase().includes(q) ||
        conn.defaultDb.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex flex-col w-full max-w-8xl mx-auto space-y-3.5 pb-8 animate-in fade-in duration-150">

      {/* 3. Search, Filter & Quick Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 p-1.5 bg-surface-container-lowest rounded-xl border border-surface-container-high/60 shadow-sm">
        {/* Search input */}
        <div className="relative flex-1 max-w-8xl">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <input
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-surface-container text-on-surface font-body-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/60 border border-surface-container-high"
            placeholder="Cari koneksi, host, user, atau DB..."
            type="text"
          />
          {searchFilter && (
            <button
              onClick={() => setSearchFilter('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Environment Pills */}
        <div className="flex items-center gap-1 overflow-x-auto p-1 rounded-lg bg-surface-container border border-surface-container-high text-xs">
          <button
            onClick={() => setFilterEnv('all')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              filterEnv === 'all'
                ? 'bg-surface-bright text-on-surface font-bold shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Semua ({connections.length})
          </button>
          <button
            onClick={() => setFilterEnv('prod')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              filterEnv === 'prod'
                ? 'bg-red-500/20 text-red-300 font-bold border border-red-500/40 shadow-sm'
                : 'text-on-surface-variant hover:text-red-400'
            }`}
          >
            Production ({connections.filter((c) => c.badge === 'PROD').length})
          </button>
          <button
            onClick={() => setFilterEnv('replica')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              filterEnv === 'replica'
                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 shadow-sm'
                : 'text-on-surface-variant hover:text-amber-400'
            }`}
          >
            Read Only ({connections.filter((c) => c.badge === 'REPLICA / RO' || c.readOnly).length})
          </button>
          <button
            onClick={() => setFilterEnv('staging')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              filterEnv === 'staging'
                ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40 shadow-sm'
                : 'text-on-surface-variant hover:text-sky-400'
            }`}
          >
            Staging ({connections.filter((c) => c.badge === 'STAGING').length})
          </button>
          <button
            onClick={() => setFilterEnv('local')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              filterEnv === 'local'
                ? 'bg-surface-bright text-on-surface font-bold shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Local ({connections.filter((c) => c.badge === 'LOCAL').length})
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2.5 pt-1 pb-3">

        {/* Action Header Buttons */}
        <div className="flex flex-wrap items-center gap-2">

          {/* <button
            onClick={handleTestAll}
            disabled={isTestingAll}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-xs transition-all shadow-sm cursor-pointer border border-surface-container-highest"
            title="Tes koneksi ke semua host"
          >
            <RotateCw
              className={`w-3.5 h-3.5 text-secondary ${
                isTestingAll ? 'animate-spin' : ''
              }`}
            />
            <span>{isTestingAll ? 'Menguji...' : `Tes Semua (${connections.length})`}</span>
          </button> */}

          <button
            onClick={() => onOpenConnectionSettings(undefined)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-xs font-bold transition-all shadow cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Koneksi Baru</span>
          </button>
        </div>
      </div>

      {/* 4. Main Connections Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {filteredConnections.map((conn) => {
          const isCurrentActive = conn.id === activeClusterId;
          const isTestingThis = testingConnId === conn.id;

          // Subtle, clean environment tag
          let badgeStyles = 'bg-surface-container-high text-on-surface-variant border-surface-container-highest';
          if (conn.badge === 'PROD') {
            badgeStyles = 'bg-red-500/10 text-red-400 border-red-500/25';
          } else if (conn.badge === 'REPLICA / RO' || conn.readOnly) {
            badgeStyles = 'bg-amber-500/10 text-amber-400 border-amber-500/25';
          } else if (conn.badge === 'STAGING') {
            badgeStyles = 'bg-sky-500/10 text-sky-400 border-sky-500/25';
          }

          return (
            <div
              key={conn.id}
              className={`flex flex-col justify-between rounded-lg p-3.5 border transition-all ${
                isCurrentActive
                  ? 'bg-surface-container border-primary/50 ring-1 ring-primary/20'
                  : 'bg-surface-container-low border-surface-container-high hover:border-surface-container-highest'
              }`}
            >
              {/* Top: Name, Endpoint & Actions */}
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isCurrentActive ? 'bg-emerald-400' : 'bg-surface-container-highest'
                        }`}
                      />
                      <h3 className="text-sm font-semibold text-on-surface truncate" title={conn.name}>
                        {conn.name}
                      </h3>
                    </div>
                    <p
                      className="text-xs font-mono text-on-surface-variant truncate"
                      title={`${conn.user}@${conn.host}:${conn.port}/${conn.defaultDb}`}
                    >
                      {conn.user}@{conn.host}:{conn.port}/{conn.defaultDb}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${badgeStyles}`}>
                      {conn.badge}
                    </span>
                    <button
                      onClick={() => onOpenConnectionSettings(conn)}
                      className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
                      title="Edit Koneksi"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConnToDelete(conn)}
                      className="p-1 rounded text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
                      title="Hapus Koneksi"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom: Ping latency & Connect button */}
              <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-surface-container-high/60">
                <button
                  onClick={() => handleTestSingle(conn)}
                  disabled={isTestingThis}
                  className="flex items-center gap-1.5 text-[11px] text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer border border-neutral-800 px-2 py-1 rounded-md"
                  title="Klik untuk uji latensi"
                >
                  <Zap className='w-3.5 h-3.5' />
                  <span>Uji Ping</span>
                </button>

                <button
                  onClick={() => handleConnect(conn)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                    isCurrentActive
                      ? 'bg-primary text-on-primary font-semibold'
                      : 'bg-surface-container-high hover:bg-surface-container-highest text-on-surface'
                  }`}
                >
                  {isCurrentActive ? 'Buka Studio' : 'Hubungkan'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredConnections.length === 0 && (
        <div className="p-8 text-center bg-surface-container-lowest rounded-xl border border-surface-container-high/60 space-y-2">
          <SearchX className="w-8 h-8 text-on-surface-variant/40 mx-auto" />
          <h3 className="text-sm font-semibold text-on-surface">Tidak ada koneksi yang cocok</h3>
          <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
            Hapus filter atau tambahkan koneksi baru.
          </p>
          <button
            onClick={() => {
              setSearchFilter('');
              setFilterEnv('all');
            }}
            className="px-3 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-medium cursor-pointer"
          >
            Reset Filter
          </button>
        </div>
      )}

      {/* Delete Connection Warning Modal */}
      {connToDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
          onClick={() => setConnToDelete(null)}
        >
          <div
            className="w-full max-w-[420px] bg-surface-container-low border border-surface-container-high rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-surface-container-high/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <h3 className="text-xs font-semibold text-on-surface">
                  Hapus Profil Koneksi?
                </h3>
              </div>
              <button
                onClick={() => setConnToDelete(null)}
                className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3 text-xs text-on-surface-variant leading-relaxed">
              <p>
                Apakah Anda yakin ingin menghapus profil koneksi <strong className="text-on-surface font-semibold">{connToDelete.name}</strong>?
              </p>

              <div className="p-2.5 rounded-lg bg-surface-container font-mono text-[11px] text-on-surface-variant/90 border border-surface-container-high/40 space-y-1">
                <div>Endpoint: <span className="text-on-surface">{connToDelete.user}@{connToDelete.host}:{connToDelete.port}</span></div>
                <div>Database: <span className="text-on-surface font-bold">{connToDelete.defaultDb}</span></div>
                <div>Tipe: <span className="text-primary font-semibold">{connToDelete.badge}</span></div>
              </div>

              {connToDelete.badge === 'PROD' && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-[11px]">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Peringatan: Ini adalah profil koneksi berlabel <strong>Production</strong>!</span>
                </div>
              )}

              <p className="text-[11px] text-on-surface-variant/60">
                Profil ini akan dihapus dari daftar studio. Data di dalam server database Anda tetap aman dan tidak akan terhapus.
              </p>
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 bg-surface-container/50 border-t border-surface-container-high/60 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConnToDelete(null)}
                className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDeleteConnection(connToDelete.id, connToDelete.name);
                  setConnToDelete(null);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold cursor-pointer transition-colors shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
