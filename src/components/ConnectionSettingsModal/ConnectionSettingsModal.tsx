import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  Info,
  Check,
  RotateCw,
  Plus,
  Minus,
  ChevronUp,
  ChevronDown,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import {
  ClusterConnection,
  JumpServerConfig,
  SshTunnelConfig,
  AdvancedConnectionSettings,
} from '../../types/database';
import { api } from '../../services/api';

interface ConnectionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  connection?: ClusterConnection;
  onSave: (conn: Partial<ClusterConnection>) => void;
  onShowToast: (message: string, icon?: string, isError?: boolean) => void;
}

type TabType = 'main' | 'advanced' | 'driver' | 'ssh' | 'ssl' | 'proxy';

export const ConnectionSettingsModal: React.FC<ConnectionSettingsModalProps> = ({
  isOpen,
  onClose,
  connection,
  onSave,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('main');
  const [visibleTabs, setVisibleTabs] = useState<TabType[]>([
    'main',
    'advanced',
    'driver',
    'ssh',
  ]);
  const [showAddTabMenu, setShowAddTabMenu] = useState(false);

  // --- Main Tab States ---
  const [connectBy, setConnectBy] = useState<'host' | 'url'>('host');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('5432');
  const [database, setDatabase] = useState('postgres');
  const [showAllDbs, setShowAllDbs] = useState(true);
  const [url, setUrl] = useState('jdbc:postgresql://localhost:5432/postgres');
  const [authMethod, setAuthMethod] = useState<'native' | 'credentials' | 'none'>('credentials');
  const [username, setUsername] = useState('postgres');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savePassword, setSavePassword] = useState(true);
  const [connectionName, setConnectionName] = useState('');
  const [envType, setEnvType] = useState<'LOCAL' | 'STAGING' | 'REPLICA / RO' | 'PROD'>('LOCAL');
  const [description, setDescription] = useState('');
  const [autoCommit, setAutoCommit] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const [keepAlive, setKeepAlive] = useState('0');

  // --- Advanced Tab States (Screenshot 1) ---
  const [sessionRole, setSessionRole] = useState('');
  const [localClient, setLocalClient] = useState('/usr/lib/postgresql/17');
  const [showTemplateDatabases, setShowTemplateDatabases] = useState(false);
  const [showUnavailableDatabases, setShowUnavailableDatabases] = useState(false);
  const [showDatabaseStatistics, setShowDatabaseStatistics] = useState(false);
  const [readAllDataTypes, setReadAllDataTypes] = useState(false);
  const [readTableKeysWithColumns, setReadTableKeysWithColumns] = useState(false);
  const [replaceLegacyTimezone, setReplaceLegacyTimezone] = useState(false);
  const [quoteDollarMode, setQuoteDollarMode] = useState<'Code block' | 'Plain text'>('Code block');
  const [quoteTagMode, setQuoteTagMode] = useState<'Code block' | 'Plain text'>('Code block');
  const [usePreparedStatements, setUsePreparedStatements] = useState(false);

  // --- SSH Tab States (Screenshot 2) ---
  const [sshHost, setSshHost] = useState('localhost');
  const [sshPort, setSshPort] = useState('22');
  const [sshUser, setSshUser] = useState('');
  const [sshAuthMethod, setSshAuthMethod] = useState<'Password' | 'Public Key' | 'Agent' | 'Pageant'>('Password');
  const [sshPassword, setSshPassword] = useState('');
  const [sshSaveCredentials, setSshSaveCredentials] = useState(true);

  // Jump servers
  const [jumpServersOpen, setJumpServersOpen] = useState(true);
  const [jumpServers, setJumpServers] = useState<JumpServerConfig[]>([]);
  const [selectedJumpRow, setSelectedJumpRow] = useState<string>('target');

  // Advanced SSH Settings
  const [sshAdvancedOpen, setSshAdvancedOpen] = useState(true);
  const [sshImplementation, setSshImplementation] = useState<'SSHJ' | 'JSch'>('SSHJ');
  const [bypassHostVerification, setBypassHostVerification] = useState(false);
  const [shareTunnel, setShareTunnel] = useState(true);
  const [keepAliveIntervalMs, setKeepAliveIntervalMs] = useState('0');
  const [tunnelConnectTimeoutMs, setTunnelConnectTimeoutMs] = useState('0');
  const [localHost, setLocalHost] = useState('');
  const [localPort, setLocalPort] = useState('0');
  const [remoteHost, setRemoteHost] = useState('');
  const [remotePort, setRemotePort] = useState('0');

  // SSH Testing State
  const [isTestingSsh, setIsTestingSsh] = useState(false);
  const [sshTestFeedback, setSshTestFeedback] = useState<{
    success: boolean;
    message: string;
    latency_ms?: number;
  } | null>(null);
  const [showVariablesHelp, setShowVariablesHelp] = useState(false);

  // SSL & Proxy
  const [useSsl, setUseSsl] = useState(false);
  const [sslMode, setSslMode] = useState('disable');
  const [useProxy, setUseProxy] = useState(false);
  const [proxyType, setProxyType] = useState('SOCKS5');
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState('1080');

  // Overall Connection Test
  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null);

  // Initialize or synchronize state when modal opens or connection changes
  useEffect(() => {
    if (!isOpen) return;

    if (connection) {
      setConnectionName(connection.name || 'PostgreSQL Connection');
      setHost(connection.host || 'localhost');
      setPort(connection.port?.toString() || '5432');
      setDatabase(connection.defaultDb || 'postgres');
      setUsername(connection.user || 'postgres');
      setPassword(connection.password || '');
      const badge = connection.badge || (connection.host?.includes('localhost') ? 'LOCAL' : 'PROD');
      setEnvType(badge);
      setAutoCommit(
        connection.autoCommit !== undefined
          ? connection.autoCommit
          : badge === 'PROD'
          ? false
          : true
      );
      setUrl(
        `jdbc:postgresql://${connection.host || 'localhost'}:${connection.port || 5432}/${
          connection.defaultDb || 'postgres'
        }`
      );

      // Restore Advanced Settings
      if (connection.advancedSettings) {
        const adv = connection.advancedSettings;
        setSessionRole(adv.sessionRole || '');
        setLocalClient(adv.localClient || '/usr/lib/postgresql/17');
        setShowTemplateDatabases(adv.showTemplateDatabases ?? false);
        setShowUnavailableDatabases(adv.showUnavailableDatabases ?? false);
        setShowDatabaseStatistics(adv.showDatabaseStatistics ?? false);
        setReadAllDataTypes(adv.readAllDataTypes ?? false);
        setReadTableKeysWithColumns(adv.readTableKeysWithColumns ?? false);
        setReplaceLegacyTimezone(adv.replaceLegacyTimezone ?? false);
        setQuoteDollarMode(adv.quoteDollarMode || 'Code block');
        setQuoteTagMode(adv.quoteTagMode || 'Code block');
        setUsePreparedStatements(adv.usePreparedStatements ?? false);
      } else {
        setSessionRole('');
        setLocalClient('/usr/lib/postgresql/17');
        setShowTemplateDatabases(false);
        setShowUnavailableDatabases(false);
        setShowDatabaseStatistics(false);
        setReadAllDataTypes(false);
        setReadTableKeysWithColumns(false);
        setReplaceLegacyTimezone(false);
        setQuoteDollarMode('Code block');
        setQuoteTagMode('Code block');
        setUsePreparedStatements(false);
      }

      // Restore SSH Settings
      if (connection.sshSettings) {
        const ssh = connection.sshSettings;
        setSshHost(ssh.host || '');
        setSshPort(ssh.port?.toString() || '22');
        setSshUser(ssh.user || '');
        setSshAuthMethod(ssh.authMethod || 'Password');
        setSshPassword(ssh.password || '');
        setSshSaveCredentials(ssh.saveCredentials ?? true);
        setJumpServers(ssh.jumpServers || []);
        setSshImplementation(ssh.implementation || 'SSHJ');
        setBypassHostVerification(ssh.bypassHostVerification ?? false);
        setShareTunnel(ssh.shareTunnel ?? true);
        setKeepAliveIntervalMs(ssh.keepAliveMs?.toString() || '0');
        setTunnelConnectTimeoutMs(ssh.timeoutMs?.toString() || '0');
        setLocalHost(ssh.localHost || '');
        setLocalPort(ssh.localPort?.toString() || '0');
        setRemoteHost(ssh.remoteHost || '');
        setRemotePort(ssh.remotePort?.toString() || '0');

        if (ssh.enabled && !visibleTabs.includes('ssh')) {
          setVisibleTabs((prev) => [...prev, 'ssh']);
        }
      } else {
        setSshHost('');
        setSshPort('22');
        setSshUser('');
        setSshAuthMethod('Password');
        setSshPassword('');
        setSshSaveCredentials(true);
        setJumpServers([]);
        setSshImplementation('SSHJ');
        setBypassHostVerification(false);
        setShareTunnel(true);
        setKeepAliveIntervalMs('0');
        setTunnelConnectTimeoutMs('0');
        setLocalHost('');
        setLocalPort('0');
        setRemoteHost('');
        setRemotePort('0');
      }
    } else {
      // Tambah Koneksi Baru: Clean default state
      setConnectionName('');
      setHost('localhost');
      setPort('5432');
      setDatabase('postgres');
      setUsername('postgres');
      setPassword('');
      setEnvType('LOCAL');
      setAutoCommit(true);
      setReadOnly(false);
      setUrl('jdbc:postgresql://localhost:5432/postgres');

      // Reset Advanced
      setSessionRole('');
      setLocalClient('/usr/lib/postgresql/17');
      setShowTemplateDatabases(false);
      setShowUnavailableDatabases(false);
      setShowDatabaseStatistics(false);
      setReadAllDataTypes(false);
      setReadTableKeysWithColumns(false);
      setReplaceLegacyTimezone(false);
      setQuoteDollarMode('Code block');
      setQuoteTagMode('Code block');
      setUsePreparedStatements(false);

      // Reset SSH
      setSshHost('');
      setSshPort('22');
      setSshUser('');
      setSshAuthMethod('Password');
      setSshPassword('');
      setSshSaveCredentials(true);
      setJumpServers([]);
      setSshImplementation('SSHJ');
      setBypassHostVerification(false);
      setShareTunnel(true);
      setKeepAliveIntervalMs('0');
      setTunnelConnectTimeoutMs('0');
      setLocalHost('');
      setLocalPort('0');
      setRemoteHost('');
      setRemotePort('0');
    }
    setActiveTab('main');
    setTestSuccess(null);
    setSshTestFeedback(null);
  }, [connection, isOpen]);

  // Synchronize URL when Host, Port, Database change
  const handleHostChange = (newHost: string) => {
    setHost(newHost);
    setUrl(`jdbc:postgresql://${newHost}:${port}/${database}`);
  };

  const handlePortChange = (newPort: string) => {
    setPort(newPort);
    setUrl(`jdbc:postgresql://${host}:${newPort}/${database}`);
  };

  const handleDatabaseChange = (newDb: string) => {
    setDatabase(newDb);
    setUrl(`jdbc:postgresql://${host}:${port}/${newDb}`);
  };

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    try {
      const clean = newUrl.replace(/^jdbc:/i, '');
      const parsed = new URL(
        clean.startsWith('http') || clean.startsWith('postgres')
          ? clean
          : `postgres://${clean}`
      );
      if (parsed.hostname) setHost(parsed.hostname);
      if (parsed.port) setPort(parsed.port);
      if (parsed.pathname && parsed.pathname.length > 1) {
        setDatabase(parsed.pathname.replace(/^\//, ''));
      }
    } catch {
      const match = newUrl.match(/(?:jdbc:)?postgresql:\/\/([^:/]+)(?::(\d+))?(?:\/([^?]+))?/i);
      if (match) {
        if (match[1]) setHost(match[1]);
        if (match[2]) setPort(match[2]);
        if (match[3]) setDatabase(match[3]);
      }
    }
  };

  // Test main database connection
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestSuccess(null);
    try {
      const isSsh = visibleTabs.includes('ssh');
      const res = await api.testConnection({
        host,
        port: parseInt(port, 10) || 5432,
        database,
        user: username,
        password,
        ssl_mode: useSsl ? sslMode : 'disable',
        ssh_settings: isSsh
          ? {
              enabled: true,
              host: sshHost || 'localhost',
              port: parseInt(sshPort, 10) || 22,
              user: sshUser,
              authMethod: sshAuthMethod,
              password: sshPassword,
              bypassHostVerification,
              timeoutMs: parseInt(tunnelConnectTimeoutMs, 10) || 5000,
            }
          : undefined,
      });
      setTestSuccess(res.connected);
      if (res.connected) {
        onShowToast(res.message || 'Koneksi database PostgreSQL terverifikasi!', 'verified');
      } else {
        onShowToast(res.message || res.error || 'Gagal terhubung ke database', 'warning', true);
      }
    } catch (err: any) {
      setTestSuccess(false);
      onShowToast(`Tes koneksi gagal: ${err?.message || 'Error'}`, 'error', true);
    } finally {
      setIsTesting(false);
    }
  };

  // Test SSH Tunnel configuration (Screenshot 2 functionality)
  const handleTestSshTunnel = async () => {
    setIsTestingSsh(true);
    setSshTestFeedback(null);
    try {
      const res = await api.testSshTunnel({
        host: sshHost || 'localhost',
        port: parseInt(sshPort, 10) || 22,
        user: sshUser,
        auth_method: sshAuthMethod,
        password: sshPassword,
        bypass_host_verification: bypassHostVerification,
        timeout_ms: parseInt(tunnelConnectTimeoutMs, 10) || 5000,
      });
      setSshTestFeedback(res);
      if (res.success) {
        onShowToast(res.message, 'verified');
      } else {
        onShowToast(res.message || res.error || 'SSH tunnel test gagal', 'warning', true);
      }
    } catch (err: any) {
      const msg = err?.message || 'Gagal menguji SSH tunnel';
      setSshTestFeedback({ success: false, message: msg });
      onShowToast(msg, 'error', true);
    } finally {
      setIsTestingSsh(false);
    }
  };

  // Jump servers toolbar actions
  const handleAddJumpServer = () => {
    const newId = `jump_${Date.now()}`;
    const newServer: JumpServerConfig = {
      id: newId,
      order: `Jump ${jumpServers.length + 1}`,
      host: 'bastion.internal.net',
      port: 22,
      user: 'bastion_user',
      authMethod: 'Password',
    };
    setJumpServers([...jumpServers, newServer]);
    setSelectedJumpRow(newId);
  };

  const handleRemoveJumpServer = () => {
    if (selectedJumpRow && selectedJumpRow !== 'target') {
      const updated = jumpServers.filter((s) => s.id !== selectedJumpRow);
      setJumpServers(updated);
      setSelectedJumpRow(updated.length > 0 ? updated[0].id : 'target');
    }
  };

  const handleMoveJumpServer = (direction: 'up' | 'down') => {
    if (!selectedJumpRow || selectedJumpRow === 'target') return;
    const index = jumpServers.findIndex((s) => s.id === selectedJumpRow);
    if (index === -1) return;
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= jumpServers.length) return;
    const reordered = [...jumpServers];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(nextIndex, 0, moved);
    setJumpServers(reordered);
  };

  // Tab management (closing SSH tab, adding tabs from dropdown)
  const handleCloseTab = (tab: TabType, e: React.MouseEvent) => {
    e.stopPropagation();
    setVisibleTabs((prev) => prev.filter((t) => t !== tab));
    if (activeTab === tab) {
      setActiveTab('main');
    }
  };

  const handleAddTab = (tab: TabType) => {
    if (!visibleTabs.includes(tab)) {
      setVisibleTabs((prev) => [...prev, tab]);
    }
    setActiveTab(tab);
    setShowAddTabMenu(false);
  };

  // Save all settings and connect
  const handleSaveAndConnect = () => {
    const finalName = connectionName || `PostgreSQL - ${host}`;

    const sshSettings: SshTunnelConfig = {
      enabled: visibleTabs.includes('ssh'),
      host: sshHost,
      port: parseInt(sshPort, 10) || 22,
      user: sshUser,
      authMethod: sshAuthMethod,
      password: sshSaveCredentials ? sshPassword : '',
      saveCredentials: sshSaveCredentials,
      jumpServers,
      implementation: sshImplementation,
      bypassHostVerification,
      shareTunnel,
      keepAliveMs: parseInt(keepAliveIntervalMs, 10) || 0,
      timeoutMs: parseInt(tunnelConnectTimeoutMs, 10) || 0,
      localHost,
      localPort: parseInt(localPort, 10) || 0,
      remoteHost,
      remotePort: parseInt(remotePort, 10) || 0,
    };

    const advancedSettings: AdvancedConnectionSettings = {
      sessionRole,
      localClient,
      showTemplateDatabases,
      showUnavailableDatabases,
      showDatabaseStatistics,
      readAllDataTypes,
      readTableKeysWithColumns,
      replaceLegacyTimezone,
      quoteDollarMode,
      quoteTagMode,
      usePreparedStatements,
    };

    onSave({
      id: connection?.id,
      name: finalName,
      host,
      port: parseInt(port, 10) || 5432,
      defaultDb: database,
      user: username,
      password: savePassword ? password : '',
      badge: envType,
      sslMode: useSsl ? sslMode : 'disable',
      autoCommit,
      readOnly,
      sshSettings,
      advancedSettings,
    });

    onShowToast(`Connection '${finalName}' saved successfully`, 'verified');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[840px] max-w-[96vw] bg-surface-container-low border border-surface-container-highest rounded-xl shadow-2xl flex flex-col overflow-hidden text-on-surface text-xs font-sans select-none animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-surface-container-lowest border-b border-surface-container-high shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connection ? 'bg-amber-400' : 'bg-primary'}`} />
            <h3 className="font-semibold text-xs text-on-surface">
              {connection ? `Edit Koneksi: ${connection.name || connection.host}` : 'Tambah Koneksi Database PostgreSQL Baru'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer transition-colors"
            title="Tutup dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Modal Top Bar (DBeaver style with tabs & options) */}
        <div className="flex items-center justify-between px-3 bg-surface-container-lowest border-b border-surface-container-high shrink-0 select-none">
          {/* Left Tabs */}
          <div className="flex items-center">
            {visibleTabs.map((tabId) => {
              const isActive = activeTab === tabId;
              const labelMap: Record<TabType, string> = {
                main: 'Main',
                advanced: 'Advanced',
                driver: 'Driver properties',
                ssh: 'SSH',
                ssl: 'SSL',
                proxy: 'Proxy',
              };

              return (
                <div
                  key={tabId}
                  onClick={() => setActiveTab(tabId)}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium border-b-2 transition-all cursor-pointer ${
                    isActive
                      ? 'border-primary text-primary bg-primary/10 font-semibold'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container/30'
                  }`}
                >
                  <span>{labelMap[tabId]}</span>
                  {/* Closeable Tab Button (as seen on SSH tab in Screenshot 2) */}
                  {(tabId === 'ssh' || tabId === 'ssl' || tabId === 'proxy') && (
                    <button
                      type="button"
                      onClick={(e) => handleCloseTab(tabId, e)}
                      className="p-0.5 hover:bg-surface-container-high rounded text-on-surface-variant hover:text-on-surface cursor-pointer ml-0.5"
                      title={`Close ${labelMap[tabId]} tab`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right Toolbar: + SSL, Proxy dropdown & No Profile */}
          <div className="flex items-center gap-3 pr-2 relative">
            {/* + SSL, Proxy Dropdown Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAddTabMenu(!showAddTabMenu)}
                className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer py-1 px-1.5 rounded hover:bg-surface-container"
              >
                <span>+ SSL, Proxy</span>
                <span className="text-[9px]">▾</span>
              </button>

              {showAddTabMenu && (
                <div className="absolute right-0 mt-1 w-36 bg-surface-container-low border border-surface-container-highest rounded-lg shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2 py-1 text-[10px] text-on-surface-variant font-semibold border-b border-surface-container-high">
                    Show Network Tabs
                  </div>
                  {(['ssh', 'ssl', 'proxy'] as TabType[]).map((t) => {
                    const isShown = visibleTabs.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleAddTab(t)}
                        className="w-full text-left px-2.5 py-1.5 text-xs text-on-surface hover:bg-surface-container flex items-center justify-between cursor-pointer capitalize"
                      >
                        <span>{t.toUpperCase()}</span>
                        {isShown && <Check className="w-3 h-3 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. Main Content Body */}
        <div className="p-5 min-h-[380px] max-h-[500px] overflow-y-auto bg-surface-container-low">
          {/* TAB 1: MAIN */}
          {activeTab === 'main' && (
            <div className="space-y-5">
              {/* Connection Identity Section (Connection Name & Connection Type) */}
              <div className="p-3 bg-surface-container/30 border border-surface-container-high rounded-lg space-y-2.5">
                <div className="grid grid-cols-12 gap-3 items-center">
                  <label className="col-span-2 text-on-surface-variant font-medium text-xs">Connection name:</label>
                  <input
                    type="text"
                    value={connectionName}
                    onChange={(e) => setConnectionName(e.target.value)}
                    placeholder="PostgreSQL - localhost"
                    className="col-span-5 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1.5 text-xs outline-none"
                  />

                  <label className="col-span-2 text-on-surface-variant font-medium text-xs text-right">Connection type:</label>
                  <div className="col-span-3">
                    <select
                      value={envType}
                      onChange={(e) => setEnvType(e.target.value as any)}
                      className="w-full bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1.5 text-xs outline-none cursor-pointer font-medium"
                    >
                      <option value="LOCAL">Development</option>
                      <option value="STAGING">Test / Staging</option>
                      <option value="PROD">Production</option>
                      <option value="REPLICA / RO">Replica (Read-Only)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Server Section */}
              <div>
                <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider mb-3">Server</h3>
                <div className="space-y-3.5 pl-2">
                  <div className="flex items-center gap-6">
                    <span className="w-20 text-on-surface-variant font-medium">Connect by:</span>
                    <label className="flex items-center gap-2 cursor-pointer text-on-surface font-medium">
                      <input
                        type="radio"
                        name="connectBy"
                        value="host"
                        checked={connectBy === 'host'}
                        onChange={() => setConnectBy('host')}
                        className="cursor-pointer text-primary focus:ring-0"
                      />
                      <span>Host</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-on-surface font-medium">
                      <input
                        type="radio"
                        name="connectBy"
                        value="url"
                        checked={connectBy === 'url'}
                        onChange={() => setConnectBy('url')}
                        className="cursor-pointer text-primary focus:ring-0"
                      />
                      <span>URL</span>
                    </label>
                  </div>

                  {connectBy === 'host' ? (
                    <div className="grid grid-cols-12 gap-3 items-center">
                      <label className="col-span-2 text-on-surface-variant">Host:</label>
                      <input
                        type="text"
                        value={host}
                        onChange={(e) => handleHostChange(e.target.value)}
                        placeholder="localhost"
                        className="col-span-6 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1.5 text-xs font-mono outline-none"
                      />
                      <label className="col-span-1 text-on-surface-variant text-right">Port:</label>
                      <input
                        type="text"
                        value={port}
                        onChange={(e) => handlePortChange(e.target.value)}
                        placeholder="5432"
                        className="col-span-3 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1.5 text-xs font-mono outline-none"
                      />

                      <label className="col-span-2 text-on-surface-variant">Database:</label>
                      <input
                        type="text"
                        value={database}
                        onChange={(e) => handleDatabaseChange(e.target.value)}
                        placeholder="postgres"
                        className="col-span-6 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1.5 text-xs font-mono outline-none"
                      />
                      <div className="col-span-4 pl-2">
                        <label className="flex items-center gap-2 cursor-pointer text-on-surface-variant hover:text-on-surface">
                          <input
                            type="checkbox"
                            checked={showAllDbs}
                            onChange={(e) => setShowAllDbs(e.target.checked)}
                            className="rounded bg-surface-container border-outline-variant cursor-pointer text-primary"
                          />
                          <span>Show all databases</span>
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-12 gap-3 items-center">
                      <label className="col-span-2 text-on-surface-variant">JDBC URL:</label>
                      <input
                        type="text"
                        value={url}
                        onChange={(e) => handleUrlChange(e.target.value)}
                        placeholder="jdbc:postgresql://localhost:5432/postgres"
                        className="col-span-10 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1.5 text-xs font-mono outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Authentication Section */}
              <div className="pt-3 border-t border-surface-container-high">
                <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider mb-3">Authentication</h3>
                <div className="space-y-3.5 pl-2">
                  <div className="grid grid-cols-12 gap-3 items-center">
                    <label className="col-span-2 text-on-surface-variant">Username:</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="postgres"
                      className="col-span-6 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1.5 text-xs font-mono outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-12 gap-3 items-center">
                    <label className="col-span-2 text-on-surface-variant">Password:</label>
                    <div className="col-span-6 relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1.5 text-xs font-mono outline-none pr-8"
                      />
                    </div>
                    <div className="col-span-4 pl-2">
                      <label className="flex items-center gap-2 cursor-pointer text-on-surface-variant hover:text-on-surface">
                        <input
                          type="checkbox"
                          checked={savePassword}
                          onChange={(e) => setSavePassword(e.target.checked)}
                          className="rounded bg-surface-container border-outline-variant cursor-pointer text-primary"
                        />
                        <span>Save password locally</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ADVANCED (MATCHING SCREENSHOT 1) */}
          {activeTab === 'advanced' && (
            <div className="space-y-5">
              {/* Section 1: Advanced Header */}
              <div>
                <h3 className="text-xs font-bold text-on-surface mb-2.5">Advanced</h3>
                <div className="space-y-2.5 pl-1 max-w-xl">
                  <div className="flex items-center gap-4">
                    <label className="w-28 text-on-surface-variant shrink-0">Session role:</label>
                    <input
                      type="text"
                      value={sessionRole}
                      onChange={(e) => setSessionRole(e.target.value)}
                      placeholder="None"
                      className="flex-1 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1 text-xs outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="w-28 text-on-surface-variant shrink-0">Local Client:</label>
                    <div className="flex-1 relative">
                      <select
                        value={localClient}
                        onChange={(e) => setLocalClient(e.target.value)}
                        className="w-full bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1 text-xs font-mono outline-none cursor-pointer"
                      >
                        <option value="/usr/lib/postgresql/17">/usr/lib/postgresql/17</option>
                        <option value="/usr/bin/psql">/usr/bin/psql</option>
                        <option value="/usr/local/bin/psql">/usr/local/bin/psql</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Settings (6 Checkboxes) */}
              <div>
                <h3 className="text-xs font-bold text-on-surface mb-2.5">Settings</h3>
                <div className="flex flex-col items-start space-y-2">
                  <label className="inline-flex items-center gap-2.5 cursor-pointer text-on-surface-variant hover:text-on-surface text-xs select-none">
                    <input
                      type="checkbox"
                      checked={showTemplateDatabases}
                      onChange={(e) => setShowTemplateDatabases(e.target.checked)}
                      className="m-0 shrink-0 cursor-pointer"
                    />
                    <span>Show template databases</span>
                  </label>

                  <label className="inline-flex items-center gap-2.5 cursor-pointer text-on-surface-variant hover:text-on-surface text-xs select-none">
                    <input
                      type="checkbox"
                      checked={showUnavailableDatabases}
                      onChange={(e) => setShowUnavailableDatabases(e.target.checked)}
                      className="m-0 shrink-0 cursor-pointer"
                    />
                    <span>Show databases not available for connection</span>
                  </label>

                  <label className="inline-flex items-center gap-2.5 cursor-pointer text-on-surface-variant hover:text-on-surface text-xs select-none">
                    <input
                      type="checkbox"
                      checked={showDatabaseStatistics}
                      onChange={(e) => setShowDatabaseStatistics(e.target.checked)}
                      className="m-0 shrink-0 cursor-pointer"
                    />
                    <span>Show database statistics</span>
                  </label>

                  <label className="inline-flex items-center gap-2.5 cursor-pointer text-on-surface-variant hover:text-on-surface text-xs select-none">
                    <input
                      type="checkbox"
                      checked={readAllDataTypes}
                      onChange={(e) => setReadAllDataTypes(e.target.checked)}
                      className="m-0 shrink-0 cursor-pointer"
                    />
                    <span>Read all data types</span>
                  </label>

                  <label className="inline-flex items-center gap-2.5 cursor-pointer text-on-surface-variant hover:text-on-surface text-xs select-none">
                    <input
                      type="checkbox"
                      checked={readTableKeysWithColumns}
                      onChange={(e) => setReadTableKeysWithColumns(e.target.checked)}
                      className="m-0 shrink-0 cursor-pointer"
                    />
                    <span>Read table keys with columns</span>
                  </label>

                  <label className="inline-flex items-center gap-2.5 cursor-pointer text-on-surface-variant hover:text-on-surface text-xs select-none">
                    <input
                      type="checkbox"
                      checked={replaceLegacyTimezone}
                      onChange={(e) => setReplaceLegacyTimezone(e.target.checked)}
                      className="m-0 shrink-0 cursor-pointer"
                    />
                    <span>Replace legacy timezone</span>
                  </label>
                </div>
              </div>

              {/* Section 3: SQL */}
              <div>
                <h3 className="text-xs font-bold text-on-surface mb-2.5">SQL</h3>
                <div className="space-y-2.5 max-w-md">
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-on-surface-variant">Show $$ quote as:</label>
                    <select
                      value={quoteDollarMode}
                      onChange={(e) => setQuoteDollarMode(e.target.value as any)}
                      className="w-36 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1 text-xs outline-none cursor-pointer"
                    >
                      <option value="Code block">Code block</option>
                      <option value="Plain text">Plain text</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <label className="text-on-surface-variant">Show $tagName$ quote as:</label>
                    <select
                      value={quoteTagMode}
                      onChange={(e) => setQuoteTagMode(e.target.value as any)}
                      className="w-36 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1 text-xs outline-none cursor-pointer"
                    >
                      <option value="Code block">Code block</option>
                      <option value="Plain text">Plain text</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 4: Performance */}
              <div>
                <h3 className="text-xs font-bold text-on-surface mb-2.5">Performance</h3>
                <div className="flex flex-col items-start">
                  <label className="inline-flex items-center gap-2.5 cursor-pointer text-on-surface-variant hover:text-on-surface text-xs select-none">
                    <input
                      type="checkbox"
                      checked={usePreparedStatements}
                      onChange={(e) => setUsePreparedStatements(e.target.checked)}
                      className="m-0 shrink-0 cursor-pointer"
                    />
                    <span>Use prepared statements</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DRIVER PROPERTIES */}
          {activeTab === 'driver' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                  PostgreSQL JDBC Driver Properties
                </h3>
                <span className="text-[11px] text-on-surface-variant">
                  Driver class: org.postgresql.Driver (v42.7)
                </span>
              </div>

              <div className="border border-surface-container-high rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-container text-on-surface border-b border-surface-container-high">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Property Name</th>
                      <th className="py-2 px-3 font-semibold">Value</th>
                      <th className="py-2 px-3 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container-high font-mono text-[11px]">
                    <tr className="hover:bg-surface-container-high/40 transition-colors">
                      <td className="py-2 px-3 text-on-surface">application_name</td>
                      <td className="py-2 px-3 text-primary font-semibold">pgStudio-DBeaver</td>
                      <td className="py-2 px-3 text-on-surface-variant font-sans">
                        pg_stat_activity client identifier
                      </td>
                    </tr>
                    <tr className="hover:bg-surface-container-high/40 transition-colors">
                      <td className="py-2 px-3 text-on-surface">connectTimeout</td>
                      <td className="py-2 px-3 text-secondary font-semibold">10</td>
                      <td className="py-2 px-3 text-on-surface-variant font-sans">
                        Socket connection timeout in seconds
                      </td>
                    </tr>
                    <tr className="hover:bg-surface-container-high/40 transition-colors">
                      <td className="py-2 px-3 text-on-surface">sslmode</td>
                      <td className="py-2 px-3 text-primary font-semibold">
                        {useSsl ? sslMode : 'disable'}
                      </td>
                      <td className="py-2 px-3 text-on-surface-variant font-sans">
                        TLS / SSL negotiation policy
                      </td>
                    </tr>
                    <tr className="hover:bg-surface-container-high/40 transition-colors">
                      <td className="py-2 px-3 text-on-surface">binaryTransfer</td>
                      <td className="py-2 px-3 text-secondary font-semibold">true</td>
                      <td className="py-2 px-3 text-on-surface-variant font-sans">
                        High-speed binary encoding for row fetches
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: SSH (MATCHING SCREENSHOT 2) */}
          {activeTab === 'ssh' && (
            <div className="space-y-4">
              {/* 1. Settings */}
              <div>
                <h3 className="text-xs font-bold text-on-surface mb-2.5">Settings</h3>
                <div className="space-y-2.5 pl-1">
                  <div className="flex items-center gap-3">
                    <label className="w-24 text-on-surface-variant shrink-0">Host/IP:</label>
                    <input
                      type="text"
                      value={sshHost}
                      onChange={(e) => setSshHost(e.target.value)}
                      placeholder="localhost"
                      className="flex-1 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1 text-xs font-mono outline-none"
                    />
                    <label className="text-on-surface-variant shrink-0 ml-2">Port:</label>
                    <input
                      type="text"
                      value={sshPort}
                      onChange={(e) => setSshPort(e.target.value)}
                      placeholder="2211"
                      className="w-20 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1 text-xs font-mono outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="w-24 text-on-surface-variant shrink-0">User Name:</label>
                    <input
                      type="text"
                      value={sshUser}
                      onChange={(e) => setSshUser(e.target.value)}
                      placeholder="blackbox"
                      className="w-56 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1 text-xs font-mono outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="w-24 text-on-surface-variant shrink-0">
                      Authentication Method:
                    </label>
                    <select
                      value={sshAuthMethod}
                      onChange={(e) => setSshAuthMethod(e.target.value as any)}
                      className="w-56 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1 text-xs outline-none cursor-pointer"
                    >
                      <option value="Password">Password</option>
                      <option value="Public Key">Public Key</option>
                      <option value="Agent">Agent</option>
                      <option value="Pageant">Pageant</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="w-24 text-on-surface-variant shrink-0">Password:</label>
                    <input
                      type="password"
                      value={sshPassword}
                      onChange={(e) => setSshPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-56 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1 text-xs font-mono outline-none"
                    />
                    <label className="inline-flex items-center gap-1.5 cursor-pointer text-on-surface-variant hover:text-on-surface ml-3 select-none">
                      <input
                        type="checkbox"
                        checked={sshSaveCredentials}
                        onChange={(e) => setSshSaveCredentials(e.target.checked)}
                        className="m-0 shrink-0 cursor-pointer"
                      />
                      <span>Save credentials</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* 2. Jump servers (Collapsible section with toolbar and table) */}
              <div>
                <div
                  className="flex items-center gap-1 text-xs font-bold text-on-surface cursor-pointer select-none mb-1.5"
                  onClick={() => setJumpServersOpen(!jumpServersOpen)}
                >
                  <span className="text-[10px] text-on-surface-variant">
                    {jumpServersOpen ? '▾' : '▸'}
                  </span>
                  <span>Jump servers</span>
                </div>

                {jumpServersOpen && (
                  <div className="border border-surface-container-high rounded overflow-hidden">
                    {/* Toolbar */}
                    <div className="flex items-center gap-1 p-1 bg-surface-container/60 border-b border-surface-container-high">
                      <button
                        type="button"
                        onClick={handleAddJumpServer}
                        className="p-1 rounded hover:bg-surface-container text-on-surface-variant hover:text-primary cursor-pointer"
                        title="Add Jump Server"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveJumpServer}
                        disabled={selectedJumpRow === 'target'}
                        className="p-1 rounded hover:bg-surface-container text-on-surface-variant hover:text-rose-400 cursor-pointer disabled:opacity-40"
                        title="Delete selected Jump Server"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveJumpServer('up')}
                        disabled={selectedJumpRow === 'target'}
                        className="p-1 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface cursor-pointer disabled:opacity-40"
                        title="Move Up"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveJumpServer('down')}
                        disabled={selectedJumpRow === 'target'}
                        className="p-1 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface cursor-pointer disabled:opacity-40"
                        title="Move Down"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Table */}
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-surface-container text-on-surface-variant text-[11px] border-b border-surface-container-high font-sans">
                        <tr>
                          <th className="py-1 px-3 w-28 font-medium">Order</th>
                          <th className="py-1 px-3 font-medium">Host</th>
                          <th className="py-1 px-3 w-32 font-medium">User</th>
                          <th className="py-1 px-3 w-32 font-medium">Authentication</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Target Row (Always present, blue highlight matching screenshot) */}
                        <tr
                          onClick={() => setSelectedJumpRow('target')}
                          className={`cursor-pointer ${
                            selectedJumpRow === 'target'
                              ? 'bg-blue-600 text-white font-medium'
                              : 'hover:bg-surface-container text-on-surface'
                          }`}
                        >
                          <td className="py-1.5 px-3">Target</td>
                          <td className="py-1.5 px-3">{sshHost}:{sshPort}</td>
                          <td className="py-1.5 px-3">{sshUser}</td>
                          <td className="py-1.5 px-3">{sshAuthMethod}</td>
                        </tr>

                        {/* Extra Jump Servers */}
                        {jumpServers.map((js) => (
                          <tr
                            key={js.id}
                            onClick={() => setSelectedJumpRow(js.id)}
                            className={`cursor-pointer ${
                              selectedJumpRow === js.id
                                ? 'bg-blue-600 text-white font-medium'
                                : 'hover:bg-surface-container text-on-surface'
                            }`}
                          >
                            <td className="py-1.5 px-3">{js.order}</td>
                            <td className="py-1.5 px-3">{js.host}:{js.port}</td>
                            <td className="py-1.5 px-3">{js.user}</td>
                            <td className="py-1.5 px-3">{js.authMethod}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 3. Advanced settings (Collapsible General, Timeouts, Port Forwarding) */}
              <div>
                <div
                  className="flex items-center gap-1 text-xs font-bold text-on-surface cursor-pointer select-none mb-1.5"
                  onClick={() => setSshAdvancedOpen(!sshAdvancedOpen)}
                >
                  <span className="text-[10px] text-on-surface-variant">
                    {sshAdvancedOpen ? '▾' : '▸'}
                  </span>
                  <span>Advanced settings</span>
                </div>

                {sshAdvancedOpen && (
                  <div className="space-y-3.5 pl-2">
                    {/* General & Timeouts Grid */}
                    <div className="grid grid-cols-2 gap-6">
                      {/* Left: General */}
                      <div className="space-y-2">
                        <div className="text-[11px] font-bold text-on-surface">General</div>
                        <div className="flex items-center gap-3">
                          <label className="w-24 text-on-surface-variant">Implementation:</label>
                          <select
                            value={sshImplementation}
                            onChange={(e) => setSshImplementation(e.target.value as any)}
                            className="w-24 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2 py-0.5 text-xs outline-none cursor-pointer"
                          >
                            <option value="SSHJ">SSHJ</option>
                            <option value="JSch">JSch</option>
                          </select>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer text-on-surface-variant hover:text-on-surface text-xs">
                          <input
                            type="checkbox"
                            checked={bypassHostVerification}
                            onChange={(e) => setBypassHostVerification(e.target.checked)}
                            className="rounded bg-surface-container border-outline-variant cursor-pointer text-primary"
                          />
                          <span>Bypass host verification</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-on-surface-variant hover:text-on-surface text-xs">
                          <input
                            type="checkbox"
                            checked={shareTunnel}
                            onChange={(e) => setShareTunnel(e.target.checked)}
                            className="rounded bg-surface-container border-outline-variant cursor-pointer text-primary"
                          />
                          <span>Share this tunnel with other connections</span>
                        </label>
                      </div>

                      {/* Right: Timeouts */}
                      <div className="space-y-2">
                        <div className="text-[11px] font-bold text-on-surface">Timeouts</div>
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-on-surface-variant">
                            Keep-Alive interval (ms):
                          </label>
                          <input
                            type="number"
                            value={keepAliveIntervalMs}
                            onChange={(e) => setKeepAliveIntervalMs(e.target.value)}
                            placeholder="0"
                            className="w-20 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2 py-0.5 text-xs font-mono outline-none text-right"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-on-surface-variant">
                            Tunnel connect timeout (ms):
                          </label>
                          <input
                            type="number"
                            value={tunnelConnectTimeoutMs}
                            onChange={(e) => setTunnelConnectTimeoutMs(e.target.value)}
                            placeholder="0"
                            className="w-20 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2 py-0.5 text-xs font-mono outline-none text-right"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Port Forwarding */}
                    <div className="pt-2 border-t border-surface-container-high/60">
                      <div className="text-[11px] font-bold text-on-surface mb-2">
                        Port Forwarding
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <label className="w-24 text-on-surface-variant">Local host:</label>
                            <input
                              type="text"
                              value={localHost}
                              onChange={(e) => setLocalHost(e.target.value)}
                              placeholder=""
                              className="flex-1 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2 py-0.5 text-xs font-mono outline-none"
                            />
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="w-24 text-on-surface-variant">Remote host:</label>
                            <input
                              type="text"
                              value={remoteHost}
                              onChange={(e) => setRemoteHost(e.target.value)}
                              placeholder=""
                              className="flex-1 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2 py-0.5 text-xs font-mono outline-none"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-on-surface-variant">Local port:</label>
                            <input
                              type="number"
                              value={localPort}
                              onChange={(e) => setLocalPort(e.target.value)}
                              placeholder="0"
                              className="w-20 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2 py-0.5 text-xs font-mono outline-none text-right"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-on-surface-variant">Remote port:</label>
                            <input
                              type="number"
                              value={remotePort}
                              onChange={(e) => setRemotePort(e.target.value)}
                              placeholder="0"
                              className="w-20 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2 py-0.5 text-xs font-mono outline-none text-right"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Bottom SSH Action Bar (Test tunnel configuration button & links) */}
              <div className="flex items-center justify-between pt-3 border-t border-surface-container-high/60 mt-4 text-xs">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleTestSshTunnel}
                    disabled={isTestingSsh}
                    className="flex items-center gap-1.5 px-3 py-1 rounded bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant text-on-surface text-xs font-medium cursor-pointer transition-colors disabled:opacity-60 shadow-xs"
                  >
                    {isTestingSsh ? (
                      <RotateCw className="w-3.5 h-3.5 animate-spin text-primary" />
                    ) : (
                      <Check className="w-3.5 h-3.5 text-primary" />
                    )}
                    <span>Test tunnel configuration</span>
                  </button>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowVariablesHelp(!showVariablesHelp)}
                      className="text-secondary hover:text-secondary-fixed text-xs flex items-center gap-1 cursor-pointer underline underline-offset-2"
                    >
                      <Info className="w-3.5 h-3.5" />
                      <span>You can use variables in SSH parameters.</span>
                    </button>

                    {showVariablesHelp && (
                      <div className="absolute bottom-full left-0 mb-2 w-72 p-3 bg-surface-container-low border border-surface-container-highest rounded-lg shadow-2xl text-[11px] text-on-surface z-50 animate-in fade-in zoom-in-95 duration-100">
                        <div className="font-semibold text-primary mb-1">
                          Variabel Parameter SSH:
                        </div>
                        <ul className="space-y-1 font-mono text-[10px] text-on-surface-variant">
                          <li><strong className="text-on-surface">${'{host}'}</strong> - Host database target</li>
                          <li><strong className="text-on-surface">${'{port}'}</strong> - Port target ({port})</li>
                          <li><strong className="text-on-surface">${'{user}'}</strong> - Username database ({username})</li>
                          <li><strong className="text-on-surface">${'{database}'}</strong> - Nama database ({database})</li>
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                <a
                  href="https://dbeaver.com/docs/wiki/SSH-Configuration/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-secondary hover:text-secondary-fixed flex items-center gap-1 underline underline-offset-2 text-xs"
                >
                  <span>SSH Documentation</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* SSH Test Result Alert Banner */}
              {sshTestFeedback && (
                <div
                  className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                    sshTestFeedback.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {sshTestFeedback.success ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{sshTestFeedback.message}</p>
                    {sshTestFeedback.latency_ms !== undefined && (
                      <p className="text-[11px] opacity-80 mt-0.5">
                        Handshake latency: {sshTestFeedback.latency_ms.toFixed(2)} ms
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: SSL */}
          {activeTab === 'ssl' && (
            <div className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer text-on-surface font-semibold">
                <input
                  type="checkbox"
                  checked={useSsl}
                  onChange={(e) => setUseSsl(e.target.checked)}
                  className="rounded bg-surface-container border-outline-variant cursor-pointer text-primary"
                />
                <span>Use SSL / TLS Encryption</span>
              </label>

              {useSsl && (
                <div className="space-y-3.5 pl-6 border-l-2 border-surface-container-high pt-1">
                  <div className="flex items-center gap-4">
                    <label className="w-28 text-on-surface-variant">SSL Mode:</label>
                    <select
                      value={sslMode}
                      onChange={(e) => setSslMode(e.target.value)}
                      className="w-48 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1.5 text-xs outline-none cursor-pointer"
                    >
                      <option value="require">require</option>
                      <option value="prefer">prefer</option>
                      <option value="allow">allow</option>
                      <option value="verify-ca">verify-ca</option>
                      <option value="verify-full">verify-full</option>
                      <option value="disable">disable</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: PROXY */}
          {activeTab === 'proxy' && (
            <div className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer text-on-surface font-semibold">
                <input
                  type="checkbox"
                  checked={useProxy}
                  onChange={(e) => setUseProxy(e.target.checked)}
                  className="rounded bg-surface-container border-outline-variant cursor-pointer text-primary"
                />
                <span>Use Proxy</span>
              </label>

              {useProxy && (
                <div className="space-y-3.5 pl-6 border-l-2 border-surface-container-high pt-1">
                  <div className="flex items-center gap-4">
                    <label className="w-24 text-on-surface-variant">Proxy Type:</label>
                    <select
                      value={proxyType}
                      onChange={(e) => setProxyType(e.target.value)}
                      className="w-36 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1.5 text-xs outline-none cursor-pointer"
                    >
                      <option value="SOCKS5">SOCKS5</option>
                      <option value="HTTP">HTTP</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="w-24 text-on-surface-variant">Proxy Host:</label>
                    <input
                      type="text"
                      value={proxyHost}
                      onChange={(e) => setProxyHost(e.target.value)}
                      placeholder="127.0.0.1"
                      className="flex-1 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1.5 text-xs font-mono outline-none"
                    />
                    <label className="text-on-surface-variant">Port:</label>
                    <input
                      type="text"
                      value={proxyPort}
                      onChange={(e) => setProxyPort(e.target.value)}
                      placeholder="1080"
                      className="w-20 bg-surface-container border border-outline-variant focus:border-primary text-on-surface rounded px-2.5 py-1.5 text-xs font-mono outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. Footer Toolbar (DBeaver style with Test Connection, Driver Settings, Cancel, Finish) */}
        <div className="px-4 py-2.5 bg-surface-container border-t border-surface-container-high flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleTestConnection}
              disabled={isTesting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant text-xs font-medium transition-colors cursor-pointer disabled:opacity-60 shadow-xs"
            >
              {isTesting ? (
                <RotateCw className="w-3.5 h-3.5 animate-spin text-primary" />
              ) : testSuccess === true ? (
                <Check className="w-3.5 h-3.5 text-primary" />
              ) : null}
              <span>{isTesting ? 'Testing...' : 'Test Connection ...'}</span>
            </button>

            <span className="text-[11px] text-on-surface-variant hidden md:inline">
              Driver name: <strong className="text-on-surface">PostgreSQL</strong>
            </span>

            <button
              type="button"
              onClick={() => onShowToast('Driver: PostgreSQL JDBC 42.7.2 (bundled)', 'info')}
              className="px-2.5 py-1 rounded-md bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant text-on-surface-variant hover:text-on-surface text-[11px] transition-colors cursor-pointer"
            >
              Driver Settings
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant text-on-surface text-xs font-medium transition-colors cursor-pointer shadow-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAndConnect}
              className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold transition-all shadow cursor-pointer"
            >
              Finish
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
