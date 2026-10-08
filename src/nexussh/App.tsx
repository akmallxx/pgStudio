import React, { useState, useEffect } from 'react';
import {
  INITIAL_HOSTS,
  INITIAL_SNIPPETS,
  INITIAL_SFTP_FILES,
  INITIAL_LOCAL_FILES,
  INITIAL_TUNNELS,
  MOCK_FILE_CONTENTS,
} from 'nexussh/data/mockData';
import {
  Host,
  Snippet,
  SSHSession,
  SFTPFile,
  PortForwardRule,
  ActiveView,
  TerminalLine,
} from 'nexussh/types/ssh';
import { Header } from 'nexussh/components/header/Header';
import { HostsManager } from 'nexussh/components/hosts/HostsManager';
import { TerminalView } from 'nexussh/components/terminal/TerminalView';
import { SftpBrowser } from 'nexussh/components/sftp/SftpBrowser';
import { SnippetsLibrary } from 'nexussh/components/snippets/SnippetsLibrary';
import { PortForwardingView } from 'nexussh/components/tunnels/PortForwardingView';
import { CommandPalette } from 'nexussh/components/command-palette/CommandPalette';
import { ToastProvider, useToast } from 'nexussh/components/ui/toast';

function AppContent() {
  const { toast } = useToast();

  // Primary State
  const [activeView, setActiveView] = useState<ActiveView>('hosts');
  const [hosts, setHosts] = useState<Host[]>(INITIAL_HOSTS);
  const [snippets, setSnippets] = useState<Snippet[]>(INITIAL_SNIPPETS);
  const [tunnels, setTunnels] = useState<PortForwardRule[]>(INITIAL_TUNNELS);
  const [filesByPath, setFilesByPath] = useState<Record<string, SFTPFile[]>>(INITIAL_SFTP_FILES);
  const [localFilesByPath, setLocalFilesByPath] = useState<Record<string, SFTPFile[]>>(INITIAL_LOCAL_FILES);
  const [fileContents, setFileContents] = useState<Record<string, string>>(MOCK_FILE_CONTENTS);

  // Active Sessions
  const [sessions, setSessions] = useState<SSHSession[]>([
    {
      id: 'sess-1',
      hostId: 'host-1',
      hostName: 'prod-api-cluster-01',
      username: 'deploy',
      hostname: '192.241.140.22',
      port: 22,
      connectedAt: new Date(),
      currentDirectory: '/var/www/nexus-api',
      status: 'connected',
      commandHistory: ['docker ps', 'uptime', 'ls -la'],
      lines: [
        {
          id: 'l-0',
          type: 'system',
          text: 'Connecting to 192.241.140.22:22 as deploy using id_ed25519_production...',
        },
        {
          id: 'l-1',
          type: 'system',
          text: `Welcome to Ubuntu 24.04 LTS (GNU/Linux 6.8.0-31-generic x86_64)
  * System load: 0.18, 0.24, 0.21    Memory usage: 41%
  * Usage of /:  42.1% of 80GB       IP for eth0: 192.241.140.22
Last login: Today from 103.11.24.8`,
        },
        {
          id: 'l-2',
          type: 'input',
          text: 'docker ps',
        },
        {
          id: 'l-3',
          type: 'output',
          text: `CONTAINER ID   IMAGE                 COMMAND                  CREATED        STATUS        PORTS                               NAMES
a8f9c12e5b41   nexus-api:latest      "docker-entrypoint.s…"   2 days ago     Up 48 hours   127.0.0.1:3000->3000/tcp            nexus-api-prod
3b71e992dc01   redis:7-alpine        "docker-entrypoint.s…"   5 days ago     Up 5 days     127.0.0.1:6379->6379/tcp            nexus-redis`,
        },
      ],
    },
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string>('sess-1');

  // SFTP target host
  const [sftpHostId, setSftpHostId] = useState<string>('host-1');

  // Modals & Palettes
  const [isAddHostModalOpen, setIsAddHostModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyNav = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
        if (e.key === '1') {
          e.preventDefault();
          setActiveView('hosts');
        } else if (e.key === '2') {
          e.preventDefault();
          setActiveView('terminal');
        } else if (e.key === '3') {
          e.preventDefault();
          setActiveView('sftp');
        } else if (e.key === '4') {
          e.preventDefault();
          setActiveView('snippets');
        } else if (e.key === '5') {
          e.preventDefault();
          setActiveView('port-forwarding');
        }
      }
    };
    window.addEventListener('keydown', handleKeyNav);
    return () => window.removeEventListener('keydown', handleKeyNav);
  }, []);

  // Connect SSH Handler
  const handleConnectSSH = (host: Host) => {
    // Check if session already exists
    const existing = sessions.find((s) => s.hostId === host.id);
    if (existing) {
      setActiveSessionId(existing.id);
      setActiveView('terminal');
      toast({ title: 'Switched to active session', description: host.name, type: 'info' });
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
      currentDirectory: '/var/www/nexus-api',
      status: 'connecting',
      commandHistory: [],
      lines: [
        {
          id: `line-${Date.now()}-0`,
          type: 'system',
          text: `SSH handshake initialized to ${host.username}@${host.hostname}:${host.port}...`,
        },
      ],
    };

    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(newSessId);
    setActiveView('terminal');

    // Simulate connection establishment
    setTimeout(() => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id === newSessId) {
            return {
              ...s,
              status: 'connected',
              lines: [
                ...s.lines,
                {
                  id: `line-${Date.now()}-1`,
                  type: 'system',
                  text: `Authenticated with ${host.authType.toUpperCase()} credentials.
Welcome to ${host.name} (${host.hostname}).
System initialized. Type 'help' to view available commands.`,
                },
              ],
            };
          }
          return s;
        })
      );
      toast({ title: 'Connected via SSH', description: `${host.name} (${host.latencyMs}ms)`, type: 'success' });
    }, 600);
  };

  const handleCloseSession = (sessionId: string) => {
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== sessionId);
      if (sessionId === activeSessionId && remaining.length > 0) {
        setActiveSessionId(remaining[remaining.length - 1].id);
      }
      return remaining;
    });
    toast({ title: 'Session disconnected', type: 'info' });
  };

  const handleClearSession = (sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, lines: [] } : s))
    );
  };

  // Simulated Terminal Command Dispatcher
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
        text: `NexusSSH Built-in Shell Simulator:
  ls, ls -la           - List directory contents
  pwd                  - Print working directory
  cd <dir>             - Change directory
  cat <file>           - Display file content
  uptime               - Server runtime & load average
  uname -a             - Kernel & architecture details
  docker ps            - Active containers table
  docker logs <name>   - Output container logs
  df -h                - Filesystem disk usage
  whoami               - Current user
  curl <url>           - HTTP request inspection
  htop / top           - Active process snapshot
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
    } else if (commandName === 'uname' && (args[0] === '-a' || args.length === 0)) {
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
tmpfs           3.9G     0  3.9G   0% /dev/shm
/dev/nvme0n1p15 105M  6.1M   99M   6% /boot/efi`,
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
      outputLine = null; // cd produces no output on success
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
    } else if (commandName === 'htop' || commandName === 'top') {
      outputLine = {
        id: `out-${Date.now()}`,
        type: 'output',
        text: `Tasks: 148 total, 1 running, 147 sleeping, 0 stopped, 0 zombie
%Cpu(s):  2.4 us,  1.1 sy,  0.0 ni, 96.2 id,  0.1 wa,  0.0 hi,  0.2 si
MiB Mem :   7950.4 total,   3120.8 free,   2840.1 used,   1989.5 buff/cache
  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND
 1240 deploy    20   0  712.4m 142.1m  44.2m S   2.1   1.8   4:12.30 node
  890 postgres  20   0  482.0m  98.4m  32.1m S   0.7   1.2   1:45.12 postgres
  640 nginx     20   0   84.2m  12.8m   8.4m S   0.3   0.2   0:14.28 nginx`,
      };
    } else {
      // General command fallback execution
      outputLine = {
        id: `out-${Date.now()}`,
        type: 'output',
        text: `[nexus-agent] Executed: ${trimmed}\nExit code: 0 (completed in 42ms)`,
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
    toast({ title: 'SFTP opened', description: host.name, type: 'info' });
  };

  const handleOpenTerminalAtPath = (hostId: string, path: string) => {
    const session = sessions.find((s) => s.hostId === hostId) || sessions[0];
    if (session) {
      setActiveSessionId(session.id);
      setActiveView('terminal');
      handleExecuteCommand(session.id, `cd ${path}`);
    } else {
      const host = hosts.find((h) => h.id === hostId) || hosts[0];
      handleConnectSSH(host);
    }
  };

  const activeTunnelsCount = tunnels.filter((t) => t.isActive).length;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans selection:bg-zinc-800">
      {/* Top Bar Navigation */}
      <Header
        activeView={activeView}
        onViewChange={setActiveView}
        activeSessionsCount={sessions.length}
        activeTunnelsCount={activeTunnelsCount}
        onOpenNewHostModal={() => setIsAddHostModalOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />

      {/* Main View Area */}
      <main className="flex-1 min-h-0 overflow-hidden relative">
        {activeView === 'hosts' && (
          <HostsManager
            hosts={hosts}
            onConnectSSH={handleConnectSSH}
            onOpenSFTP={handleOpenSFTP}
            onAddHost={(newHost) => setHosts((prev) => [newHost, ...prev])}
            onUpdateHost={(updated) =>
              setHosts((prev) => prev.map((h) => (h.id === updated.id ? updated : h)))
            }
            onDeleteHost={(hostId) =>
              setHosts((prev) => prev.filter((h) => h.id !== hostId))
            }
            isAddModalOpen={isAddHostModalOpen}
            setIsAddModalOpen={setIsAddHostModalOpen}
          />
        )}

        {activeView === 'terminal' && (
          <TerminalView
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
            onCloseSession={handleCloseSession}
            onNewSessionPrompt={() => setActiveView('hosts')}
            onExecuteCommand={handleExecuteCommand}
            onClearSession={handleClearSession}
            snippets={snippets}
            hosts={hosts}
            onAddSnippet={(snippet) => setSnippets((prev) => [snippet, ...prev])}
            onUpdateSnippet={(updated) =>
              setSnippets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
            }
            onOpenSFTPForActiveHost={(hostId) => {
              setSftpHostId(hostId);
              setActiveView('sftp');
            }}
          />
        )}

        {activeView === 'sftp' && (
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
        )}

        {activeView === 'snippets' && (
          <SnippetsLibrary
            snippets={snippets}
            hosts={hosts}
            onAddSnippet={(snippet) => setSnippets((prev) => [snippet, ...prev])}
            onUpdateSnippet={(updated) =>
              setSnippets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
            }
            onDeleteSnippet={(id) => setSnippets((prev) => prev.filter((s) => s.id !== id))}
          />
        )}

        {activeView === 'port-forwarding' && (
          <PortForwardingView
            tunnels={tunnels}
            hosts={hosts}
            onToggleTunnel={(id) => {
              setTunnels((prev) =>
                prev.map((t) => (t.id === id ? { ...t, isActive: !t.isActive } : t))
              );
            }}
            onAddTunnel={(newTunnel) => setTunnels((prev) => [newTunnel, ...prev])}
            onDeleteTunnel={(id) => setTunnels((prev) => prev.filter((t) => t.id !== id))}
          />
        )}
      </main>

      {/* Quick Command Palette (⌘K) */}
      <CommandPalette
        open={isCommandPaletteOpen}
        onOpenChange={setIsCommandPaletteOpen}
        hosts={hosts}
        snippets={snippets}
        tunnels={tunnels}
        onSelectHost={handleConnectSSH}
        onSelectSnippet={(snip) => {
          setActiveView('snippets');
        }}
        onNavigateView={setActiveView}
        onOpenNewHost={() => {
          setIsAddHostModalOpen(true);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
