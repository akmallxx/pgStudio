import React, { useState, useEffect } from 'react';
import { Server, Terminal, FolderTree, Code2, Network, Search, Plus, Download } from 'lucide-react';
import { ActiveView } from 'nexussh/types/ssh';
import { Button } from 'nexussh/components/ui/button';
import { cn } from 'nexussh/utils/cn';

interface HeaderProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  activeSessionsCount: number;
  activeTunnelsCount: number;
  onOpenNewHostModal: () => void;
  onOpenCommandPalette: () => void;
}

export function Header({
  activeView,
  onViewChange,
  activeSessionsCount,
  activeTunnelsCount,
  onOpenNewHostModal,
  onOpenCommandPalette,
}: HeaderProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    if (choiceResult && choiceResult.outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const navItems: { id: ActiveView; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'hosts', label: 'Hosts', icon: <Server className="h-4 w-4" /> },
    {
      id: 'terminal',
      label: 'Terminal',
      icon: <Terminal className="h-4 w-4" />,
      badge: activeSessionsCount,
    },
    { id: 'snippets', label: 'Snippets', icon: <Code2 className="h-4 w-4" /> },
    {
      id: 'port-forwarding',
      label: 'Tunnels',
      icon: <Network className="h-4 w-4" />,
      badge: activeTunnelsCount,
    },
  ];

  return (
    <header className="flex h-14 w-full items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 md:px-6 select-none shrink-0 z-40">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onViewChange('hosts');
          }}
          className="text-base font-semibold tracking-tight text-zinc-100 flex items-center gap-2"
        >
          <div className="h-5 w-5 rounded bg-zinc-100 flex items-center justify-center text-zinc-950 text-xs font-black">
            &gt;_
          </div>
          <span>NexusSSH</span>
        </a>
      </div>

      {/* Zone 2: Clean navigation links */}
      <nav className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-lg border border-zinc-800/80">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer',
                isActive
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              )}
            >
              {item.icon}
              <span>{item.label}</span>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded bg-zinc-700 text-zinc-200 text-[10px] font-medium">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Primary actions */}
      <div className="flex items-center gap-2">
        {deferredPrompt && (
          <button
            type="button"
            onClick={handleInstallPwa}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer"
            title="Install pgStudio sebagai aplikasi Desktop (PWA)"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-[11px] font-medium">Install App</span>
          </button>
        )}
        <button
          onClick={onOpenCommandPalette}
          className="hidden sm:flex items-center gap-2 h-8 px-2.5 rounded-md border border-zinc-800 bg-zinc-900/50 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 transition-colors"
        >
          <Search className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-[11px]">Command Palette</span>
          <kbd className="hidden lg:inline-block rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 text-[9px] text-zinc-400 font-medium">
            ⌘K
          </kbd>
        </button>
      </div>
    </header>
  );
}
