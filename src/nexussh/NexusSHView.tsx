import React, { useState, useEffect } from 'react';
import {
  INITIAL_HOSTS,
  INITIAL_SNIPPETS,
  INITIAL_SFTP_FILES,
  INITIAL_LOCAL_FILES,
  INITIAL_TUNNELS,
  MOCK_FILE_CONTENTS,
} from './data/mockData';
import {
  Host,
  Snippet,
  SSHSession,
  SFTPFile,
  PortForwardRule,
  ActiveView,
  TerminalLine,
} from './types/ssh';
import { HostsManager } from './components/hosts/HostsManager';
import { TerminalView } from './components/terminal/TerminalView';
import { SftpBrowser } from './components/sftp/SftpBrowser';
import { SnippetsLibrary } from './components/snippets/SnippetsLibrary';
import { PortForwardingView } from './components/tunnels/PortForwardingView';
import { ToastProvider, useToast } from './components/ui/toast';
import {
  Server,
  Terminal,
  FolderTree,
  Code2,
  Network,
  Plus,
  Zap,
} from 'lucide-react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../services/api';

const normalizeView = (v?: string): ActiveView | undefined => {
  if (!v) return undefined;
  if (v === 'tunnels') return 'port-forwarding';
  if (v === 'hosts' || v === 'terminal' || v === 'sftp' || v === 'snippets' || v === 'port-forwarding') {
    return v as ActiveView;
  }
  return undefined;
};

export interface NexusSHViewProps {
  initialView?: ActiveView;
  onOpenGoArchitecture?: () => void;
  onSwitchToPgStudio?: () => void;
  onShowToast?: (message: string, icon?: string, isError?: boolean) => void;
  // Shared state from parent (optional, to keep sessions persistent across app switching)
  sessions?: SSHSession[];
  setSessions?: React.Dispatch<React.SetStateAction<SSHSession[]>>;
  activeSessionId?: string;
  setActiveSessionId?: React.Dispatch<React.SetStateAction<string>>;
  hosts?: Host[];
  setHosts?: React.Dispatch<React.SetStateAction<Host[]>>;
  snippets?: Snippet[];
  setSnippets?: React.Dispatch<React.SetStateAction<Snippet[]>>;
  tunnels?: PortForwardRule[];
  setTunnels?: React.Dispatch<React.SetStateAction<PortForwardRule[]>>;
}

