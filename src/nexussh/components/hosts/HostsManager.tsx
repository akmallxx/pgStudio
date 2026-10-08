import React, { useState, useEffect } from 'react';
import {
  Server,
  Terminal,
  FolderTree,
  MoreVertical,
  Key,
  Trash2,
  Edit2,
  Copy,
  Search,
  Plus,
  Eye,
  EyeOff,
  Lock,
  Cpu,
  Activity,
  Check,
  ShieldCheck,
  Sparkles,
  Wifi,
  ExternalLink,
} from 'lucide-react';
import { Host, HostEnvironment } from 'nexussh/types/ssh';
import { Button } from 'nexussh/components/ui/button';
import { Dialog } from 'nexussh/components/ui/dialog';
import { Input, Textarea, Select } from 'nexussh/components/ui/input';
import { Label } from 'nexussh/components/ui/label';
import { useToast } from 'nexussh/components/ui/toast';
import { cn } from 'nexussh/utils/cn';

interface HostsManagerProps {
  hosts: Host[];
  onConnectSSH: (host: Host) => void;
  onOpenSFTP: (host: Host) => void;
  onAddHost: (host: Host) => void;
  onUpdateHost: (host: Host) => void;
  onDeleteHost: (hostId: string) => void;
  isAddModalOpen: boolean;
  setIsAddModalOpen: (open: boolean) => void;
}

const getEnvironmentBadge = (env?: string) => {
  switch (env) {
    case 'Production':
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
          PROD
        </span>
      );
    case 'Database':
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
          DB
        </span>
      );
    case 'Staging':
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          STAGING
        </span>
      );
    case 'Homelab':
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
          HOMELAB
        </span>
      );
    case 'Cloud':
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
          CLOUD
        </span>
      );
    default:
      return null;
  }
};

