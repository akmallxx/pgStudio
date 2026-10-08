import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal as TerminalIcon,
  X,
  Plus,
  Play,
  RotateCcw,
  Maximize2,
  Minimize2,
  Trash2,
  Copy,
  ChevronRight,
  FolderTree,
  Sliders,
  Check,
  Code2,
  Search,
  PanelRightClose,
  PanelRightOpen,
  ClipboardPaste,
  Edit2,
  Globe,
  Server,
  Zap,
} from 'lucide-react';
import { SSHSession, TerminalLine, Host, Snippet } from 'nexussh/types/ssh';
import { Button } from 'nexussh/components/ui/button';
import { Dialog } from 'nexussh/components/ui/dialog';
import { Input, Textarea } from 'nexussh/components/ui/input';
import { Checkbox } from 'nexussh/components/ui/checkbox';
import { Switch } from 'nexussh/components/ui/switch';
import { Label } from 'nexussh/components/ui/label';
import { useToast } from 'nexussh/components/ui/toast';
import { cn } from 'nexussh/utils/cn';
import { XtermTerminal } from './XtermTerminal';

interface TerminalViewProps {
  sessions: SSHSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onNewSessionPrompt: () => void;
  onExecuteCommand: (sessionId: string, commandText: string) => void;
  onClearSession: (sessionId: string) => void;
  snippets: Snippet[];
  onOpenSFTPForActiveHost?: (hostId: string) => void;
  onUpdateSnippet?: (snippet: Snippet) => void;
  onAddSnippet?: (snippet: Snippet) => void;
  hosts?: Host[];
}