function NexusSHContent({
  initialView = 'hosts',
  onSwitchToPgStudio,
  sessions: propSessions,
  setSessions: propSetSessions,
  activeSessionId: propActiveSessionId,
  setActiveSessionId: propSetActiveSessionId,
  hosts: propHosts,
  setHosts: propSetHosts,
  snippets: propSnippets,
  setSnippets: propSetSnippets,
  tunnels: propTunnels,
  setTunnels: propSetTunnels,
}: NexusSHViewProps) {
  const { toast } = useToast();
  const { subview } = useParams<{ subview?: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const getPathView = (pathname: string): ActiveView | undefined => {
    if (pathname.includes('/terminal')) return 'terminal';
    if (pathname.includes('/sftp')) return 'sftp';
    if (pathname.includes('/snippets')) return 'snippets';
    if (pathname.includes('/port-forwarding') || pathname.includes('/tunnels')) return 'port-forwarding';
    if (pathname.includes('/hosts') || pathname === '/nexussh') return 'hosts';
    return undefined;
  };

  const urlView = normalizeView(subview) || getPathView(location.pathname);
  const [activeView, setActiveView] = useState<ActiveView>(urlView || initialView || 'hosts');

  useEffect(() => {
    if (activeView === 'terminal') {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeView]);

  // Fallback local state if not provided from root App
  const [localHosts, setLocalHosts] = useState<Host[]>(INITIAL_HOSTS);
  const [localSnippets, setLocalSnippets] = useState<Snippet[]>(INITIAL_SNIPPETS);
  const [localTunnels, setLocalTunnels] = useState<PortForwardRule[]>(INITIAL_TUNNELS);
  const [filesByPath, setFilesByPath] = useState<Record<string, SFTPFile[]>>(INITIAL_SFTP_FILES);
  const [localFilesByPath, setLocalFilesByPath] = useState<Record<string, SFTPFile[]>>(INITIAL_LOCAL_FILES);
  const [fileContents, setFileContents] = useState<Record<string, string>>(MOCK_FILE_CONTENTS);

  const hosts = propHosts ?? localHosts;
  const setHosts = propSetHosts ?? setLocalHosts;

  const snippets = propSnippets ?? localSnippets;
  const setSnippets = propSetSnippets ?? setLocalSnippets;

  const tunnels = propTunnels ?? localTunnels;
  const setTunnels = propSetTunnels ?? setLocalTunnels;

  const [localSessions, setLocalSessions] = useState<SSHSession[]>([
    {
      id: 'sess-blackbox',
      hostId: 'host_blackbox_2211',
      hostName: 'Blackbox Localhost (2211)',
      username: 'blackbox',
      hostname: '127.0.0.1',
      port: 2211,
      connectedAt: new Date(),
      currentDirectory: '/home/blackbox',
      status: 'connected',
      commandHistory: [],
      lines: [
        {
          id: 'l-0',
          type: 'system',
          text: 'Connected to blackbox@127.0.0.1:2211 via SSH.',
        },
      ],
    },
  ]);
  const [localActiveSessionId, setLocalActiveSessionId] = useState<string>('sess-blackbox');

  const sessions = propSessions ?? localSessions;
  const setSessions = propSetSessions ?? setLocalSessions;

  const activeSessionId = propActiveSessionId ?? localActiveSessionId;
  const setActiveSessionId = propSetActiveSessionId ?? setLocalActiveSessionId;

  // SFTP target host
  const [sftpHostId, setSftpHostId] = useState<string>('host_blackbox_2211');
  const [isAddHostModalOpen, setIsAddHostModalOpen] = useState(false);

  // Sync URL subview changes with activeView state
  useEffect(() => {
    if (urlView) {
      setActiveView(urlView);
    } else if (subview && !urlView) {
      navigate('/nexussh/hosts', { replace: true });
    }
  }, [subview, urlView, navigate]);

  const handleNavigateView = (view: ActiveView) => {
    setActiveView(view);
    navigate(`/nexussh/${view}`);
  };

  // Connect SSH Handler
  const handleConnectSSH = (host: Host) => {
    const existing = sessions.find((s) => s.hostId === host.id);
    if (existing) {
      setActiveSessionId(existing.id);
      setActiveView('terminal');
      navigate('/nexussh/terminal');
      toast({ title: 'Sesi SSH aktif dibuka', description: host.name, type: 'info' });
      return;
    }

    const newSessId = `sess-${Date.now()}`;
    const newSession: SSHSession = {
      id: newSessId,
      hostId: host.id,
      hostName: host.name,
      username: host.username,
      hostname: host.hostname,
      port: host.port,
      connectedAt: new Date(),
      currentDirectory: '~',
      status: 'connected',
      commandHistory: [],
      lines: [
        {
          id: `line-${Date.now()}-0`,
          type: 'system',
          text: `SSH terminal connected to ${host.username}@${host.hostname}:${host.port}`,
        },
      ],
    };

    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(newSessId);
    setActiveView('terminal');
    navigate('/nexussh/terminal');
    toast({ title: 'Terhubung ke SSH Host', description: host.name, type: 'success' });
  };

  const handleCloseSession = (sessionId: string) => {
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== sessionId);
      if (sessionId === activeSessionId && remaining.length > 0) {
        setActiveSessionId(remaining[remaining.length - 1].id);
      }
      return remaining;
    });
    toast({ title: 'Sesi SSH ditutup', type: 'info' });
  };

  const handleClearSession = (sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, lines: [] } : s))
    );
  };

  const handleExecuteCommand = (sessionId: string, cmd: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    const trimmed = cmd.trim();
    const parts = trimmed.split(' ');
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1);

    const inputLine: TerminalLine = {
      id: `in-${Date.now()}`,
      type: 'input',
      text: trimmed,
    };

    let outputLine: TerminalLine | null = null;
    let nextDirectory = session.currentDirectory;

    if (commandName === 'clear') {
      handleClearSession(sessionId);
      return;
    } else if (commandName === 'exit') {
      handleCloseSession(sessionId);
      return;
    } else if (commandName === 'help') {
      outputLine = {
        id: `out-${Date.now()}`,
        type: 'output',
        text: `NexusSH Built-in Shell Simulator:
  ls, ls -la           - List directory contents
  pwd                  - Print working directory
  cd <dir>             - Change directory
  cat <file>           - Display file content
  uptime               - Server runtime & load average
  uname -a             - Kernel & architecture details
  docker ps            - Active containers table
  df -h                - Filesystem disk usage
  whoami               - Current user
  clear                - Clear terminal buffer
  exit                 - Close SSH connection`,
      };
    } else if (commandName === 'pwd') {
      outputLine = {
        id: `out-${Date.now()}`,
        type: 'output',
        text: session.currentDirectory,
      };
    } else if (commandName === 'whoami') {
      outputLine = {
        id: `out-${Date.now()}`,
        type: 'output',
        text: session.username,
      };
    } else if (commandName === 'uptime') {
      outputLine = {
        id: `out-${Date.now()}`,
        type: 'output',
        text: ' 08:52:40 up 42 days, 14:12,  2 users,  load average: 0.18, 0.22, 0.20',
      };
    } else if (commandName === 'uname') {
      outputLine = {
        id: `out-${Date.now()}`,
        type: 'output',
        text: 'Linux nexus-node-01 6.8.0-31-generic #31-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux',
      };
    } else if (commandName === 'df') {
      outputLine = {
        id: `out-${Date.now()}`,
        type: 'output',
        text: `Filesystem      Size  Used Avail Use% Mounted on
/dev/nvme0n1p1   80G   34G   46G  43% /
tmpfs           3.9G     0  3.9G   0% /dev/shm`,
      };
    } else if (commandName === 'docker' && args[0] === 'ps') {
      outputLine = {
        id: `out-${Date.now()}`,
        type: 'output',
        text: `CONTAINER ID   IMAGE                 COMMAND                  CREATED        STATUS        PORTS                               NAMES
a8f9c12e5b41   nexus-api:latest      "docker-entrypoint.s…"   2 days ago     Up 48 hours   127.0.0.1:3000->3000/tcp            nexus-api-prod
3b71e992dc01   redis:7-alpine        "docker-entrypoint.s…"   5 days ago     Up 5 days     127.0.0.1:6379->6379/tcp            nexus-redis`,
      };
    } else if (commandName === 'ls') {
      const files = filesByPath[session.currentDirectory] || [];
      if (files.length === 0) {
        outputLine = {
          id: `out-${Date.now()}`,
          type: 'output',
          text: 'config/  logs/  .env.production  docker-compose.yml  nginx.conf  deploy.sh',
        };
      } else {
        const text = files
          .map((f) => (f.type === 'directory' ? `${f.name}/` : f.name))
          .join('  ');
        outputLine = {
          id: `out-${Date.now()}`,
          type: 'output',
          text,
        };
      }
    } else if (commandName === 'cd') {
      const targetDir = args[0] || '/home/' + session.username;
      if (targetDir === '..') {
        const parts = session.currentDirectory.split('/').filter(Boolean);
        parts.pop();
        nextDirectory = '/' + parts.join('/') || '/';
      } else if (targetDir.startsWith('/')) {
        nextDirectory = targetDir;
      } else {
        nextDirectory = `${session.currentDirectory}/${targetDir}`.replace('//', '/');
      }
      outputLine = null;
    } else if (commandName === 'cat') {
      const fileName = args[0];
      const fullPath = fileName?.startsWith('/')
        ? fileName
        : `${session.currentDirectory}/${fileName}`;
      const content = fileContents[fullPath];
      if (content) {
        outputLine = {
          id: `out-${Date.now()}`,
          type: 'output',
          text: content,
        };
      } else {
        outputLine = {
          id: `out-${Date.now()}`,
          type: 'error',
          text: `cat: ${fileName || ''}: No such file or directory`,
        };
      }
    } else {
      outputLine = {
        id: `out-${Date.now()}`,
        type: 'output',
        text: `[nexus-agent] Executed: ${trimmed}\nExit code: 0 (completed in 38ms)`,
      };
    }

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === sessionId) {
          const nextLines = [...s.lines, inputLine];
          if (outputLine) nextLines.push(outputLine);
          return {
            ...s,
            lines: nextLines,
            currentDirectory: nextDirectory,
            commandHistory: [...s.commandHistory, trimmed],
          };
        }
        return s;
      })
    );
  };

  const handleOpenSFTP = (host: Host) => {
    setSftpHostId(host.id);
    setActiveView('sftp');
    navigate('/nexussh/sftp');
    toast({ title: 'SFTP dibuka', description: host.name, type: 'info' });
  };

  const handleOpenTerminalAtPath = (hostId: string, path: string) => {
    const session = sessions.find((s) => s.hostId === hostId) || sessions[0];
    if (session) {
      setActiveSessionId(session.id);
      setActiveView('terminal');
      navigate('/nexussh/terminal');
      handleExecuteCommand(session.id, `cd ${path}`);
    } else {
      const host = hosts.find((h) => h.id === hostId) || hosts[0];
      handleConnectSSH(host);
    }
  };

  const activeTunnelsCount = tunnels.filter((t) => t.isActive).length;

  const navItems: { id: ActiveView; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'hosts', label: 'Hosts Fleet', icon: <Server className="w-3.5 h-3.5" />, count: hosts.length },
    { id: 'terminal', label: 'Terminal', icon: <Terminal className="w-3.5 h-3.5" />, count: sessions.length },
    { id: 'sftp', label: 'SFTP Browser', icon: <FolderTree className="w-3.5 h-3.5" /> },
    { id: 'snippets', label: 'Snippets', icon: <Code2 className="w-3.5 h-3.5" />, count: snippets.length },
    {
      id: 'port-forwarding',
      label: 'Port Forwarding',
      icon: <Network className="w-3.5 h-3.5" />,
      count: activeTunnelsCount,
    },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-surface text-on-surface overflow-hidden select-none">
      {/* Sub-Header Navigation Toolbar for NexusSH */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 sm:px-6 py-2.5 bg-surface-container-low/90 backdrop-blur-md border-b border-surface-container-high/80 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto">

          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigateView(item.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${isActive
                    ? 'bg-primary text-on-primary shadow-xs ring-1 ring-primary/40'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                  }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${isActive
                        ? 'bg-on-primary/25 text-on-primary'
                        : 'bg-surface-container-highest text-on-surface-variant'
                      }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {activeView === 'hosts' && (
            <button
              onClick={() => setIsAddHostModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-bold transition-all shadow-xs hover:brightness-110 active:scale-[0.98] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Host</span>
            </button>
          )}

          {activeView === 'terminal' && (
            <button
              onClick={() => handleNavigateView('hosts')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-semibold transition-all cursor-pointer border border-surface-container-highest"
            >
              <Plus className="w-3.5 h-3.5 text-primary" />
              <span>Sesi Host Baru</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area - All subviews stay mounted to preserve active SSH Terminal sessions & SFTP directory states */}
      <main className="flex-1 min-h-0 overflow-hidden relative bg-surface">
        <div className={`h-full w-full ${activeView === 'hosts' ? 'block' : 'hidden'}`}>
          <HostsManager
            hosts={hosts}
            onConnectSSH={handleConnectSSH}
            onOpenSFTP={handleOpenSFTP}
            onAddHost={(newHost) => {
              setHosts((prev) => [newHost, ...prev]);
              api.saveSshHost(newHost).catch(console.error);
            }}
            onUpdateHost={(updated) => {
              setHosts((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
              api.saveSshHost(updated).catch(console.error);
            }}
            onDeleteHost={(hostId) => {
              setHosts((prev) => prev.filter((h) => h.id !== hostId));
              api.deleteSshHost(hostId).catch(console.error);
            }}
            isAddModalOpen={isAddHostModalOpen}
            setIsAddModalOpen={setIsAddHostModalOpen}
          />
        </div>

        <div className={`h-full w-full ${activeView === 'terminal' ? 'flex flex-col' : 'hidden'}`}>
          <TerminalView
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
            onCloseSession={handleCloseSession}
            onNewSessionPrompt={() => {
              setActiveView('hosts');
              navigate('/nexussh/hosts');
            }}
            onExecuteCommand={handleExecuteCommand}
            onClearSession={handleClearSession}
            snippets={snippets}
            hosts={hosts}
            onAddSnippet={(snippet) => {
              setSnippets((prev) => [snippet, ...prev]);
              api.saveSshSnippet(snippet).catch(console.error);
            }}
            onUpdateSnippet={(updated) => {
              setSnippets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
              api.saveSshSnippet(updated).catch(console.error);
            }}
            onOpenSFTPForActiveHost={(hostId) => {
              setSftpHostId(hostId);
              setActiveView('sftp');
              navigate('/nexussh/sftp');
            }}
          />
        </div>

        <div className={`h-full w-full ${activeView === 'sftp' ? 'block' : 'hidden'}`}>
          <SftpBrowser
            hosts={hosts}
            selectedHostId={sftpHostId}
            onSelectHost={setSftpHostId}
            filesByPath={filesByPath}
            localFilesByPath={localFilesByPath}
            fileContents={fileContents}
            onSaveFileContent={(path, content) => {
              setFileContents((prev) => ({ ...prev, [path]: content }));
            }}
            onOpenTerminalAtPath={handleOpenTerminalAtPath}
          />
        </div>

        <div className={`h-full w-full ${activeView === 'snippets' ? 'block' : 'hidden'}`}>
          <SnippetsLibrary
            snippets={snippets}
            hosts={hosts}
            onAddSnippet={(snippet) => {
              setSnippets((prev) => [snippet, ...prev]);
              api.saveSshSnippet(snippet).catch(console.error);
            }}
            onUpdateSnippet={(updated) => {
              setSnippets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
              api.saveSshSnippet(updated).catch(console.error);
            }}
            onDeleteSnippet={(id) => {
              setSnippets((prev) => prev.filter((s) => s.id !== id));
              api.deleteSshSnippet(id).catch(console.error);
            }}
          />
        </div>

        <div className={`h-full w-full ${activeView === 'port-forwarding' ? 'block' : 'hidden'}`}>
          <PortForwardingView
            tunnels={tunnels}
            hosts={hosts}
            onToggleTunnel={(id) => {
              setTunnels((prev) => {
                const next = prev.map((t) => (t.id === id ? { ...t, isActive: !t.isActive } : t));
                const target = next.find((t) => t.id === id);
                if (target) api.saveSshTunnel(target).catch(console.error);
                return next;
              });
            }}
            onAddTunnel={(newTunnel) => {
              setTunnels((prev) => [newTunnel, ...prev]);
              api.saveSshTunnel(newTunnel).catch(console.error);
            }}
            onDeleteTunnel={(id) => {
              setTunnels((prev) => prev.filter((t) => t.id !== id));
              api.deleteSshTunnel(id).catch(console.error);
            }}
          />
        </div>
      </main>
    </div>
  );
}

export function NexusSHView(props: NexusSHViewProps) {
  return (
    <ToastProvider>
      <NexusSHContent {...props} />
    </ToastProvider>
  );
}
