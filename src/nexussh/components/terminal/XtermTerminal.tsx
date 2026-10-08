import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { api } from '../../../services/api';
import { RotateCcw, Wifi, WifiOff } from 'lucide-react';

interface XtermTerminalProps {
  hostId: string;
  hostName: string;
  isActive: boolean;
  onSendRef?: (sendFn: (cmd: string) => void) => void;
  hostname?: string;
  port?: number;
  username?: string;
}

export const XtermTerminal: React.FC<XtermTerminalProps> = ({
  hostId,
  hostName,
  isActive,
  onSendRef,
  hostname,
  port,
  username,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [reconnectKey, setReconnectKey] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Initialize Xterm instance
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: 13,
      lineHeight: 1.25,
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#10b981',
        selectionBackground: 'rgba(16, 185, 129, 0.3)',
        black: '#161b22',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
      allowTransparency: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(containerRef.current);
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    try {
      fitAddon.fit();
    } catch {}

    term.write(`\x1b[90mMemulai koneksi SSH ke ${hostName} (${hostId})...\x1b[0m\r\n`);
    setConnectionStatus('connecting');

    // 2. Open WebSocket with intelligent proxy-bypass fallback
    const fallbackHost = hostname ? { hostname, port, username } : undefined;
    const initialWsUrl = api.getSshWsUrl(hostId, term.cols || 100, term.rows || 30, fallbackHost);

    let hasConnected = false;
    let attemptedFallback = false;
    let isMounted = true;

    const connectWs = (url: string) => {
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
          if (!isMounted) return;
          hasConnected = true;
          setConnectionStatus('connected');
          term.focus();
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          if (typeof event.data === 'string') {
            term.write(event.data);
          } else if (event.data instanceof ArrayBuffer) {
            term.write(new Uint8Array(event.data));
          }
        };

        ws.onerror = () => {
          if (!isMounted) return;
          // If handshake fails (e.g. reverse proxy like Apache does not support WebSocket Upgrade),
          // try direct backend port 28432 automatically
          if (!hasConnected && !attemptedFallback && window.location.protocol !== 'https:') {
            attemptedFallback = true;
            const directUrl = api.getSshWsUrl(hostId, term.cols || 100, term.rows || 30, fallbackHost, true);
            if (directUrl !== url) {
              term.write('\r\n\x1b[33m⚡ Mencoba koneksi langsung ke backend port 28432...\x1b[0m\r\n');
              connectWs(directUrl);
              return;
            }
          }
          setConnectionStatus('disconnected');
          term.write('\r\n\x1b[31m[WebSocket connection error]\x1b[0m\r\n');
          term.write('\x1b[90mTip: Jika menggunakan Apache/Nginx reverse proxy, pastikan proxy mengizinkan WebSocket Upgrade atau buka port 28432 langsung.\x1b[0m\r\n');
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setConnectionStatus('disconnected');
          if (hasConnected) {
            term.write('\r\n\x1b[33m[Sesi SSH terputus]\x1b[0m\r\n');
          }
        };
      } catch (e) {
        if (!isMounted) return;
        setConnectionStatus('disconnected');
        term.write(`\r\n\x1b[31m[Gagal membuka socket: ${e}]\x1b[0m\r\n`);
      }
    };

    connectWs(initialWsUrl);

    // User input from keyboard
    const onDataDisposable = term.onData((data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });

    // Terminal resize listener
    const onResizeDisposable = term.onResize(({ cols, rows }) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    // Window / container resize observer
    const handleRefit = () => {
      if (containerRef.current && fitAddonRef.current && terminalRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch {}
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      handleRefit();
    });
    resizeObserver.observe(containerRef.current);
    window.addEventListener('resize', handleRefit);

    // Provide send method to parent (e.g. for executing snippets)
    if (onSendRef) {
      onSendRef((cmd: string) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(cmd.endsWith('\n') ? cmd : cmd + '\n');
        }
      });
    }

    return () => {
      isMounted = false;
      window.removeEventListener('resize', handleRefit);
      try {
        onDataDisposable.dispose();
      } catch {}
      try {
        onResizeDisposable.dispose();
      } catch {}
      try {
        resizeObserver.disconnect();
      } catch {}
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        try {
          wsRef.current.close();
        } catch {}
      }
      wsRef.current = null;
      try {
        term.dispose();
      } catch {}
    };
  }, [hostId, hostName, reconnectKey]);

  // Refit when tab becomes active
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (isActive && fitAddonRef.current && terminalRef.current) {
      timer = setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          terminalRef.current?.focus();
        } catch {}
      }, 50);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isActive]);

  const handleReconnect = () => {
    setReconnectKey((prev) => prev + 1);
  };

  return (
    <div className={`relative w-full h-full flex flex-col bg-[#0d1117] ${isActive ? 'block' : 'hidden'}`}>
      {/* Mini status badge overlay */}
      <div className="absolute top-2 right-4 z-20 flex items-center gap-2 bg-[#161b22]/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[11px] font-mono pointer-events-auto">
        {connectionStatus === 'connected' ? (
          <span className="flex items-center gap-1.5 text-emerald-400">
            <Wifi className="w-3 h-3" />
            <span className="hidden sm:inline">SSH Connected</span>
          </span>
        ) : connectionStatus === 'connecting' ? (
          <span className="flex items-center gap-1.5 text-amber-400 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="hidden sm:inline">Connecting...</span>
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-rose-400">
              <WifiOff className="w-3 h-3" />
              <span className="hidden sm:inline">Disconnected</span>
            </span>
            <button
              onClick={handleReconnect}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-[10px] cursor-pointer"
              title="Sambungkan Ulang"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Reconnect</span>
            </button>
          </div>
        )}
      </div>

      {/* Terminal Viewport */}
      <div
        ref={containerRef}
        onClick={() => terminalRef.current?.focus()}
        className="w-full h-full p-2 overflow-hidden cursor-text"
      />
    </div>
  );
};
