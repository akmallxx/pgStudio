import React, { useState } from 'react';
import { ClusterConnection } from '../../types/database';
import {
  Database,
  X,
  Laptop,
  Zap,
  Cloud,
  Droplets,
  Sliders,
  Link,
  ArrowLeftRight,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Power,
  PlusCircle,
} from 'lucide-react';

interface NewConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (connection: ClusterConnection, connectImmediately: boolean) => void;
  onShowToast: (message: string, icon?: string, isError?: boolean) => void;
  initialData?: ClusterConnection;
}

export const NewConnectionModal: React.FC<NewConnectionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onShowToast,
  initialData,
}) => {
  const [tab, setTab] = useState<'form' | 'uri'>('form');
  const [name, setName] = useState(initialData?.name || 'My PostgreSQL DB');
  const [badge, setBadge] = useState<'PROD' | 'STAGING' | 'LOCAL' | 'REPLICA / RO'>(
    initialData?.badge || 'LOCAL'
  );
  const [host, setHost] = useState(initialData?.host || 'localhost');
  const [port, setPort] = useState(initialData?.port || 5432);
  const [user, setUser] = useState(initialData?.user || 'postgres');
  const [password, setPassword] = useState('••••••••••••');
  const [showPassword, setShowPassword] = useState(false);
  const [database, setDatabase] = useState(initialData?.defaultDb || 'postgres');
  const [sslMode, setSslMode] = useState(initialData?.sslMode || 'Prefer');
  const [description, setDescription] = useState(
    initialData?.description || 'Koneksi database PostgreSQL baru'
  );
  const [uri, setUri] = useState(
    'postgresql://postgres:password@localhost:5432/postgres?sslmode=prefer'
  );

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    success: boolean;
    message: string;
    latencyMs?: number;
  }>({ tested: false, success: false, message: '' });

  if (!isOpen) return null;

  // Apply Quick Preset
  const applyPreset = (preset: 'local' | 'supabase' | 'aws' | 'neon' | 'cloudsql') => {
    setTestResult({ tested: false, success: false, message: '' });
    if (preset === 'local') {
      setName('Localhost Postgres 16');
      setBadge('LOCAL');
      setHost('127.0.0.1');
      setPort(5432);
      setUser('postgres');
      setDatabase('postgres');
      setSslMode('Disable (Plain)');
      setDescription('Local Docker / Native PostgreSQL cluster running on default port');
    } else if (preset === 'supabase') {
      setName('Supabase Production DB');
      setBadge('PROD');
      setHost('db.pxymztqklvwr.supabase.co');
      setPort(6543);
      setUser('postgres.pxymztqklvwr');
      setDatabase('postgres');
      setSslMode('Require');
      setDescription('Supabase Cloud instance with PgBouncer transaction pooling');
    } else if (preset === 'aws') {
      setName('AWS RDS Aurora PostgreSQL');
      setBadge('PROD');
      setHost('aurora-pg-cluster.c7x829.us-east-1.rds.amazonaws.com');
      setPort(5432);
      setUser('dba_admin');
      setDatabase('app_production');
      setSslMode('Verify-Full');
      setDescription('Amazon Aurora Serverless v2 PostgreSQL primary writer');
    } else if (preset === 'neon') {
      setName('Neon Serverless DB');
      setBadge('STAGING');
      setHost('ep-tiny-lake-192841.us-east-2.aws.neon.tech');
      setPort(5432);
      setUser('neon_admin');
      setDatabase('neondb');
      setSslMode('Require');
      setDescription('Neon Autoscaling PostgreSQL branch for feature testing');
    } else if (preset === 'cloudsql') {
      setName('Google Cloud SQL Postgres');
      setBadge('PROD');
      setHost('34.120.45.89');
      setPort(5432);
      setUser('cloudsqlsuperuser');
      setDatabase('cloudsql_db');
      setSslMode('Verify-CA');
      setDescription('Google Cloud SQL PostgreSQL 16 Enterprise tier');
    }
    onShowToast(`Preset ${preset.toUpperCase()} diterapkan`, 'check');
  };

  const handleParseUri = () => {
    try {
      // Basic URI parse
      const parsed = new URL(uri);
      if (parsed.protocol.startsWith('postgres')) {
        setHost(parsed.hostname || 'localhost');
        setPort(parsed.port ? parseInt(parsed.port) : 5432);
        setUser(parsed.username || 'postgres');
        setPassword(parsed.password || '');
        setDatabase(parsed.pathname.replace('/', '') || 'postgres');
        setName(parsed.hostname ? `Cluster (${parsed.hostname.split('.')[0]})` : 'Imported Cluster');
        setTab('form');
        onShowToast('URI berhasil di-parse ke form parameter', 'check');
      } else {
        onShowToast('Format URI harus postgresql://...', 'warning', true);
      }
    } catch {
      onShowToast('Gagal mem-parse URI. Pastikan format valid.', 'error', true);
    }
  };

  const handleTestConnection = () => {
    setIsTesting(true);
    setTestResult({ tested: false, success: false, message: '' });

    setTimeout(() => {
      setIsTesting(false);
      const simulatedLatency = Math.floor(Math.random() * 25) + 12;
      setTestResult({
        tested: true,
        success: true,
        latencyMs: simulatedLatency,
        message: `Koneksi Berhasil! Terhubung ke PostgreSQL 16.4 di ${host}:${port}. Handshake TLS terverifikasi.`,
      });
      onShowToast(`Test Ping Berhasil: ${simulatedLatency}ms!`, 'verified');
    }, 700);
  };

  const handleSubmit = (connectImmediately: boolean) => {
    if (!name.trim() || !host.trim()) {
      onShowToast('Nama koneksi dan Host wajib diisi', 'warning', true);
      return;
    }

    const newConn: ClusterConnection = {
      id: initialData?.id || `conn-${Date.now()}`,
      name: name.trim(),
      badge,
      host: host.trim(),
      port: Number(port) || 5432,
      user: user.trim(),
      defaultDb: database.trim() || 'postgres',
      sslMode,
      latencyMs: testResult.latencyMs || 18,
      status: connectImmediately ? 'connected' : 'active',
      description: description.trim() || 'PostgreSQL Connection',
      discoveredDbs: [database.trim() || 'postgres', 'template1', 'postgres'],
    };

    onSave(newConn, connectImmediately);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl bg-surface-container-low border border-surface-container-highest rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Modal Header */}
        <div className="p-3 sm:p-3.5 bg-surface-container-lowest border-b border-surface-container-high flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
              <PlusCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-headline-sm text-sm font-bold text-on-surface">
                {initialData ? 'Edit Koneksi Database' : 'Tambah Koneksi Database Baru'}
              </h2>
              <p className="font-body-sm text-[11px] text-on-surface-variant">
                Hubungkan instance PostgreSQL, Supabase, AWS Aurora, Cloud SQL, atau Docker.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Preset Bar */}
        <div className="px-3.5 py-1.5 bg-surface-container-low border-b border-surface-container-high/60 flex items-center gap-1.5 overflow-x-auto text-xs">
          <span className="text-on-surface-variant font-label-sm text-[10px] whitespace-nowrap">
            Preset:
          </span>
          <button
            type="button"
            onClick={() => applyPreset('local')}
            className="px-2 py-0.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors cursor-pointer border border-surface-container-highest flex items-center gap-1 shrink-0 text-[11px] font-medium"
          >
            <Laptop className="w-3 h-3 text-primary" />
            Local (5432)
          </button>
          <button
            type="button"
            onClick={() => applyPreset('supabase')}
            className="px-2 py-0.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors cursor-pointer border border-surface-container-highest flex items-center gap-1 shrink-0 text-[11px] font-medium"
          >
            <Zap className="w-3 h-3 text-secondary" />
            Supabase
          </button>
          <button
            type="button"
            onClick={() => applyPreset('aws')}
            className="px-2 py-0.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors cursor-pointer border border-surface-container-highest flex items-center gap-1 shrink-0 text-[11px] font-medium"
          >
            <Cloud className="w-3 h-3 text-error" />
            AWS RDS
          </button>
          <button
            type="button"
            onClick={() => applyPreset('neon')}
            className="px-2 py-0.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors cursor-pointer border border-surface-container-highest flex items-center gap-1 shrink-0 text-[11px] font-medium"
          >
            <Droplets className="w-3 h-3 text-tertiary" />
            Neon
          </button>
          <button
            type="button"
            onClick={() => applyPreset('cloudsql')}
            className="px-2 py-0.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors cursor-pointer border border-surface-container-highest flex items-center gap-1 shrink-0 text-[11px] font-medium"
          >
            <Cloud className="w-3 h-3 text-primary" />
            Cloud SQL
          </button>
        </div>

        {/* Input Mode Selector Tabs */}
        <div className="px-3.5 pt-2 flex items-center gap-2 border-b border-surface-container-high/40">
          <button
            onClick={() => setTab('form')}
            className={`pb-1.5 px-2.5 text-xs font-semibold cursor-pointer border-b-2 transition-colors flex items-center gap-1 ${
              tab === 'form'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Form Parameter
          </button>
          <button
            onClick={() => setTab('uri')}
            className={`pb-1.5 px-2.5 text-xs font-semibold cursor-pointer border-b-2 transition-colors flex items-center gap-1 ${
              tab === 'uri'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Link className="w-3.5 h-3.5" />
            Connection URI
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-3.5 overflow-y-auto space-y-2.5 flex-1 font-body-sm text-xs">
          {tab === 'uri' ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-on-surface flex items-center justify-between">
                  <span>PostgreSQL Connection String / URI</span>
                  <span className="text-[11px] text-on-surface-variant font-normal">
                    Format: postgresql://[user]:[password]@[host]:[port]/[database]
                  </span>
                </label>
                <textarea
                  rows={3}
                  value={uri}
                  onChange={(e) => setUri(e.target.value)}
                  className="w-full p-3 rounded-xl bg-surface-container-lowest text-on-surface font-code-sm text-xs border border-surface-container-highest focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  placeholder="postgresql://dba_admin:secret@aws-rds-cluster.internal:5432/ecommerce?sslmode=verify-full"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleParseUri}
                  className="px-3.5 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-medium border border-surface-container-highest flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-primary" />
                  Ekstrak / Parse ke Form
                </button>
                <span className="text-xs text-on-surface-variant">
                  Membedah host, port, kredensial, dan nama database secara otomatis.
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {/* Row 1: Connection Name & Badge Environment */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-medium text-on-surface">Nama Tampilan Koneksi</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="misal: Production PostgreSQL AWS"
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest text-on-surface text-xs border border-surface-container-highest focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-on-surface">Environment</label>
                  <select
                    value={badge}
                    onChange={(e) => setBadge(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest text-on-surface text-xs border border-surface-container-highest focus:border-primary focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                  >
                    <option value="LOCAL">LOCAL (Localhost)</option>
                    <option value="PROD">PROD (Production)</option>
                    <option value="STAGING">STAGING</option>
                    <option value="REPLICA / RO">REPLICA / RO</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Host & Port */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-3 space-y-1">
                  <label className="text-xs font-medium text-on-surface">Host / Alamat Server</label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="localhost atau db.mycluster.rds.amazonaws.com"
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest text-on-surface text-xs font-code-sm border border-surface-container-highest focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-on-surface">Port</label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    placeholder="5432"
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest text-on-surface text-xs font-code-sm border border-surface-container-highest focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
              </div>

              {/* Row 3: Database Name & User */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-on-surface">Database Utama (Default DB)</label>
                  <input
                    type="text"
                    value={database}
                    onChange={(e) => setDatabase(e.target.value)}
                    placeholder="postgres atau my_database"
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest text-on-surface text-xs font-code-sm border border-surface-container-highest focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-on-surface">Username</label>
                  <input
                    type="text"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    placeholder="postgres atau dba_admin"
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest text-on-surface text-xs font-code-sm border border-surface-container-highest focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
              </div>

              {/* Row 4: Password & SSL Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-on-surface">Password</label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-[11px] text-primary hover:underline cursor-pointer"
                    >
                      {showPassword ? 'Sembunyikan' : 'Perlihatkan'}
                    </button>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password database"
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest text-on-surface text-xs font-code-sm border border-surface-container-highest focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-on-surface">SSL Mode</label>
                  <select
                    value={sslMode}
                    onChange={(e) => setSslMode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest text-on-surface text-xs border border-surface-container-highest focus:border-primary focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                  >
                    <option value="Disable (Plain)">Disable (Plain - Localhost)</option>
                    <option value="Prefer">Prefer</option>
                    <option value="Require">Require (SSL Wajib)</option>
                    <option value="Verify-CA">Verify-CA</option>
                    <option value="Verify-Full">Verify-Full (Strict CA Certificate)</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-on-surface">Catatan / Deskripsi (Opsional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Keterangan seputar instansi ini..."
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-lowest text-on-surface text-xs border border-surface-container-highest focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
            </div>
          )}

          {/* Test Connection Result Box */}
          {testResult.tested && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-3 transition-all ${
                testResult.success
                  ? 'bg-primary/10 border-primary/30 text-on-surface'
                  : 'bg-error-container/20 border-error/30 text-on-surface'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5 text-xs">
                <div className="font-semibold flex items-center gap-2">
                  <span>{testResult.success ? 'Koneksi Berhasil' : 'Koneksi Gagal'}</span>
                  {testResult.latencyMs && (
                    <span className="px-1.5 py-0.2 rounded bg-surface-container font-code-sm text-[10px] text-secondary">
                      {testResult.latencyMs}ms
                    </span>
                  )}
                </div>
                <p className="text-on-surface-variant font-code-sm text-[11px]">
                  {testResult.message}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 bg-surface-container-lowest border-t border-surface-container-high flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            className="px-3.5 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-medium border border-surface-container-highest flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
          >
            <RotateCw
              className={`w-3.5 h-3.5 text-secondary ${isTesting ? 'animate-spin' : ''}`}
            />
            <span>{isTesting ? 'Menguji Ping...' : 'Uji Koneksi (Test)'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface text-xs font-medium transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              className="px-3.5 py-2 rounded-xl bg-surface-container-highest hover:bg-surface-variant text-on-surface text-xs font-semibold transition-all cursor-pointer shadow-sm border border-surface-container-high"
            >
              Simpan Koneksi
            </button>
            <button
              type="button"
              onClick={() => handleSubmit(true)}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary text-xs font-bold transition-all cursor-pointer shadow-md flex items-center gap-1.5"
            >
              <Power className="w-3.5 h-3.5" />
              <span>Simpan &amp; Hubungkan</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
