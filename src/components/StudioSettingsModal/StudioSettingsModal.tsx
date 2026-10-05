import React, { useState, useEffect } from 'react';
import {
  Settings,
  Sliders,
  Database,
  Palette,
  HardDrive,
  CheckCircle2,
  Clock,
  Zap,
  X,
  RotateCcw,
  FileJson,
  ShieldCheck,
  Save,
  Check,
  Terminal,
  Activity,
} from 'lucide-react';
import { api, StudioSettings } from '../../services/api';

interface StudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (message: string, icon?: string, isError?: boolean) => void;
  onOpenThemeMaster?: () => void;
}

export const StudioSettingsModal: React.FC<StudioSettingsModalProps> = ({
  isOpen,
  onClose,
  onShowToast,
  onOpenThemeMaster,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'query' | 'storage' | 'appearance'>('general');
  const [settings, setSettings] = useState<StudioSettings>({
    max_query_history: 50,
    default_page_size: 25,
    autocommit_default: true,
    theme_preset: 'emerald-dark',
    statement_timeout_ms: 30000,
    catalog_scope: 'public',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      api
        .getSettings()
        .then((s) => {
          if (s) setSettings(s);
        })
        .catch(() => {})
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await api.updateSettings(settings);
      setSettings(res.settings);
      onShowToast(
        `Pengaturan Studio berhasil disimpan ke backend-go/data/settings.json (Max History: ${settings.max_query_history})`,
        'verified'
      );
      onClose();
    } catch (err: any) {
      onShowToast(`Gagal menyimpan pengaturan: ${err.message}`, 'warning', true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setSettings({
      max_query_history: 50,
      default_page_size: 25,
      autocommit_default: true,
      theme_preset: 'emerald-dark',
      statement_timeout_ms: 30000,
      catalog_scope: 'public',
    });
    onShowToast('Pengaturan di-reset ke nilai default', 'check');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-surface-container-lowest/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-surface-container-lowest border border-surface-container-high rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Window Header */}
        <div className="h-12 px-4 bg-surface-container-low flex items-center justify-between shrink-0 select-none border-b border-surface-container-high">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Settings className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-on-surface tracking-tight">
                  Master Studio Settings
                </h2>
                <span className="font-label-sm text-[9px] px-1.5 py-0.2 rounded bg-surface-container-highest text-primary font-mono font-medium">
                  backend-go/data/settings.json
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Konfigurasi global query limits, pagination, autocommit &amp; storage data
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDefaults}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded transition-colors cursor-pointer"
              title="Reset ke pengaturan default"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset Default</span>
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded hover:bg-error/20 text-on-surface-variant hover:text-error flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body: Sidebar Tabs + Settings Panel */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-[380px]">
          {/* Navigation Sidebar */}
          <aside className="w-full md:w-56 bg-surface-container-low shrink-0 flex flex-col p-2 border-r border-surface-container-high space-y-1">
            <button
              onClick={() => setActiveTab('general')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                activeTab === 'general'
                  ? 'bg-surface-container text-primary font-semibold border-l-2 border-primary'
                  : 'text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface'
              }`}
            >
              <Sliders className="w-4 h-4 text-primary" />
              <span>General &amp; Query</span>
            </button>

            <button
              onClick={() => setActiveTab('query')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                activeTab === 'query'
                  ? 'bg-surface-container text-primary font-semibold border-l-2 border-primary'
                  : 'text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface'
              }`}
            >
              <Clock className="w-4 h-4 text-secondary" />
              <span>History &amp; Limits</span>
            </button>

            <button
              onClick={() => setActiveTab('appearance')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                activeTab === 'appearance'
                  ? 'bg-surface-container text-primary font-semibold border-l-2 border-primary'
                  : 'text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface'
              }`}
            >
              <Palette className="w-4 h-4 text-tertiary" />
              <span>Theme &amp; UI</span>
            </button>

            <button
              onClick={() => setActiveTab('storage')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                activeTab === 'storage'
                  ? 'bg-surface-container text-primary font-semibold border-l-2 border-primary'
                  : 'text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface'
              }`}
            >
              <FileJson className="w-4 h-4 text-primary" />
              <span>Persistent JSON</span>
            </button>

            <div className="pt-4 mt-auto">
              <div className="p-2.5 rounded-lg bg-surface-container-lowest border border-surface-container-high/60">
                <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  <span>Go Backend Active</span>
                </div>
                <p className="text-[10px] text-on-surface-variant mt-1">
                  Storage auto-syncs to disk JSON files without external daemon requirements.
                </p>
              </div>
            </div>
          </aside>

          {/* Settings Panel Content */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-surface-container-lowest">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                  <Zap className="w-4 h-4 animate-spin text-primary" />
                  <span>Memuat konfigurasi...</span>
                </div>
              </div>
            ) : (
              <>
                {/* TAB 1: General & Query */}
                {activeTab === 'general' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold text-on-surface">General Database Preferences</h3>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        Pengaturan default saat membuka sesi baru di Table Editor &amp; SQL Scratchpad
                      </p>
                    </div>

                    <div className="space-y-4">
                      {/* Autocommit Default */}
                      <div className="flex items-center justify-between p-3.5 rounded-lg bg-surface-container-low border border-surface-container-high/60">
                        <div>
                          <div className="text-xs font-medium text-on-surface">Autocommit Secara Default</div>
                          <div className="text-[11px] text-on-surface-variant">
                            Eksekusi setiap pernyataan DML (INSERT, UPDATE, DELETE) secara langsung tanpa perlu eksplisit COMMIT
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.autocommit_default}
                            onChange={(e) =>
                              setSettings({ ...settings, autocommit_default: e.target.checked })
                            }
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                      </div>

                      {/* Default Page Size */}
                      <div className="p-3.5 rounded-lg bg-surface-container-low border border-surface-container-high/60 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs font-medium text-on-surface">Default Table Page Size (LIMIT)</div>
                            <div className="text-[11px] text-on-surface-variant">
                              Banyaknya baris yang diambil pertama kali saat membuka tabel
                            </div>
                          </div>
                          <select
                            value={settings.default_page_size}
                            onChange={(e) =>
                              setSettings({ ...settings, default_page_size: parseInt(e.target.value) || 25 })
                            }
                            className="bg-surface-container-lowest text-on-surface font-code-sm text-xs px-2.5 py-1.5 rounded border border-surface-container-high focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value={15}>15 baris</option>
                            <option value={25}>25 baris (Rekomendasi)</option>
                            <option value={50}>50 baris</option>
                            <option value={100}>100 baris</option>
                            <option value={200}>200 baris</option>
                          </select>
                        </div>
                      </div>

                      {/* Statement Timeout */}
                      <div className="p-3.5 rounded-lg bg-surface-container-low border border-surface-container-high/60 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs font-medium text-on-surface">Statement Timeout (ms)</div>
                            <div className="text-[11px] text-on-surface-variant">
                              Batas maksimal eksekusi query PostgreSQL sebelum di-abort secara otomatis
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1000}
                              max={600000}
                              step={5000}
                              value={settings.statement_timeout_ms}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  statement_timeout_ms: parseInt(e.target.value) || 30000,
                                })
                              }
                              className="w-24 bg-surface-container-lowest text-on-surface font-code-sm text-xs px-2.5 py-1.5 rounded border border-surface-container-high focus:outline-none focus:ring-1 focus:ring-primary text-right"
                            />
                            <span className="text-xs text-on-surface-variant">ms</span>
                          </div>
                        </div>
                      </div>

                      {/* Catalog Scope */}
                      <div className="p-3.5 rounded-lg bg-surface-container-low border border-surface-container-high/60">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs font-medium text-on-surface">Default Catalog Scope</div>
                            <div className="text-[11px] text-on-surface-variant">
                              Schema default yang ditampilkan di sidebar navigasi
                            </div>
                          </div>
                          <select
                            value={settings.catalog_scope}
                            onChange={(e) =>
                              setSettings({ ...settings, catalog_scope: e.target.value })
                            }
                            className="bg-surface-container-lowest text-on-surface font-code-sm text-xs px-2.5 py-1.5 rounded border border-surface-container-high focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="public">public schema only</option>
                            <option value="all">all schemas (including system)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: History & Limits */}
                {activeTab === 'query' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold text-on-surface">Query History &amp; Cache Limits</h3>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        Menentukan batas maksimal riwayat query yang dicatat di backend
                      </p>
                    </div>

                    <div className="p-4 rounded-lg bg-surface-container-low border border-surface-container-high/60 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-medium text-on-surface">
                            Maksimal Riwayat Query (Query History Retention)
                          </div>
                          <div className="text-[11px] text-on-surface-variant">
                            Jumlah query terakhir yang disimpan di <code>backend-go/data/query_history.json</code> (Default: 50)
                          </div>
                        </div>
                        <input
                          type="number"
                          min={10}
                          max={500}
                          step={10}
                          value={settings.max_query_history}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              max_query_history: Math.max(10, parseInt(e.target.value) || 50),
                            })
                          }
                          className="w-20 bg-surface-container-lowest text-on-surface font-code-sm text-xs px-2.5 py-1.5 rounded border border-surface-container-high focus:outline-none focus:ring-1 focus:ring-primary text-center font-bold text-primary"
                        />
                      </div>

                      <div className="text-[11px] text-on-surface-variant/80 bg-surface-container-lowest p-2.5 rounded border border-surface-container-high/40 flex items-start gap-2">
                        <Terminal className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <div>
                          Query yang melebihi batas ini akan otomatis di-rotasi (FIFO - First In, First Out) oleh backend Go saat menyimpan query baru.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: Theme & Appearance */}
                {activeTab === 'appearance' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-on-surface">Preset Tema &amp; Tampilan</h3>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          Pilih palet warna preferensi atau buka Theme Master untuk kustomisasi mendalam
                        </p>
                      </div>
                      {onOpenThemeMaster && (
                        <button
                          onClick={onOpenThemeMaster}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-xs text-primary font-medium hover:bg-primary/10 transition-colors cursor-pointer border border-primary/30"
                        >
                          <Palette className="w-3.5 h-3.5" />
                          <span>Buka Theme Master</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {[
                        {
                          id: 'emerald-dark',
                          name: 'Emerald Deep Dark (Supabase)',
                          desc: 'Sleek dark mode with vibrant emerald accents',
                          color: '#10b981',
                        },
                        {
                          id: 'cyberpunk-slate',
                          name: 'Cyberpunk Slate',
                          desc: 'Electric cyan & neon violet accents',
                          color: '#06b6d4',
                        },
                        {
                          id: 'deep-midnight',
                          name: 'Deep Midnight Blue',
                          desc: 'Ultra dark navy with royal blue highlights',
                          color: '#3b82f6',
                        },
                        {
                          id: 'minimal-studio',
                          name: 'Minimal Studio Mono',
                          desc: 'High contrast monochrome clean style',
                          color: '#a855f7',
                        },
                      ].map((preset) => {
                        const isSelected = settings.theme_preset === preset.id;
                        return (
                          <div
                            key={preset.id}
                            onClick={() => setSettings({ ...settings, theme_preset: preset.id })}
                            className={`p-3 rounded-lg border cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-surface-container border-primary shadow-sm ring-1 ring-primary'
                                : 'bg-surface-container-low border-surface-container-high/60 hover:border-outline-variant/60'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-semibold text-on-surface">
                                {preset.name}
                              </span>
                              <div
                                className="w-3.5 h-3.5 rounded-full border border-surface-container-highest"
                                style={{ backgroundColor: preset.color }}
                              />
                            </div>
                            <p className="text-[11px] text-on-surface-variant">{preset.desc}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* TAB 4: Storage */}
                {activeTab === 'storage' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold text-on-surface">Penyimpanan Data Disk (JSON)</h3>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        Semua data aplikasi tersimpan permanen di direktori <code>backend-go/data/</code>
                      </p>
                    </div>

                    <div className="space-y-3">
                      {[
                        {
                          file: 'backend-go/data/settings.json',
                          desc: 'Menyimpan preferensi master (max history, page size, autocommit, timeout, preset).',
                          icon: Sliders,
                        },
                        {
                          file: 'backend-go/data/connections.json',
                          desc: 'Menyimpan daftar koneksi PostgreSQL cluster yang telah ditambahkan atau diedit.',
                          icon: Database,
                        },
                        {
                          file: 'backend-go/data/query_history.json',
                          desc: 'Menyimpan riwayat eksekusi query SQL dengan batas kuota sesuai pengaturan.',
                          icon: Clock,
                        },
                      ].map((item, idx) => {
                        const Icon = item.icon;
                        return (
                          <div
                            key={idx}
                            className="p-3.5 rounded-lg bg-surface-container-low border border-surface-container-high/60 flex items-start gap-3"
                          >
                            <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center shrink-0">
                              <Icon className="w-4 h-4 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <code className="text-xs font-mono font-semibold text-primary">
                                {item.file}
                              </code>
                              <p className="text-[11px] text-on-surface-variant mt-0.5">
                                {item.desc}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </main>
        </div>

        {/* Modal Footer */}
        <div className="h-14 px-4 bg-surface-container-low border-t border-surface-container-high flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            <span>Perubahan disimpan langsung ke file JSON lokal</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-primary text-on-primary hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? <Zap className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Simpan Pengaturan</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
