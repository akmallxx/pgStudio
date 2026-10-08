import React, { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';
import { api, DatabaseOverviewResponse } from '../services/api';
import { APP_AUTHOR, APP_VERSION, isTamperedSignature } from '../services/githubVersion';

interface StatusBarProps {
  lastQueryTimeMs?: number;
  activeSessionId?: string;
  totalSize?: string;
  activeClusterId?: string;
  onOpenAbout?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  lastQueryTimeMs = 2.4,
  activeSessionId,
  totalSize,
  activeClusterId,
  onOpenAbout,
}) => {
  const [overview, setOverview] = useState<DatabaseOverviewResponse | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchStatus = () => {
      api.getDatabaseOverview()
        .then((res) => {
          if (isMounted) setOverview(res);
        })
        .catch(() => {});
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeClusterId]);

  const displayVersion = overview?.version_short || (overview?.is_live ? 'PostgreSQL' : 'Standby');
  const displayPid = overview?.backend_pid ? `#${overview.backend_pid}` : (activeSessionId || '#—');
  const displaySize = overview?.database_size || totalSize || '—';
  const displayEncoding = overview?.server_encoding || 'UTF-8';
  const displayIsolation = overview?.isolation_level || 'READ COMMITTED';
  const displayDb = overview?.database_name ? `[${overview.database_name}]` : '';

  return (
    <footer className="fixed bottom-0 left-0 right-0 h-6 bg-surface-container-lowest z-50 flex items-center justify-between px-3 text-on-surface-variant font-code-sm text-code-sm text-[11px] border-t border-surface-container-high/60 shadow-[0_-1px_6px_rgba(0,0,0,0.3)] select-none">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              overview?.is_live ? 'bg-primary animate-pulse' : 'bg-surface-variant'
            }`}
          />
          <span className="text-on-surface font-medium truncate max-w-[240px]" title={overview?.version}>
            {displayVersion} {displayDb}
          </span>
        </div>
        <div className="h-3 w-px bg-outline-variant/40 hidden sm:block"></div>
        <div className="hidden sm:flex items-center gap-1">
          <span>Session PID:</span>
          <span className="text-on-surface font-semibold">{displayPid}</span>
        </div>
        <div className="h-3 w-px bg-outline-variant/40 hidden md:block"></div>
        <div className="hidden md:flex items-center gap-1">
          <span>Size:</span>
          <span className="text-secondary font-medium">{displaySize}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden sm:flex items-center gap-1">
          <span>Encoding:</span>
          <span className="text-on-surface font-medium">{displayEncoding}</span>
        </div>
        <div className="h-3 w-px bg-outline-variant/40 hidden sm:block"></div>
        <div className="flex items-center gap-1">
          <span className="hidden md:inline">Isolation:</span>
          <span className="text-primary font-semibold">{displayIsolation}</span>
        </div>
        <div className="h-3 w-px bg-outline-variant/40"></div>
        <div className="flex items-center gap-1 text-primary">
          <Zap className="w-3 h-3 text-primary" />
          <span className="font-semibold">Query: {lastQueryTimeMs.toFixed(1)}ms</span>
        </div>
      </div>
    </footer>
  );
};