export function HostsManager({
  hosts,
  onConnectSSH,
  onOpenSFTP,
  onAddHost,
  onUpdateHost,
  onDeleteHost,
  isAddModalOpen,
  setIsAddModalOpen,
}: HostsManagerProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'online' | 'key' | 'password'>('all');
  const [editingHost, setEditingHost] = useState<Host | null>(null);
  const [activeMenuHostId, setActiveMenuHostId] = useState<string | null>(null);
  const [copiedHostId, setCopiedHostId] = useState<string | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formHostname, setFormHostname] = useState('');
  const [formPort, setFormPort] = useState('22');
  const [formUsername, setFormUsername] = useState('root');
  const [formAuthType, setFormAuthType] = useState<'key' | 'password' | 'agent'>('key');
  const [formKeyName, setFormKeyName] = useState('id_ed25519');
  const [formPassword, setFormPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formEnvironment, setFormEnvironment] = useState<HostEnvironment>('Production');
  const [formTags, setFormTags] = useState('api, cluster');
  const [formNotes, setFormNotes] = useState('');

  // Close popup menu on click outside
  useEffect(() => {
    const handleOutside = () => setActiveMenuHostId(null);
    window.addEventListener('click', handleOutside);
    return () => window.removeEventListener('click', handleOutside);
  }, []);

  const filteredHosts = hosts.filter((h) => {
    const query = searchQuery.toLowerCase();
    const hName = (h.name || '').toLowerCase();
    const hHost = (h.hostname || (h as any).host || '').toLowerCase();
    const hUser = (h.username || (h as any).user || '').toLowerCase();
    const matchesSearch =
      hName.includes(query) ||
      hHost.includes(query) ||
      hUser.includes(query) ||
      (h.tags || []).some((t) => (t || '').toLowerCase().includes(query));

    if (!matchesSearch) return false;

    if (filterType === 'online') return h.status === 'online';
    if (filterType === 'key') return h.authType === 'key';
    if (filterType === 'password') return h.authType === 'password';

    return true;
  });

  const handleOpenAdd = () => {
    setEditingHost(null);
    setFormName('');
    setFormHostname('');
    setFormPort('22');
    setFormUsername('root');
    setFormAuthType('key');
    setFormKeyName('id_ed25519');
    setFormPassword('');
    setShowPassword(false);
    setFormEnvironment('Production');
    setFormTags('');
    setFormNotes('');
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (host: Host) => {
    setEditingHost(host);
    setFormName(host.name || '');
    setFormHostname(host.hostname || (host as any).host || '');
    setFormPort(host.port ? host.port.toString() : '22');
    setFormUsername(host.username || (host as any).user || 'root');
    setFormAuthType(host.authType || 'key');
    setFormKeyName(host.keyName || 'id_ed25519');
    setFormPassword(host.password || '');
    setShowPassword(false);
    setFormEnvironment(host.environment || 'Production');
    setFormTags(host.tags ? host.tags.join(', ') : '');
    setFormNotes(host.notes || '');
    setActiveMenuHostId(null);
  };

  const handleSaveHost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formHostname.trim()) {
      toast({ title: 'Validasi Gagal', description: 'Nama host dan alamat IP/hostname wajib diisi.', type: 'error' });
      return;
    }

    const hostPayload: Host = {
      id: editingHost ? editingHost.id : `host-${Date.now()}`,
      name: formName.trim(),
      hostname: formHostname.trim(),
      port: parseInt(formPort, 10) || 22,
      username: formUsername.trim(),
      authType: formAuthType,
      keyName: formAuthType === 'key' ? formKeyName.trim() : undefined,
      password: formAuthType === 'password' ? formPassword : undefined,
      environment: formEnvironment,
      tags: formTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      status: editingHost ? editingHost.status : 'online',
      latencyMs: editingHost ? editingHost.latencyMs : Math.floor(Math.random() * 25) + 8,
      notes: formNotes.trim(),
    };

    if (editingHost) {
      onUpdateHost(hostPayload);
      toast({ title: 'Host diperbarui', description: hostPayload.name, type: 'success' });
      setEditingHost(null);
    } else {
      onAddHost(hostPayload);
      toast({ title: 'Host ditambahkan', description: hostPayload.name, type: 'success' });
      setIsAddModalOpen(false);
    }
  };

  const copyConnectionString = (host: Host) => {
    const port = host.port || 22;
    const user = host.username || (host as any).user || 'root';
    const hname = host.hostname || (host as any).host || '127.0.0.1';
    const cmd = port === 22 ? `ssh ${user}@${hname}` : `ssh -p ${port} ${user}@${hname}`;
    navigator.clipboard.writeText(cmd);
    setCopiedHostId(host.id);
    setTimeout(() => setCopiedHostId(null), 2000);
    toast({ title: 'Perintah SSH disalin', description: cmd, type: 'info' });
    setActiveMenuHostId(null);
  };

  return (
    <div className="flex flex-col h-full bg-surface text-on-surface overflow-y-auto">
      {/* Top Banner / Filter Toolbar */}
      <div className="border-b border-surface-container-high/60 bg-surface-container-low/70 backdrop-blur-sm sticky top-0 z-10 p-3 sm:p-4 px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 max-w-8xl mx-auto w-full">
          {/* Title & Stats */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center shrink-0 border border-secondary/20 shadow-xs">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-on-surface tracking-tight">
                  SSH Server Fleet
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-surface-container text-on-surface-variant border border-surface-container-high">
                  {hosts.length} Server
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant/80 hidden sm:block">
                Kelola instance Linux, VM, server PostgreSQL, dan akses SSH aman
              </p>
            </div>
          </div>

          {/* Search, Filter Pills & Add Action */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Box */}
            <div className="relative flex-1 sm:w-60 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant pointer-events-none" />
              <input
                type="text"
                placeholder="Cari host, IP, user, tag..."
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
                  { id: 'online', label: 'Online' },
                  { id: 'key', label: 'SSH Key' },
                  { id: 'password', label: 'Password' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterType(tab.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer',
                    filterType === tab.id
                      ? 'bg-surface-container-high text-on-surface font-semibold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="p-4 sm:p-6 max-w-8xl w-full mx-auto space-y-4">
        {filteredHosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 sm:p-16 border border-dashed border-surface-container-high rounded-2xl text-center bg-surface-container-low/40">
            <div className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center text-on-surface-variant mb-3 border border-surface-container-high">
              <Server className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-on-surface">Tidak ada server yang cocok</h3>
            <p className="text-xs text-on-surface-variant/80 mt-1 max-w-sm">
              {searchQuery
                ? `Tidak ditemukan host dengan kata kunci "${searchQuery}". Coba bersihkan pencarian.`
                : 'Belum ada host server yang terdaftar. Tambahkan server SSH pertama Anda.'}
            </p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={handleOpenAdd}>
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Host Baru</span>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
            {filteredHosts.map((host) => {
              const isOnline = host.status === 'online';
              const isMenuOpen = activeMenuHostId === host.id;
              const displayHost = host.hostname || (host as any).host || '127.0.0.1';
              const displayUser = host.username || (host as any).user || 'root';
              const displayPort = host.port || 22;
              const displayName = host.name || 'Server Host';

              return (
                <div
                  key={host.id}
                  className="group relative flex flex-col justify-between rounded-xl border border-surface-container-high/80 bg-surface-container-low p-4 shadow-sm hover:shadow-md hover:border-primary/50 transition-all duration-200"
                >
                  {/* Top Card Row: Icon, Title, Status, Environment, and Menu */}
                  <div>
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center text-primary border border-surface-container-high shrink-0 shadow-2xs group-hover:border-primary/40 group-hover:text-primary transition-colors">
                          <Server className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3
                              className="text-xs sm:text-sm font-bold text-on-surface truncate group-hover:text-primary transition-colors"
                              title={displayName}
                            >
                              {displayName}
                            </h3>
                            {getEnvironmentBadge(host.environment)}
                          </div>

                          {/* Meta: Auth type, Latency, OS */}
                          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-on-surface-variant flex-wrap">
                            <span className="inline-flex items-center gap-1 font-medium">
                              {host.authType === 'key' ? (
                                <Key className="w-3 h-3 text-secondary shrink-0" />
                              ) : host.authType === 'password' ? (
                                <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                              ) : (
                                <Cpu className="w-3 h-3 text-emerald-400 shrink-0" />
                              )}
                              <span className="truncate max-w-[100px]">
                                {host.authType === 'key'
                                  ? host.keyName || 'SSH Key'
                                  : host.authType === 'password'
                                  ? 'Password'
                                  : 'Agent'}
                              </span>
                            </span>

                            {host.latencyMs !== undefined && (
                              <>
                                <span className="text-surface-container-highest">·</span>
                                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-surface-container text-emerald-400 border border-emerald-500/20 font-semibold">
                                  {host.latencyMs}ms
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Dropdown Menu Toggle */}
                      <div className="relative shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuHostId(isMenuOpen ? null : host.id);
                          }}
                          className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                          title="Opsi Host"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {/* Floating Action Menu */}
                        {isMenuOpen && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-full mt-1.5 w-48 rounded-xl border border-surface-container-high bg-surface-container-low p-1 shadow-xl z-20 text-xs animate-in zoom-in-95"
                          >
                            <button
                              onClick={() => handleOpenEdit(host)}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface-container text-on-surface text-left transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-on-surface-variant" />
                              <span>Edit Host</span>
                            </button>

                            <button
                              onClick={() => copyConnectionString(host)}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface-container text-on-surface text-left transition-colors cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5 text-on-surface-variant" />
                              <span>Salin Perintah SSH</span>
                            </button>

                            <div className="my-1 border-t border-surface-container-high" />

                            <button
                              onClick={() => {
                                if (confirm(`Hapus host "${displayName}"?`)) {
                                  onDeleteHost(host.id);
                                  toast({ title: 'Host dihapus', description: displayName, type: 'info' });
                                }
                                setActiveMenuHostId(null);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/10 text-rose-400 text-left transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                              <span>Hapus Host</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Connection Endpoint Bar */}
                    <div className="mt-3 p-2 rounded-lg bg-surface-container border border-surface-container-high/60 flex items-center justify-between gap-2 text-[11px] font-mono group/code">
                      <div className="truncate text-on-surface">
                        <span className="text-secondary font-semibold">{displayUser}@</span>
                        <span>{displayHost}</span>
                        <span className="text-on-surface-variant">:{displayPort}</span>
                      </div>
                      <button
                        onClick={() => copyConnectionString(host)}
                        className="text-on-surface-variant hover:text-primary transition-colors shrink-0 cursor-pointer p-0.5 rounded hover:bg-surface-container-high"
                        title="Salin string koneksi"
                      >
                        {copiedHostId === host.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 opacity-60 group-hover/code:opacity-100" />
                        )}
                      </button>
                    </div>

                    {/* Tags */}
                    {host.tags && host.tags.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                        {host.tags.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant border border-surface-container-highest font-mono"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}

                    {host.notes && (
                      <p className="mt-2 text-[11px] text-on-surface-variant/80 line-clamp-1 italic">
                        {host.notes}
                      </p>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="mt-3.5 pt-3 border-t border-surface-container-high/60 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => onConnectSSH(host)}
                      className="flex-1 gap-1.5 font-semibold text-xs h-8 shadow-xs"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>Hubungkan SSH</span>
                    </Button>

                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onOpenSFTP(host)}
                      className="gap-1.5 px-3 text-xs h-8"
                      title="Buka SFTP File Explorer"
                    >
                      <FolderTree className="w-3.5 h-3.5 text-amber-400" />
                      <span>SFTP</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Host Modal Dialog */}
      <Dialog
        open={isAddModalOpen || editingHost !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddModalOpen(false);
            setEditingHost(null);
          }
        }}
        title={editingHost ? 'Edit Host SSH' : 'Tambah Host SSH Baru'}
        description="Konfigurasikan alamat server dan kredensial autentikasi SSH"
        maxWidth="md"
      >
        <form onSubmit={handleSaveHost} className="space-y-4 text-xs font-sans">
          {/* Host Name */}
          <div className="space-y-1.5">
            <Label htmlFor="host-name" required>Nama Host / Label Server</Label>
            <Input
              id="host-name"
              placeholder="e.g. Production PostgreSQL Server"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
            />
          </div>

          {/* Environment */}
          <div className="space-y-1.5">
            <Label htmlFor="host-env">Environment</Label>
            <Select
              id="host-env"
              value={formEnvironment}
              onChange={(e) => setFormEnvironment(e.target.value as HostEnvironment)}
            >
              <option value="Production">Production</option>
              <option value="Database">Database</option>
              <option value="Staging">Staging</option>
              <option value="Homelab">Homelab</option>
              <option value="Cloud">Cloud</option>
              <option value="Development">Development</option>
            </Select>
          </div>

          {/* Hostname & Port */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="host-ip" required>Alamat IP / Domain Host</Label>
              <Input
                id="host-ip"
                placeholder="192.241.140.22 atau db.example.com"
                value={formHostname}
                onChange={(e) => setFormHostname(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="host-port" required>Port SSH</Label>
              <Input
                id="host-port"
                type="number"
                placeholder="22"
                value={formPort}
                onChange={(e) => setFormPort(e.target.value)}
                required
              />
            </div>
          </div>

          {/* User Login */}
          <div className="space-y-1.5">
            <Label htmlFor="host-user" required>Username SSH</Label>
            <Input
              id="host-user"
              placeholder="root / ubuntu / postgres"
              value={formUsername}
              onChange={(e) => setFormUsername(e.target.value)}
              required
            />
          </div>

          {/* Metode Autentikasi */}
          <div className="space-y-3 pt-2 border-t border-surface-container-high/80">
            <div className="space-y-1.5">
              <Label>Metode Autentikasi</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['key', 'password', 'agent'] as const).map((method) => (
                  <button
                    type="button"
                    key={method}
                    onClick={() => setFormAuthType(method)}
                    className={cn(
                      'py-2 px-3 text-xs rounded-lg border text-center font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer',
                      formAuthType === method
                        ? 'bg-primary text-on-primary border-primary shadow-xs font-semibold'
                        : 'border-surface-container-high bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                    )}
                  >
                    {method === 'key' ? (
                      <>
                        <Key className="w-3.5 h-3.5" />
                        <span>SSH Key</span>
                      </>
                    ) : method === 'password' ? (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>Password</span>
                      </>
                    ) : (
                      <>
                        <Cpu className="w-3.5 h-3.5" />
                        <span>Agent</span>
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Kolom Kunci SSH */}
            {formAuthType === 'key' && (
              <div className="space-y-1.5">
                <Label htmlFor="host-key">Nama Kunci SSH (Key Reference)</Label>
                <Input
                  id="host-key"
                  placeholder="id_ed25519 atau id_rsa_production"
                  value={formKeyName}
                  onChange={(e) => setFormKeyName(e.target.value)}
                  hint="Kunci akan dimuat dari SSH agent lokal atau direktori ~/.ssh/"
                />
              </div>
            )}

            {/* Kolom Password SSH */}
            {formAuthType === 'password' && (
              <div className="space-y-1.5">
                <Label htmlFor="host-password" required>Password SSH</Label>
                <div className="relative flex items-center">
                  <Input
                    id="host-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Masukkan password akun SSH"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 text-on-surface-variant hover:text-on-surface cursor-pointer"
                    title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}

            {/* SSH Agent Notice */}
            {formAuthType === 'agent' && (
              <div className="p-3 rounded-lg border border-surface-container-high bg-surface-container text-[11px] text-on-surface-variant flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Koneksi akan mengautentikasi otomatis menggunakan SSH agent lokal (`$SSH_AUTH_SOCK`).</span>
              </div>
            )}
          </div>

          {/* Section: Tag & Catatan */}
          <div className="space-y-3 pt-2 border-t border-surface-container-high/80">
            <div className="space-y-1.5">
              <Label htmlFor="host-tags">Tags (Dipisahkan koma)</Label>
              <Input
                id="host-tags"
                placeholder="postgres, api, prod, docker"
                value={formTags}
                onChange={(e) => setFormTags(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="host-notes">Catatan Tambahan (Opsional)</Label>
              <Textarea
                id="host-notes"
                placeholder="Info konfigurasi, server maintenance schedule, dll..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-container-high/80">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAddModalOpen(false);
                setEditingHost(null);
              }}
            >
              Batal
            </Button>
            <Button type="submit" size="sm">
              {editingHost ? 'Simpan Perubahan' : 'Tambah Host'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