export function TerminalView({
  sessions,
  activeSessionId,
  onSelectSession,
  onCloseSession,
  onNewSessionPrompt,
  onExecuteCommand,
  onClearSession,
  snippets,
  onOpenSFTPForActiveHost,
  onUpdateSnippet,
  onAddSnippet,
  hosts = [],
}: TerminalViewProps) {
  const { toast } = useToast();
  const [inputCommand, setInputCommand] = useState('');
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSnippetsSidebar, setShowSnippetsSidebar] = useState(true);
  const [snippetSearch, setSnippetSearch] = useState('');
  const [filterScopeOnly, setFilterScopeOnly] = useState(true);

  // Edit snippet dialog state
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editScript, setEditScript] = useState('');
  const [editIsGlobal, setEditIsGlobal] = useState(true);
  const [editSelectedHostIds, setEditSelectedHostIds] = useState<string[]>([]);

  // Add snippet dialog state
  const [isAddSnippetOpen, setIsAddSnippetOpen] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [newScript, setNewScript] = useState('');
  const [newIsGlobal, setNewIsGlobal] = useState(true);
  const [newSelectedHostIds, setNewSelectedHostIds] = useState<string[]>([]);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0] || null;

  // Auto-scroll to bottom on output update
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.lines]);

  const handleContainerClick = () => {
    inputRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;
    const trimmed = inputCommand.trim();
    if (!trimmed) return;

    onExecuteCommand(activeSession.id, trimmed);
    setInputCommand('');
    setHistoryIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!activeSession) return;
    const history = activeSession.commandHistory;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInputCommand(history[nextIndex] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (history.length === 0 || historyIndex === -1) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) {
        setHistoryIndex(-1);
        setInputCommand('');
      } else {
        setHistoryIndex(nextIndex);
        setInputCommand(history[nextIndex] || '');
      }
    }
  };

  const sendCmdRef = useRef<Record<string, (cmd: string) => void>>({});

  const handlePasteSnippet = (snip: Snippet, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!activeSession) return;
    const scriptText = snip.script || (snip as any).command || '';
    const sendFn = sendCmdRef.current[activeSession.id];
    if (sendFn) {
      sendFn(scriptText);
      toast({
        title: 'Script dikirim ke terminal',
        description: scriptText,
        type: 'info',
      });
    } else {
      navigator.clipboard.writeText(scriptText);
      toast({
        title: 'Script disalin ke clipboard',
        description: scriptText,
        type: 'info',
      });
    }
  };

  const handleRunSnippet = (snip: Snippet, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!activeSession) {
      toast({ title: 'Tidak ada sesi aktif', description: 'Pilih atau buka sesi terminal terlebih dahulu.', type: 'error' });
      return;
    }
    const scriptText = snip.script || (snip as any).command || '';
    const desc = snip.description || (snip as any).title || 'Snippet';
    const sendFn = sendCmdRef.current[activeSession.id];
    if (sendFn) {
      sendFn(scriptText + '\n');
      toast({
        title: 'Snippet dieksekusi di terminal',
        description: desc,
        type: 'success',
      });
    } else {
      onExecuteCommand(activeSession.id, scriptText);
      toast({
        title: 'Snippet dieksekusi di terminal',
        description: desc,
        type: 'success',
      });
    }
  };

  const handleOpenEditSnippet = (snip: Snippet, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingSnippet(snip);
    setEditDescription(snip.description);
    setEditScript(snip.script);
    const isGlobal = !snip.targetHostIds || snip.targetHostIds.length === 0;
    setEditIsGlobal(isGlobal);
    setEditSelectedHostIds(snip.targetHostIds || []);
  };

  const handleSaveEditSnippet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSnippet) return;
    if (!editScript.trim()) {
      toast({ title: 'Validation Error', description: 'Script wajib diisi.', type: 'error' });
      return;
    }

    const targetIds = editIsGlobal ? [] : editSelectedHostIds;

    const updated: Snippet = {
      ...editingSnippet,
      description: editDescription.trim() || 'Custom snippet',
      script: editScript.trim(),
      targetHostIds: targetIds,
    };

    if (onUpdateSnippet) {
      onUpdateSnippet(updated);
    }
    toast({
      title: 'Snippet berhasil diupdate',
      description: updated.description,
      type: 'success',
    });
    setEditingSnippet(null);
  };

  const handleCreateSnippet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScript.trim()) {
      toast({ title: 'Validation Error', description: 'Script wajib diisi.', type: 'error' });
      return;
    }

    const targetIds = newIsGlobal ? [] : newSelectedHostIds;

    const created: Snippet = {
      id: `snip-${Date.now()}`,
      description: newDescription.trim() || 'Custom snippet',
      script: newScript.trim(),
      targetHostIds: targetIds,
    };

    if (onAddSnippet) {
      onAddSnippet(created);
    }
    toast({
      title: 'Snippet baru ditambahkan',
      description: created.description,
      type: 'success',
    });

    setIsAddSnippetOpen(false);
    setNewDescription('');
    setNewScript('');
    setNewIsGlobal(true);
    setNewSelectedHostIds([]);
  };

  const copyTerminalOutput = () => {
    if (!activeSession) return;
    const text = activeSession.lines.map((l) => l.text).join('\n');
    navigator.clipboard.writeText(text);
    toast({ title: 'Output terminal disalin ke clipboard', type: 'info' });
  };

  const filteredSnippets = snippets.filter((s) => {
    const q = snippetSearch.toLowerCase();
    const desc = (s.description || (s as any).title || '').toLowerCase();
    const scr = (s.script || (s as any).command || '').toLowerCase();
    const matchesQ = desc.includes(q) || scr.includes(q);

    if (!matchesQ) return false;

    if (filterScopeOnly && activeSession) {
      const isGlobal = !s.targetHostIds || s.targetHostIds.length === 0;
      const isMatched = s.targetHostIds?.includes(activeSession.hostId);
      return isGlobal || isMatched;
    }

    return true;
  });

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-surface p-6 sm:p-12 text-center select-none animate-in fade-in">
        <div className="w-16 h-16 rounded-2xl bg-surface-container-low border border-surface-container-high flex items-center justify-center text-on-surface-variant mb-4 shadow-sm">
          <TerminalIcon className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-base font-bold text-on-surface tracking-tight">
          Belum Ada Sesi Terminal Aktif
        </h2>
        <p className="text-xs text-on-surface-variant/80 mt-1.5 max-w-sm">
          Buka tab Hosts Fleet untuk memilih server atau mulai sesi SSH baru secara instan.
        </p>
        <Button size="sm" onClick={onNewSessionPrompt} className="mt-5 gap-2 shadow-sm font-semibold">
          <Plus className="w-4 h-4" />
          <span>Pilih & Hubungkan Server</span>
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-surface text-on-surface select-text overflow-hidden',
        isFullscreen && 'fixed inset-0 z-50'
      )}
    >
      {/* Session Tab Bar & Toolbar */}
      <div className="flex items-center justify-between border-b border-surface-container-high/80 bg-surface-container-low px-3 pt-1.5 select-none overflow-x-auto shrink-0">
        {/* Left Tabs */}
        <div className="flex items-center gap-1 min-w-0">
          {sessions.map((sess) => {
            const isActive = sess.id === activeSession?.id;
            return (
              <div
                key={sess.id}
                onClick={() => onSelectSession(sess.id)}
                className={cn(
                  'group flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs transition-all cursor-pointer border-t border-l border-r',
                  isActive
                    ? 'bg-surface-container border-surface-container-high text-on-surface font-semibold shadow-xs'
                    : 'bg-surface-container-low/60 border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container/50'
                )}
              >
                <span
                  className={cn(
                    'h-2 w-2 rounded-full shrink-0',
                    sess.status === 'connected'
                      ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]'
                      : sess.status === 'connecting'
                      ? 'bg-amber-400'
                      : 'bg-surface-container-highest'
                  )}
                />
                <span className="truncate max-w-[130px]">{sess.hostName}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseSession(sess.id);
                  }}
                  className="rounded-md p-0.5 text-on-surface-variant hover:bg-surface-container-high hover:text-rose-400 transition-colors cursor-pointer"
                  title="Tutup Sesi"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          <button
            onClick={onNewSessionPrompt}
            className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant hover:text-primary hover:bg-surface-container rounded-lg transition-colors ml-1 cursor-pointer"
            title="Buka Koneksi Host Baru"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Quick Toolbar */}
        {activeSession && (
          <div className="flex items-center gap-1 pb-1 text-on-surface-variant">
            {onOpenSFTPForActiveHost && (
              <button
                onClick={() => onOpenSFTPForActiveHost(activeSession.hostId)}
                className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-amber-400 transition-colors cursor-pointer"
                title="Buka SFTP untuk host ini"
              >
                <FolderTree className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={() => {
                const sendFn = activeSession ? sendCmdRef.current[activeSession.id] : null;
                if (sendFn) {
                  sendFn('clear\n');
                } else if (activeSession) {
                  onClearSession(activeSession.id);
                }
              }}
              className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-rose-400 transition-colors cursor-pointer"
              title="Bersihkan Layar Terminal (clear)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
              title={isFullscreen ? 'Keluar Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            {/* Toggle Snippets Sidebar */}
            <button
              onClick={() => setShowSnippetsSidebar(!showSnippetsSidebar)}
              className={cn(
                'flex items-center gap-1.5 text-md transition-colors ml-1 cursor-pointer',
                showSnippetsSidebar
                  ? 'text-primary font-bold'
                  : 'text-on-surface-variant hover:text-on-surface'
              )}
              title="Buka / Tutup Drawer Snippets"
            >
              {showSnippetsSidebar ? (
                <PanelRightClose className="w-3.5 h-3.5" />
              ) : (
                <PanelRightOpen className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Main Terminal Screen + Snippets Drawer */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Real Interactive Xterm.js Canvas */}
        <div className="flex-1 relative overflow-hidden bg-[#0d1117] flex flex-col">
          {sessions.map((sess) => (
            <XtermTerminal
              key={sess.id}
              hostId={sess.hostId}
              hostName={sess.hostName}
              hostname={sess.hostname}
              port={sess.port}
              username={sess.username}
              isActive={sess.id === activeSession?.id}
              onSendRef={(fn) => {
                sendCmdRef.current[sess.id] = fn;
              }}
            />
          ))}
        </div>

        {/* Snippets Right Drawer */}
        {showSnippetsSidebar && (
          <aside className="w-80 sm:w-88 border-l border-surface-container-high bg-surface-container-low flex flex-col shrink-0 overflow-hidden font-sans">
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-3 border-b border-surface-container-high bg-surface-container-low/80 shrink-0">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-on-surface">Snippets Library</span>
              </div>
              <div className="flex items-center gap-1">
                {onAddSnippet && (
                  <button
                    onClick={() => setIsAddSnippetOpen(true)}
                    className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                    title="Tambah Snippet Baru"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setShowSnippetsSidebar(false)}
                  className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                  title="Tutup Sidebar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Search and Scope Filter */}
            <div className="p-3 border-b border-surface-container-high/60 space-y-2 shrink-0">
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

              <div className="flex items-center gap-1 text-[11px]">
                <button
                  onClick={() => setFilterScopeOnly(true)}
                  className={cn(
                    'px-2.5 py-0.5 rounded-md transition-colors font-medium cursor-pointer',
                    filterScopeOnly
                      ? 'bg-surface-container-high text-on-surface font-semibold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  )}
                >
                  Server Ini
                </button>
                <button
                  onClick={() => setFilterScopeOnly(false)}
                  className={cn(
                    'px-2.5 py-0.5 rounded-md transition-colors font-medium cursor-pointer',
                    !filterScopeOnly
                      ? 'bg-surface-container-high text-on-surface font-semibold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  )}
                >
                  Semua ({snippets.length})
                </button>
              </div>
            </div>

            {/* Snippet Items with 1-click Run & Paste */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {filteredSnippets.length === 0 ? (
                <div className="p-6 text-center text-on-surface-variant text-xs">
                  Tidak ada snippet yang cocok.
                </div>
              ) : (
                filteredSnippets.map((snip) => {
                  return (
                    <div
                      key={snip.id}
                      className="group relative p-3 rounded-xl border border-surface-container-high bg-surface-container hover:bg-surface-container-high hover:border-primary/40 transition-all select-none shadow-xs"
                    >
                      {/* Top Row: Title + Edit */}
                      <div className="flex items-start justify-between gap-1.5">
                        <span className="text-xs font-bold text-on-surface line-clamp-1">
                          {snip.description || (snip as any).title || 'DevOps Snippet'}
                        </span>

                        <button
                          onClick={(e) => handleOpenEditSnippet(snip, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-opacity shrink-0 cursor-pointer"
                          title="Edit snippet"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Script Preview */}
                      <div className="mt-2 p-2 rounded-lg bg-surface-container-lowest border border-surface-container-high/60 text-[11px] font-mono text-on-surface break-all leading-relaxed line-clamp-2">
                        {snip.script || (snip as any).command || ''}
                      </div>

                      {/* Action buttons (Paste & Run) */}
                      <div className="mt-1.5 flex items-center justify-end gap-1.5">
                        <button
                          onClick={(e) => handlePasteSnippet(snip, e)}
                          className="px-1 py-0.5 rounded-sm bg-surface-container-highest hover:brightness-110 text-on-surface border border-surface-container-high text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                          title="Paste ke prompt terminal"
                        >
                          <span>Paste</span>
                        </button>

                        <button
                          onClick={(e) => handleRunSnippet(snip, e)}
                          className="px-1.5 py-0.5 rounded-sm bg-primary hover:brightness-110 text-on-primary text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                          title="Eksekusi langsung di terminal"
                        >
                          <span>Run</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-2.5 border-t border-surface-container-high text-[10px] font-mono text-on-surface-variant text-center shrink-0">
              {activeSession ? `Target: ${activeSession.username}@${activeSession.hostName}` : 'Pilih sesi aktif'}
            </div>
          </aside>
        )}
      </div>

      {/* Terminal Status Footer */}
      {activeSession && (
        <div className="flex items-center justify-between px-4 py-1.5 border-t border-surface-container-high/80 bg-surface-container-low text-[11px] text-on-surface-variant select-none shrink-0 font-mono">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
              <span className="text-on-surface font-semibold">{activeSession.hostname}:{activeSession.port}</span>
            </span>
            <span className="text-surface-container-highest">|</span>
            <span className="truncate max-w-[200px]">Path: {activeSession.currentDirectory}</span>
          </div>

          <div className="flex items-center gap-3">
            <span>Buffer: {activeSession.lines.length} lines</span>
          </div>
        </div>
      )}

      {/* Edit Snippet Modal */}
      <Dialog
        open={editingSnippet !== null}
        onOpenChange={(open) => {
          if (!open) setEditingSnippet(null);
        }}
        title="Edit Snippet"
        description="Perbarui informasi dan sasaran host koneksi"
        maxWidth="md"
      >
        <form onSubmit={handleSaveEditSnippet} className="space-y-4 text-xs font-sans">
          <div className="space-y-1.5">
            <Label htmlFor="terminal-edit-desc">Deskripsi Snippet</Label>
            <Input
              id="terminal-edit-desc"
              placeholder="e.g. Restart docker service & cek status"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="terminal-edit-script" required>Script Shell</Label>
            <Textarea
              id="terminal-edit-script"
              placeholder="docker ps --format 'table {{.Names}}\t{{.Status}}'"
              value={editScript}
              onChange={(e) => setEditScript(e.target.value)}
              required
              rows={3}
            />
          </div>

          <div className="space-y-2.5 pt-2 border-t border-surface-container-high/80">
            <div className="flex items-center justify-between rounded-xl border border-surface-container-high bg-surface-container p-3">
              <div className="space-y-0.5">
                <Label className="text-xs font-medium text-on-surface">Global (Semua Host)</Label>
                <p className="text-[11px] text-on-surface-variant/80">
                  Snippet dapat digunakan di semua host tanpa pembatasan.
                </p>
              </div>
              <Switch
                checked={editIsGlobal}
                onCheckedChange={(checked) => {
                  setEditIsGlobal(checked);
                  if (checked) setEditSelectedHostIds([]);
                }}
              />
            </div>

            {!editIsGlobal && (
              <div className="space-y-2 rounded-xl border border-surface-container-high bg-surface-container p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-on-surface font-semibold">
                    Pilih Host Sasaran ({editSelectedHostIds.length} dipilih)
                  </Label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setEditSelectedHostIds(hosts.map((h) => h.id))}
                      className="text-primary hover:underline cursor-pointer"
                    >
                      Pilih Semua
                    </button>
                    <span className="text-surface-container-highest">·</span>
                    <button
                      type="button"
                      onClick={() => setEditSelectedHostIds([])}
                      className="text-on-surface-variant hover:underline cursor-pointer"
                    >
                      Bersihkan
                    </button>
                  </div>
                </div>

                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {hosts.map((host) => {
                    const isChecked = editSelectedHostIds.includes(host.id);
                    return (
                      <div
                        key={host.id}
                        onClick={() => {
                          setEditSelectedHostIds((prev) =>
                            prev.includes(host.id) ? prev.filter((id) => id !== host.id) : [...prev, host.id]
                          );
                        }}
                        className="flex items-center justify-between p-2 rounded-lg border border-surface-container-high bg-surface-container-low hover:bg-surface-container cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => {
                              setEditSelectedHostIds((prev) =>
                                prev.includes(host.id) ? prev.filter((id) => id !== host.id) : [...prev, host.id]
                              );
                            }}
                          />
                          <span className="text-xs text-on-surface font-medium truncate">{host.name}</span>
                        </div>
                        <span className="text-[10px] font-mono text-on-surface-variant truncate ml-2">
                          {host.username}@{host.hostname}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-container-high/80">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditingSnippet(null)}>
              Batal
            </Button>
            <Button type="submit" size="sm">
              Simpan Perubahan
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Add Snippet Modal */}
      <Dialog
        open={isAddSnippetOpen}
        onOpenChange={setIsAddSnippetOpen}
        title="Tambah Snippet Baru"
        description="Buat snippet perintah baru untuk terminal"
        maxWidth="md"
      >
        <form onSubmit={handleCreateSnippet} className="space-y-4 text-xs font-sans">
          <div className="space-y-1.5">
            <Label htmlFor="terminal-create-desc">Deskripsi Snippet</Label>
            <Input
              id="terminal-create-desc"
              placeholder="e.g. Cek status service redis"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="terminal-create-script" required>Script Shell</Label>
            <Textarea
              id="terminal-create-script"
              placeholder="sudo systemctl status redis"
              value={newScript}
              onChange={(e) => setNewScript(e.target.value)}
              required
              rows={3}
            />
          </div>

          <div className="space-y-2.5 pt-2 border-t border-surface-container-high/80">
            <div className="flex items-center justify-between rounded-xl border border-surface-container-high bg-surface-container p-3">
              <div className="space-y-0.5">
                <Label className="text-xs font-medium text-on-surface">Global (Semua Host)</Label>
                <p className="text-[11px] text-on-surface-variant/80">
                  Snippet dapat digunakan di semua host tanpa pembatasan.
                </p>
              </div>
              <Switch
                checked={newIsGlobal}
                onCheckedChange={(checked) => {
                  setNewIsGlobal(checked);
                  if (checked) setNewSelectedHostIds([]);
                }}
              />
            </div>

            {!newIsGlobal && (
              <div className="space-y-2 rounded-xl border border-surface-container-high bg-surface-container p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-on-surface font-semibold">
                    Pilih Host Sasaran ({newSelectedHostIds.length} dipilih)
                  </Label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setNewSelectedHostIds(hosts.map((h) => h.id))}
                      className="text-primary hover:underline cursor-pointer"
                    >
                      Pilih Semua
                    </button>
                    <span className="text-surface-container-highest">·</span>
                    <button
                      type="button"
                      onClick={() => setNewSelectedHostIds([])}
                      className="text-on-surface-variant hover:underline cursor-pointer"
                    >
                      Bersihkan
                    </button>
                  </div>
                </div>

                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {hosts.map((host) => {
                    const isChecked = newSelectedHostIds.includes(host.id);
                    return (
                      <div
                        key={host.id}
                        onClick={() => {
                          setNewSelectedHostIds((prev) =>
                            prev.includes(host.id) ? prev.filter((id) => id !== host.id) : [...prev, host.id]
                          );
                        }}
                        className="flex items-center justify-between p-2 rounded-lg border border-surface-container-high bg-surface-container-low hover:bg-surface-container cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => {
                              setNewSelectedHostIds((prev) =>
                                prev.includes(host.id) ? prev.filter((id) => id !== host.id) : [...prev, host.id]
                              );
                            }}
                          />
                          <span className="text-xs text-on-surface font-medium truncate">{host.name}</span>
                        </div>
                        <span className="text-[10px] font-mono text-on-surface-variant truncate ml-2">
                          {host.username}@{host.hostname}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-container-high/80">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddSnippetOpen(false)}>
              Batal
            </Button>
            <Button type="submit" size="sm">
              Simpan Snippet
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
