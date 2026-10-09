import React, { useState, useMemo } from 'react';
import {
  Code2,
  Search,
  Plus,
  Trash2,
  Copy,
  Check,
  X,
  Play,
  ClipboardPaste,
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
    title: '10 Tabel Ukuran Disk Terbesar',
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
    title: 'Daftar Query Berjalan (Active)',
    category: 'server',
    sql: "SELECT\n  pid,\n  NOW() - query_start AS durasi,\n  state,\n  query\nFROM pg_stat_activity\nWHERE state != 'idle' AND pid <> pg_backend_pid()\nORDER BY durasi DESC;",
    isDefault: true,
  },
  {
    id: 'def-kill-pid',
    title: 'Hentikan Query Gantung (Kill PID)',
    category: 'server',
    sql: 'SELECT pg_terminate_backend(12345);',
    isDefault: true,
  },
];

const STORAGE_KEY = 'pgstudio_sql_custom_snippets';

interface SqlSnippetsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentEditorSql: string;
  onPasteSnippet: (sql: string) => void;
  onRunSnippet: (sql: string) => void;
  onShowToast: (message: string, icon?: string, isError?: boolean) => void;
}

export const SqlSnippetsDrawer: React.FC<SqlSnippetsDrawerProps> = ({
  isOpen,
  onClose,
  currentEditorSql,
  onPasteSnippet,
  onRunSnippet,
  onShowToast,
}) => {
  const [customSnippets, setCustomSnippets] = useState<SqlSnippetItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return [];
  });

  const [snippetSearch, setSnippetSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'custom' | 'crud' | 'schema' | 'server'>('all');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
      if (!snippetSearch.trim()) return true;
      const q = snippetSearch.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.sql.toLowerCase().includes(q)
      );
    });
  }, [allSnippets, categoryFilter, snippetSearch]);

  const handleSaveSnippet = (e: React.FormEvent) => {
    e.preventDefault();
    const sqlToSave = currentEditorSql.trim();
    if (!sqlToSave) {
      onShowToast('Query di editor masih kosong', 'warning', true);
      return;
    }

    const title = newTitle.trim() || `Snippet Kustom #${customSnippets.length + 1}`;
    const newSnippet: SqlSnippetItem = {
      id: `custom-${Date.now()}`,
      title,
      category: 'custom',
      sql: sqlToSave,
      isDefault: false,
    };

    const nextList = [newSnippet, ...customSnippets];
    saveCustomSnippets(nextList);
    setNewTitle('');
    setIsAddingNew(false);
    setCategoryFilter('custom');
    onShowToast(`Snippet "${title}" disimpan`, 'check_circle');
  };

  const handleDelete = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextList = customSnippets.filter((s) => s.id !== id);
    saveCustomSnippets(nextList);
    onShowToast(`Snippet "${title}" dihapus`, 'delete');
  };

  const handleCopy = (item: SqlSnippetItem, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(item.sql);
    setCopiedId(item.id);
    onShowToast('Query disalin ke clipboard', 'content_copy');
    setTimeout(() => setCopiedId(null), 1500);
  };

  if (!isOpen) return null;

  return (
    <aside className="w-80 sm:w-84 border-l border-surface-container-high bg-surface-container-low flex flex-col shrink-0 overflow-hidden font-sans select-none animate-in slide-in-from-right-2 duration-150 shadow-md">
      {/* 1. Drawer Header (Mirip TerminalView) */}
      <div className="flex items-center justify-between p-2.5 sm:p-3 border-b border-surface-container-high bg-surface-container-low/90 shrink-0">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-on-surface">SQL Snippets</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-container-high text-on-surface-variant font-mono">
            {allSnippets.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsAddingNew(!isAddingNew)}
            className={`p-1 rounded-lg transition-colors cursor-pointer ${
              isAddingNew
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
            title="Simpan query editor sebagai snippet baru"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            title="Tutup Drawer Snippets"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Add New Snippet Form (Collapse inline) */}
      {isAddingNew && (
        <form
          onSubmit={handleSaveSnippet}
          className="p-2.5 border-b border-surface-container-high bg-surface-container space-y-2 shrink-0 animate-in fade-in duration-100"
        >
          <div className="text-[11px] font-semibold text-primary flex items-center justify-between">
            <span>Simpan Query Aktif</span>
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="text-on-surface-variant hover:text-on-surface"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Beri nama snippet..."
            autoFocus
            className="w-full px-2.5 py-1.5 text-xs rounded-md bg-surface-container-lowest border border-outline-variant/40 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
          />
          <div className="flex items-center justify-end gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="px-2.5 py-1 rounded text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-3 py-1 rounded bg-primary text-on-primary text-xs font-semibold hover:brightness-110 cursor-pointer shadow-xs"
            >
              Simpan
            </button>
          </div>
        </form>
      )}

      {/* 3. Search and Scope Filter (Mirip TerminalView) */}
      <div className="p-2.5 sm:p-3 border-b border-surface-container-high/60 space-y-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant pointer-events-none" />
          <input
            type="text"
            placeholder="Cari snippet..."
            value={snippetSearch}
            onChange={(e) => setSnippetSearch(e.target.value)}
            className="w-full h-7.5 pl-8 pr-2 text-xs rounded-lg bg-surface-container border border-surface-container-high text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-1 text-[11px] overflow-x-auto pb-0.5">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-2 py-0.5 rounded-md transition-colors font-medium cursor-pointer shrink-0 ${
              categoryFilter === 'all'
                ? 'bg-surface-container-high text-on-surface font-semibold shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Semua ({allSnippets.length})
          </button>
          <button
            onClick={() => setCategoryFilter('crud')}
            className={`px-2 py-0.5 rounded-md transition-colors font-medium cursor-pointer shrink-0 ${
              categoryFilter === 'crud'
                ? 'bg-surface-container-high text-on-surface font-semibold shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            CRUD
          </button>
          <button
            onClick={() => setCategoryFilter('schema')}
            className={`px-2 py-0.5 rounded-md transition-colors font-medium cursor-pointer shrink-0 ${
              categoryFilter === 'schema'
                ? 'bg-surface-container-high text-on-surface font-semibold shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Skema
          </button>
          <button
            onClick={() => setCategoryFilter('server')}
            className={`px-2 py-0.5 rounded-md transition-colors font-medium cursor-pointer shrink-0 ${
              categoryFilter === 'server'
                ? 'bg-surface-container-high text-on-surface font-semibold shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Server
          </button>
          <button
            onClick={() => setCategoryFilter('custom')}
            className={`px-2 py-0.5 rounded-md transition-colors font-medium cursor-pointer shrink-0 ${
              categoryFilter === 'custom'
                ? 'bg-surface-container-high text-primary font-semibold shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Kustom ({customSnippets.length})
          </button>
        </div>
      </div>

      {/* 4. Snippet Items with 1-click Run & Paste (Persis TerminalView) */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {filteredSnippets.length === 0 ? (
          <div className="p-6 text-center text-on-surface-variant text-xs">
            Tidak ada snippet yang cocok.
          </div>
        ) : (
          filteredSnippets.map((snip) => (
            <div
              key={snip.id}
              className="group relative p-2.5 sm:p-3 rounded-xl border border-surface-container-high bg-surface-container hover:bg-surface-container-high hover:border-primary/40 transition-all select-none shadow-xs"
            >
              {/* Top Row: Title + Category Pill + Delete */}
              <div className="flex items-start justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-bold text-on-surface line-clamp-1">
                    {snip.title}
                  </span>
                  {!snip.isDefault && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/15 text-emerald-400 font-semibold shrink-0">
                      User
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => handleCopy(snip, e)}
                    className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                    title="Salin query"
                  >
                    {copiedId === snip.id ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>

                  {!snip.isDefault && (
                    <button
                      onClick={(e) => handleDelete(snip.id, snip.title, e)}
                      className="p-1 rounded text-on-surface-variant hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Hapus snippet"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Script Preview Monospace (Persis TerminalView) */}
              <div className="mt-2 p-2 rounded-lg bg-surface-container-lowest border border-surface-container-high/60 text-[11px] font-mono text-on-surface break-all leading-relaxed line-clamp-3 whitespace-pre">
                {snip.sql}
              </div>

              {/* Action buttons (Paste & Run) */}
              <div className="mt-2 flex items-center justify-end gap-1.5">
                <button
                  onClick={() => onPasteSnippet(snip.sql)}
                  className="px-2 py-0.5 rounded bg-surface-container-highest hover:brightness-110 text-on-surface border border-surface-container-high text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                  title="Muat query ke editor SQL"
                >
                  <ClipboardPaste className="w-3 h-3 text-secondary" />
                  <span>Paste</span>
                </button>

                <button
                  onClick={() => onRunSnippet(snip.sql)}
                  className="px-2 py-0.5 rounded bg-primary hover:brightness-110 text-on-primary text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                  title="Langsung jalankan query ini"
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                  <span>Run</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 5. Footer Hint */}
      <div className="p-2 border-t border-surface-container-high text-[10px] font-mono text-on-surface-variant text-center shrink-0">
        Klik Paste untuk edit • Klik Run untuk langsung eksekusi
      </div>
    </aside>
  );
};
