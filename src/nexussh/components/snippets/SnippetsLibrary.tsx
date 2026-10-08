import React, { useState } from 'react';
import {
  Code2,
  Copy,
  Plus,
  Search,
  Trash2,
  Globe,
  Server,
  Edit2,
  Check,
  Terminal,
  Database,
  Sparkles,
} from 'lucide-react';
import { Snippet, Host } from 'nexussh/types/ssh';
import { Button } from 'nexussh/components/ui/button';
import { Dialog } from 'nexussh/components/ui/dialog';
import { Input, Textarea } from 'nexussh/components/ui/input';
import { Switch } from 'nexussh/components/ui/switch';
import { Label } from 'nexussh/components/ui/label';
import { useToast } from 'nexussh/components/ui/toast';
import { cn } from 'nexussh/utils/cn';

interface SnippetsLibraryProps {
  snippets: Snippet[];
  hosts: Host[];
  onAddSnippet: (snippet: Snippet) => void;
  onUpdateSnippet: (snippet: Snippet) => void;
  onDeleteSnippet: (snippetId: string) => void;
}

export function SnippetsLibrary({
  snippets,
  hosts,
  onAddSnippet,
  onUpdateSnippet,
  onDeleteSnippet,
}: SnippetsLibraryProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'pg' | 'docker' | 'global'>('all');

  // New snippet modal state
  const [isNewSnippetModalOpen, setIsNewSnippetModalOpen] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [newScript, setNewScript] = useState('');
  const [newIsGlobal, setNewIsGlobal] = useState(true);
  const [selectedHostIds, setSelectedHostIds] = useState<string[]>([]);
  const [hostSearchFilter, setHostSearchFilter] = useState('');

  // Edit snippet modal state
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editScript, setEditScript] = useState('');
  const [editIsGlobal, setEditIsGlobal] = useState(true);
  const [editSelectedHostIds, setEditSelectedHostIds] = useState<string[]>([]);
  const [editHostSearchFilter, setEditHostSearchFilter] = useState('');

  const filteredSnippets = snippets.filter((s) => {
    const q = searchQuery.toLowerCase();
    const desc = (s.description || (s as any).title || '').toLowerCase();
    const scr = (s.script || (s as any).command || '').toLowerCase();
    const matchesSearch = desc.includes(q) || scr.includes(q);

    if (!matchesSearch) return false;

    if (categoryFilter === 'pg') {
      return (
        desc.includes('pg') ||
        desc.includes('postgres') ||
        scr.includes('psql') ||
        scr.includes('postgres')
      );
    }
    if (categoryFilter === 'docker') {
      return (
        desc.includes('docker') ||
        scr.includes('docker')
      );
    }
    if (categoryFilter === 'global') {
      return !s.targetHostIds || s.targetHostIds.length === 0;
    }

    return true;
  });

  const handleCopyScript = (snipId: string, scriptText: string, desc: string) => {
    navigator.clipboard.writeText(scriptText);
    setCopiedId(snipId);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: 'Script disalin ke clipboard', description: desc, type: 'info' });
  };

  const handleOpenCreateModal = () => {
    setNewDescription('');
    setNewScript('');
    setNewIsGlobal(true);
    setSelectedHostIds([]);
    setHostSearchFilter('');
    setIsNewSnippetModalOpen(true);
  };

  const handleCreateSnippet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScript.trim()) {
      toast({ title: 'Validasi Gagal', description: 'Perintah script wajib diisi.', type: 'error' });
      return;
    }

    const targetIds = newIsGlobal ? [] : selectedHostIds;

    const created: Snippet = {
      id: `snip-${Date.now()}`,
      description: newDescription.trim() || 'Custom snippet',
      script: newScript.trim(),
      targetHostIds: targetIds,
    };

    onAddSnippet(created);
    toast({
      title: 'Snippet tersimpan',
      description: targetIds.length === 0 ? 'Tersedia untuk semua server (Global)' : `Ditugaskan ke ${targetIds.length} server`,
      type: 'success',
    });

    setIsNewSnippetModalOpen(false);
  };

  const handleOpenEdit = (snip: Snippet) => {
    setEditingSnippet(snip);
    setEditDescription(snip.description);
    setEditScript(snip.script);
    const isGlob = !snip.targetHostIds || snip.targetHostIds.length === 0;
    setEditIsGlobal(isGlob);
    setEditSelectedHostIds(snip.targetHostIds || []);
    setEditHostSearchFilter('');
  };

  const handleUpdateSnippetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSnippet) return;
    if (!editScript.trim()) {
      toast({ title: 'Validasi Gagal', description: 'Script wajib diisi.', type: 'error' });
      return;
    }

    const targetIds = editIsGlobal ? [] : editSelectedHostIds;

    const updated: Snippet = {
      ...editingSnippet,
      description: editDescription.trim() || 'Custom snippet',
      script: editScript.trim(),
      targetHostIds: targetIds,
    };

    onUpdateSnippet(updated);
    toast({ title: 'Snippet diperbarui', description: updated.description, type: 'success' });
    setEditingSnippet(null);
  };

  const getScopeLabel = (targetIds?: string[]) => {
    if (!targetIds || targetIds.length === 0) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <Globe className="w-3 h-3 shrink-0" />
          <span>Global (Semua Host)</span>
        </span>
      );
    }

    const names = targetIds
      .map((id) => hosts.find((h) => h.id === id)?.name || id)
      .join(', ');

    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-secondary/10 text-secondary border border-secondary/20 truncate max-w-xs" title={names}>
        <Server className="w-3 h-3 shrink-0" />
        <span className="truncate">{names}</span>
      </span>
    );
  };

  const getSnippetCategoryBadge = (desc: string, scr: string) => {
    const d = (desc + ' ' + scr).toLowerCase();
    if (d.includes('psql') || d.includes('postgres') || d.includes('pg_') || d.includes('database')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/25">
          <Database className="w-2.5 h-2.5" />
          <span>PostgreSQL</span>
        </span>
      );
    }
    if (d.includes('docker') || d.includes('container')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/25">
          <Sparkles className="w-2.5 h-2.5" />
          <span>Docker</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-container-high text-on-surface-variant border border-surface-container-highest">
        <Terminal className="w-2.5 h-2.5" />
        <span>System</span>
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full bg-surface text-on-surface overflow-y-auto">
      {/* Top Banner Toolbar */}
      <div className="border-b border-surface-container-high/60 bg-surface-container-low/70 backdrop-blur-sm sticky top-0 z-10 p-3 sm:p-4 px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 max-w-8xl mx-auto w-full">
          {/* Header Title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 border border-primary/20 shadow-xs">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-on-surface tracking-tight">
                  Snippets
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-surface-container text-on-surface-variant border border-surface-container-high">
                  {snippets.length} Script
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant/80 hidden sm:block">
                Koleksi perintah bash, maintenance PostgreSQL, Docker container, dan automasi server
              </p>
            </div>
          </div>

          {/* Search, Filter Pills & Add Action */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-60 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant pointer-events-none" />
              <input
                type="text"
                placeholder="Cari nama script atau perintah..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-8 pr-7 text-xs rounded-lg bg-surface-container border border-surface-container-high text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="hidden lg:flex items-center gap-1 p-0.5 rounded-lg bg-surface-container border border-surface-container-high text-xs">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'pg', label: 'PostgreSQL' },
                  { id: 'docker', label: 'Docker' },
                  { id: 'global', label: 'Global' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setCategoryFilter(tab.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer',
                    categoryFilter === tab.id
                      ? 'bg-surface-container-high text-on-surface font-semibold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <Button size="sm" onClick={handleOpenCreateModal} className="gap-1.5 shrink-0 shadow-sm">
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Snippet</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Snippets Bento Cards Grid */}
      <div className="p-4 sm:p-6 max-w-8xl w-full mx-auto space-y-4">
        {filteredSnippets.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 sm:p-16 border border-dashed border-surface-container-high rounded-2xl text-center bg-surface-container-low/40">
            <div className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center text-on-surface-variant mb-3 border border-surface-container-high">
              <Code2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-on-surface">Tidak ada snippet yang cocok</h3>
            <p className="text-xs text-on-surface-variant/80 mt-1 max-w-sm">
              Coba gunakan kata kunci pencarian lain atau buat snippet baru.
            </p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={handleOpenCreateModal}>
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Snippet Baru</span>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4">
            {filteredSnippets.map((snip) => {
              const isCopied = copiedId === snip.id;
              const displayDesc = snip.description || (snip as any).title || 'DevOps Snippet';
              const displayScript = snip.script || (snip as any).command || '';

              return (
                <div
                  key={snip.id}
                  className="group relative flex flex-col justify-between rounded-xl border border-surface-container-high/80 bg-surface-container-low p-4 shadow-sm hover:shadow-md hover:border-primary/50 transition-all duration-200"
                >
                  {/* Top Row: Description, Category Badge & Scope Badge */}
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          {getSnippetCategoryBadge(displayDesc, displayScript)}
                          <div className="shrink-0">{getScopeLabel(snip.targetHostIds)}</div>
                        </div>
                        <h3 className="text-sm font-bold text-on-surface tracking-tight group-hover:text-primary transition-colors">
                          {displayDesc}
                        </h3>
                      </div>
                    </div>

                    {/* Syntax Code block preview with prompt */}
                    <div className="relative rounded-lg bg-surface-container border border-surface-container-high/60 p-3 font-mono text-xs text-on-surface overflow-x-auto select-all leading-relaxed group/code">
                      <div className="flex items-start gap-2">
                        <span className="text-emerald-400 font-bold select-none shrink-0">❯</span>
                        <code className="text-on-surface break-all">{displayScript}</code>
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="mt-3.5 pt-3 border-t border-surface-container-high/60 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-on-surface-variant/70">
                      Bash / Shell
                    </span>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant={isCopied ? 'subtle' : 'secondary'}
                        onClick={() => handleCopyScript(snip.id, displayScript, displayDesc)}
                        className="gap-1.5 text-xs h-7.5 px-3"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400 font-semibold">Tersalin!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Salin Script</span>
                          </>
                        )}
                      </Button>

                      <button
                        onClick={() => handleOpenEdit(snip)}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                        title="Edit Snippet"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => {
                          if (confirm(`Hapus snippet "${displayDesc}"?`)) {
                            onDeleteSnippet(snip.id);
                            toast({ title: 'Snippet dihapus', type: 'info' });
                          }
                        }}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Hapus Snippet"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Snippet Modal */}
      <Dialog
        open={isNewSnippetModalOpen}
        onOpenChange={setIsNewSnippetModalOpen}
        title="Tambah Snippet Baru"
        description="Simpan perintah bash / script untuk dieksekusi dengan cepat di terminal"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateSnippet} className="space-y-4 text-xs font-sans">
          <div className="space-y-1.5">
            <Label htmlFor="new-desc" required>
              Judul / Deskripsi Snippet
            </Label>
            <Input
              id="new-desc"
              placeholder="e.g. PostgreSQL Vacuum & Analyze Database"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-script" required>
              Perintah Script (Bash / CLI)
            </Label>
            <Textarea
              id="new-script"
              placeholder="sudo -u postgres psql -c 'VACUUM VERBOSE ANALYZE;'"
              value={newScript}
              onChange={(e) => setNewScript(e.target.value)}
              rows={4}
              required
              className="font-mono text-xs"
            />
          </div>

          {/* Scope Host Switcher */}
          <div className="space-y-2 pt-2 border-t border-surface-container-high/80">
            <div className="flex items-center justify-between">
              <div>
                <Label>Ketersediaan Global</Label>
                <p className="text-[11px] text-on-surface-variant/80">
                  Tersedia untuk semua server SSH (tanpa batas host spesifik)
                </p>
              </div>
              <Switch checked={newIsGlobal} onCheckedChange={setNewIsGlobal} />
            </div>

            {!newIsGlobal && (
              <div className="space-y-2 pt-2">
                <Label>Pilih Server Tertarget</Label>
                <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 rounded-lg bg-surface-container border border-surface-container-high">
                  {hosts.map((h) => {
                    const isSelected = selectedHostIds.includes(h.id);
                    return (
                      <button
                        type="button"
                        key={h.id}
                        onClick={() => {
                          setSelectedHostIds((prev) =>
                            isSelected ? prev.filter((id) => id !== h.id) : [...prev, h.id]
                          );
                        }}
                        className={cn(
                          'w-full flex items-center justify-between p-2 rounded-md text-left transition-colors cursor-pointer text-xs',
                          isSelected
                            ? 'bg-primary/15 text-primary border border-primary/30 font-semibold'
                            : 'hover:bg-surface-container-high text-on-surface'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Server className="w-3.5 h-3.5 text-secondary" />
                          <span>{h.name}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-container-high/80">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsNewSnippetModalOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" size="sm">
              Simpan Snippet
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Snippet Modal */}
      <Dialog
        open={editingSnippet !== null}
        onOpenChange={(open) => !open && setEditingSnippet(null)}
        title="Edit Snippet"
        description="Perbarui perintah atau penugasan server snippet"
        maxWidth="lg"
      >
        <form onSubmit={handleUpdateSnippetSubmit} className="space-y-4 text-xs font-sans">
          <div className="space-y-1.5">
            <Label htmlFor="edit-desc" required>
              Judul / Deskripsi Snippet
            </Label>
            <Input
              id="edit-desc"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-script" required>
              Perintah Script (Bash / CLI)
            </Label>
            <Textarea
              id="edit-script"
              value={editScript}
              onChange={(e) => setEditScript(e.target.value)}
              rows={4}
              required
              className="font-mono text-xs"
            />
          </div>

          {/* Scope Host Switcher */}
          <div className="space-y-2 pt-2 border-t border-surface-container-high/80">
            <div className="flex items-center justify-between">
              <div>
                <Label>Ketersediaan Global</Label>
                <p className="text-[11px] text-on-surface-variant/80">
                  Tersedia untuk semua server SSH (tanpa batas host spesifik)
                </p>
              </div>
              <Switch checked={editIsGlobal} onCheckedChange={setEditIsGlobal} />
            </div>

            {!editIsGlobal && (
              <div className="space-y-2 pt-2">
                <Label>Pilih Server Tertarget</Label>
                <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 rounded-lg bg-surface-container border border-surface-container-high">
                  {hosts.map((h) => {
                    const isSelected = editSelectedHostIds.includes(h.id);
                    return (
                      <button
                        type="button"
                        key={h.id}
                        onClick={() => {
                          setEditSelectedHostIds((prev) =>
                            isSelected ? prev.filter((id) => id !== h.id) : [...prev, h.id]
                          );
                        }}
                        className={cn(
                          'w-full flex items-center justify-between p-2 rounded-md text-left transition-colors cursor-pointer text-xs',
                          isSelected
                            ? 'bg-primary/15 text-primary border border-primary/30 font-semibold'
                            : 'hover:bg-surface-container-high text-on-surface'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Server className="w-3.5 h-3.5 text-secondary" />
                          <span>{h.name}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-container-high/80">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditingSnippet(null)}
            >
              Batal
            </Button>
            <Button type="submit" size="sm">
              Simpan Perubahan
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
