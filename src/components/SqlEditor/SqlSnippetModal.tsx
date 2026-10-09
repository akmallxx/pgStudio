import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Bookmark,
  Search,
  Plus,
  Trash2,
  Copy,
  Check,
  CornerDownLeft,
  X,
  FileCode,
  Layers,
  Database,
  Activity,
  User,
} from 'lucide-react';

export interface SqlSnippetItem {
  id: string;
  title: string;
  category: 'crud' | 'schema' | 'server' | 'custom';
  sql: string;
  isDefault?: boolean;
}

export const DEFAULT_SQL_SNIPPETS: SqlSnippetItem[] = [
  {
    id: 'def-select-limit',
    title: 'Select Data dengan Limit',
    category: 'crud',
    sql: 'SELECT * FROM public.nama_tabel ORDER BY id DESC LIMIT 25;',
    isDefault: true,
  },
  {
    id: 'def-insert-row',
    title: 'Insert Baris Baru',
    category: 'crud',
    sql: "INSERT INTO public.nama_tabel (kolom1, kolom2)\nVALUES ('nilai1', 'nilai2')\nRETURNING *;",
    isDefault: true,
  },
  {
    id: 'def-update-row',
    title: 'Update Baris berdasarkan ID',
    category: 'crud',
    sql: "UPDATE public.nama_tabel\nSET kolom1 = 'nilai_baru'\nWHERE id = 1\nRETURNING *;",
    isDefault: true,
  },
  {
    id: 'def-delete-row',
    title: 'Hapus Baris berdasarkan ID',
    category: 'crud',
    sql: 'DELETE FROM public.nama_tabel\nWHERE id = 1\nRETURNING id;',
    isDefault: true,
  },
  {
    id: 'def-group-count',
    title: 'Hitung Agregat Group By',
    category: 'crud',
    sql: 'SELECT status, COUNT(*) AS total\nFROM public.nama_tabel\nGROUP BY status\nORDER BY total DESC;',
    isDefault: true,
  },
  {
    id: 'def-list-tables',
    title: 'Daftar Semua Tabel di Database',
    category: 'schema',
    sql: "SELECT table_schema, table_name\nFROM information_schema.tables\nWHERE table_schema NOT IN ('pg_catalog', 'information_schema')\nORDER BY table_schema, table_name;",
    isDefault: true,
  },
  {
    id: 'def-table-sizes',
    title: '10 Tabel dengan Ukuran Disk Terbesar',
    category: 'schema',
    sql: "SELECT\n  relname AS nama_tabel,\n  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_ukuran\nFROM pg_class c\nJOIN pg_namespace n ON n.oid = c.relnamespace\nWHERE n.nspname = 'public' AND c.relkind = 'r'\nORDER BY pg_total_relation_size(c.oid) DESC\nLIMIT 10;",
    isDefault: true,
  },
  {
    id: 'def-db-size',
    title: 'Ukuran Total Database Saat Ini',
    category: 'schema',
    sql: 'SELECT\n  current_database() AS nama_db,\n  pg_size_pretty(pg_database_size(current_database())) AS ukuran_db;',
    isDefault: true,
  },
  {
    id: 'def-running-queries',
    title: 'Daftar Query yang Sedang Berjalan',
    category: 'server',
    sql: "SELECT\n  pid,\n  NOW() - query_start AS durasi,\n  state,\n  query\nFROM pg_stat_activity\nWHERE state != 'idle' AND pid <> pg_backend_pid()\nORDER BY durasi DESC;",
    isDefault: true,
  },
  {
    id: 'def-kill-pid',
    title: 'Hentikan Proses Query Gantung (Kill PID)',
    category: 'server',
    sql: 'SELECT pg_terminate_backend(12345);',
    isDefault: true,
  },
];

const STORAGE_KEY = 'pgstudio_sql_custom_snippets';

interface SqlSnippetModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEditorSql: string;
  onApplySnippet: (sql: string) => void;
  onShowToast: (message: string, icon?: string, isError?: boolean) => void;
}

