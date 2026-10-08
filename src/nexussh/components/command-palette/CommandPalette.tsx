import React, { useState, useEffect } from 'react';
import { Search, Server, Terminal, FolderTree, Code2, Network, Plus, ArrowRight } from 'lucide-react';
import { Host, Snippet, PortForwardRule, ActiveView } from 'nexussh/types/ssh';
import { cn } from 'nexussh/utils/cn';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hosts: Host[];
  snippets: Snippet[];
  tunnels: PortForwardRule[];
  onSelectHost: (host: Host) => void;
  onSelectSnippet: (snippet: Snippet) => void;
  onNavigateView: (view: ActiveView) => void;
  onOpenNewHost: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  hosts,
  snippets,
  tunnels,
  onSelectHost,
  onSelectSnippet,
  onNavigateView,
  onOpenNewHost,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  const q = query.toLowerCase();

  const matchingHosts = hosts.filter(
    (h) => h.name.toLowerCase().includes(q) || h.hostname.toLowerCase().includes(q)
  );
  const matchingSnippets = snippets.filter(
    (s) => s.description.toLowerCase().includes(q) || s.script.toLowerCase().includes(q)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Palette box */}
      <div className="relative z-50 w-full max-w-xl overflow-hidden rounded-2xl border border-surface-container-high bg-surface-container-low shadow-2xl animate-in zoom-in-95">
        <div className="flex items-center px-4 border-b border-surface-container-high bg-surface-container-lowest">
          <Search className="h-4 w-4 text-on-surface-variant mr-2 shrink-0" />
          <input
            type="text"
            placeholder="Type a command or search hosts, snippets, navigation..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full h-12 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none font-medium"
          />
          <kbd className="rounded-md border border-surface-container-high bg-surface-container px-2 py-0.5 text-[10px] font-mono text-on-surface-variant">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-surface-container-high/40 text-xs">
          {/* Quick Navigation actions */}
          <div className="p-1">
            <span className="px-2 py-1 text-[10px] text-on-surface-variant/70 uppercase tracking-wider block font-bold">
              Views & Tools
            </span>
            <button
              onClick={() => {
                onNavigateView('hosts');
                onOpenChange(false);
              }}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Server className="h-3.5 w-3.5 text-secondary" />
                <span className="font-medium">Go to Hosts Inventory</span>
              </div>
              <ArrowRight className="h-3 w-3 text-on-surface-variant/50" />
            </button>

            <button
              onClick={() => {
                onNavigateView('terminal');
                onOpenChange(false);
              }}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                <span className="font-medium">Go to Terminal Sessions</span>
              </div>
              <ArrowRight className="h-3 w-3 text-on-surface-variant/50" />
            </button>

            <button
              onClick={() => {
                onNavigateView('sftp');
                onOpenChange(false);
              }}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <FolderTree className="h-3.5 w-3.5 text-amber-400" />
                <span className="font-medium">Go to SFTP File Browser</span>
              </div>
              <ArrowRight className="h-3 w-3 text-on-surface-variant/50" />
            </button>

            <button
              onClick={() => {
                onNavigateView('port-forwarding');
                onOpenChange(false);
              }}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Network className="h-3.5 w-3.5 text-purple-400" />
                <span className="font-medium">Go to Port Forwarding Tunnels</span>
              </div>
              <ArrowRight className="h-3 w-3 text-on-surface-variant/50" />
            </button>
          </div>

          {/* Hosts */}
          {matchingHosts.length > 0 && (
            <div className="p-1">
              <span className="px-2 py-1 text-[10px] text-on-surface-variant/70 uppercase tracking-wider block font-bold">
                Connect to Host
              </span>
              {matchingHosts.slice(0, 4).map((host) => (
                <button
                  key={host.id}
                  onClick={() => {
                    onSelectHost(host);
                    onOpenChange(false);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                    <span className="font-semibold text-on-surface">{host.name}</span>
                    <span className="text-on-surface-variant text-[11px] font-mono">
                      {host.username}@{host.hostname}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Connect
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Snippets */}
          {matchingSnippets.length > 0 && (
            <div className="p-1">
              <span className="px-2 py-1 text-[10px] text-on-surface-variant/70 uppercase tracking-wider block font-bold">
                Run Snippet
              </span>
              {matchingSnippets.slice(0, 4).map((snip) => (
                <button
                  key={snip.id}
                  onClick={() => {
                    onSelectSnippet(snip);
                    onOpenChange(false);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Code2 className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                    <span className="font-medium text-on-surface truncate">{snip.description}</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-container text-on-surface-variant shrink-0">
                    {snip.targetHostIds?.length === 0 ? 'Global' : 'Target Host'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-2.5 border-t border-surface-container-high bg-surface-container-lowest flex items-center justify-between text-[11px] text-on-surface-variant px-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] px-1 py-0.2 rounded bg-surface-container">Tab / Arrows</span>
            <span>Navigasi</span>
          </div>
          <span className="font-mono text-[10px] text-primary font-bold">NexusSH DevOps</span>
        </div>
      </div>
    </div>
  );
}