export const SqlSnippetModal: React.FC<SqlSnippetModalProps> = ({
  isOpen,
  onClose,
  currentEditorSql,
  onApplySnippet,
  onShowToast,
}) => {
  const [customSnippets, setCustomSnippets] = useState<SqlSnippetItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return [];
  });

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'custom' | 'crud' | 'schema' | 'server'>('all');
  const [newTitle, setNewTitle] = useState('');
  const [isSavingCurrent, setIsSavingCurrent] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input saat modal terbuka
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearch('');
      setIsSavingCurrent(false);
      setNewTitle('');
    }
  }, [isOpen]);

  // Simpan custom snippets ke localStorage
  const saveCustomSnippets = (list: SqlSnippetItem[]) => {
    setCustomSnippets(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (_) {}
  };

  const allSnippets = useMemo(() => {
    return [...customSnippets, ...DEFAULT_SQL_SNIPPETS];
  }, [customSnippets]);

  const filteredSnippets = useMemo(() => {
    return allSnippets.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false;
      }
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.sql.toLowerCase().includes(q)
      );
    });
  }, [allSnippets, categoryFilter, search]);

  const handleSaveCurrentQuery = (e: React.FormEvent) => {
    e.preventDefault();
    const queryToSave = currentEditorSql.trim();
    if (!queryToSave) {
      onShowToast('Query di editor masih kosong', 'warning', true);
      return;
    }
    const title = newTitle.trim() || `Query Snippet #${customSnippets.length + 1}`;
    const newSnippet: SqlSnippetItem = {
      id: `custom-${Date.now()}`,
      title,
      category: 'custom',
      sql: queryToSave,
      isDefault: false,
    };

    const nextList = [newSnippet, ...customSnippets];
    saveCustomSnippets(nextList);
    setNewTitle('');
    setIsSavingCurrent(false);
    setCategoryFilter('custom');
    onShowToast(`Snippet "${title}" berhasil disimpan`, 'check_circle');
  };

  const handleDeleteCustom = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextList = customSnippets.filter((s) => s.id !== id);
    saveCustomSnippets(nextList);
    onShowToast(`Snippet "${title}" dihapus`, 'delete');
  };

  const handleCopySql = (item: SqlSnippetItem, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(item.sql);
    setCopiedId(item.id);
    onShowToast('SQL disalin ke clipboard', 'content_copy');
    setTimeout(() => {
      setCopiedId(null);
    }, 1500);
  };

  const handleSelectSnippet = (sql: string) => {
    onApplySnippet(sql);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-4 select-none animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-surface-container-low border border-surface-container-high rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-on-surface"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-container-high/60 bg-surface-container">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">SQL Snippets Library</h3>
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-mono">
              {allSnippets.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded cursor-pointer transition-colors"
            title="Tutup (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action & Search Bar */}
        <div className="p-3 border-b border-surface-container-high/50 bg-surface-container-lowest/50 space-y-2.5">
          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari snippet atau perintah SQL..."
                className="w-full bg-surface-container pl-8 pr-3 py-1.5 rounded-lg text-xs text-on-surface placeholder:text-on-surface-variant/50 border border-outline-variant/30 focus:outline-none focus:border-primary transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface cursor-pointer text-xs"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Tombol Simpan Query Saat Ini */}
            <button
              onClick={() => setIsSavingCurrent(!isSavingCurrent)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                isSavingCurrent
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-surface-container hover:bg-surface-container-high text-primary border-outline-variant/30'
              }`}
              title="Simpan query yang sedang aktif di editor"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Simpan Query Ini</span>
            </button>
          </div>

          {/* Form Cepat Simpan Snippet */}
          {isSavingCurrent && (
            <form
              onSubmit={handleSaveCurrentQuery}
              className="p-2.5 rounded-lg bg-surface-container border border-primary/30 flex items-center gap-2 animate-in fade-in duration-100"
            >
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Beri nama snippet (contoh: Laporan Penjualan Harian)..."
                autoFocus
                className="flex-1 bg-surface-container-lowest px-2.5 py-1.5 rounded text-xs text-on-surface placeholder:text-on-surface-variant/50 border border-outline-variant/40 focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-primary text-on-primary rounded text-xs font-semibold hover:bg-primary/90 transition-colors cursor-pointer shrink-0"
              >
                Simpan
              </button>
              <button
                type="button"
                onClick={() => setIsSavingCurrent(false)}
                className="px-2 py-1.5 text-on-surface-variant hover:text-on-surface rounded text-xs cursor-pointer"
              >
                Batal
              </button>
            </form>
          )}

          {/* Filter Kategori Ringkas */}
          <div className="flex items-center gap-1 overflow-x-auto text-[11px] pt-0.5">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium ${
                categoryFilter === 'all'
                  ? 'bg-primary/15 text-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              Semua ({allSnippets.length})
            </button>
            <button
              onClick={() => setCategoryFilter('custom')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium flex items-center gap-1 ${
                categoryFilter === 'custom'
                  ? 'bg-primary/15 text-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <User className="w-3 h-3" />
              <span>Tersimpan ({customSnippets.length})</span>
            </button>
            <button
              onClick={() => setCategoryFilter('crud')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium flex items-center gap-1 ${
                categoryFilter === 'crud'
                  ? 'bg-primary/15 text-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>CRUD Dasar</span>
            </button>
            <button
              onClick={() => setCategoryFilter('schema')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium flex items-center gap-1 ${
                categoryFilter === 'schema'
                  ? 'bg-primary/15 text-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <Database className="w-3 h-3" />
              <span>Skema & Tabel</span>
            </button>
            <button
              onClick={() => setCategoryFilter('server')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium flex items-center gap-1 ${
                categoryFilter === 'server'
                  ? 'bg-primary/15 text-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <Activity className="w-3 h-3" />
              <span>Server & Proses</span>
            </button>
          </div>
        </div>

        {/* Snippets List Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 divide-y divide-surface-container-high/30">
          {filteredSnippets.length === 0 ? (
            <div className="py-12 text-center text-on-surface-variant space-y-2">
              <FileCode className="w-8 h-8 mx-auto opacity-30" />
              <p className="text-xs">Tidak ada snippet yang cocok dengan pencarian.</p>
            </div>
          ) : (
            filteredSnippets.map((item) => (
              <div
                key={item.id}
                onClick={() => handleSelectSnippet(item.sql)}
                className="group pt-2 first:pt-0 flex flex-col gap-1.5 p-2 rounded-lg hover:bg-surface-container/60 transition-colors cursor-pointer border border-transparent hover:border-surface-container-high"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-xs text-on-surface truncate">
                      {item.title}
                    </span>
                    {item.isDefault ? (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface-variant font-medium">
                        Default
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 font-medium">
                        Kustom
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => handleCopySql(item, e)}
                      className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
                      title="Salin query ke clipboard"
                    >
                      {copiedId === item.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {!item.isDefault && (
                      <button
                        onClick={(e) => handleDeleteCustom(item.id, item.title, e)}
                        className="p-1 rounded text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
                        title="Hapus snippet ini"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <div className="hidden group-hover:flex items-center gap-1 pl-1 text-[11px] font-medium text-primary">
                      <span>Gunakan</span>
                      <CornerDownLeft className="w-3 h-3" />
                    </div>
                  </div>
                </div>

                {/* Monospace Code Preview */}
                <div className="bg-surface-container-lowest px-2.5 py-1.5 rounded border border-surface-container-high/40 text-[11px] font-mono text-on-surface-variant/90 line-clamp-2 overflow-hidden whitespace-pre">
                  {item.sql}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Hint */}
        <div className="px-4 py-2 border-t border-surface-container-high/60 bg-surface-container flex items-center justify-between text-[11px] text-on-surface-variant">
          <span>Klik baris snippet untuk langsung memuat ke editor</span>
          <span className="font-mono text-[10px]">Esc untuk tutup</span>
        </div>
      </div>
    </div>
  );
};
