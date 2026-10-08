import React, { useState } from 'react';
import {
  Network,
  Plus,
  Trash2,
  Copy,
  ArrowRight,
  Server,
  Check,
  Radio,
  Wifi,
  ExternalLink,
} from 'lucide-react';
import { PortForwardRule, Host, TunnelType } from 'nexussh/types/ssh';
import { Button } from 'nexussh/components/ui/button';
import { Dialog } from 'nexussh/components/ui/dialog';
import { Input, Select } from 'nexussh/components/ui/input';
import { Label } from 'nexussh/components/ui/label';
import { Switch } from 'nexussh/components/ui/switch';
import { useToast } from 'nexussh/components/ui/toast';
import { cn } from 'nexussh/utils/cn';

interface PortForwardingViewProps {
  tunnels: PortForwardRule[];
  hosts: Host[];
  onToggleTunnel: (tunnelId: string) => void;
  onAddTunnel: (tunnel: PortForwardRule) => void;
  onDeleteTunnel: (tunnelId: string) => void;
}

export function PortForwardingView({
  tunnels,
  hosts,
  onToggleTunnel,
  onAddTunnel,
  onDeleteTunnel,
}: PortForwardingViewProps) {
  const { toast } = useToast();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formHostId, setFormHostId] = useState(hosts[0]?.id || '');
  const [formType, setFormType] = useState<TunnelType>('local');
  const [formBindAddress, setFormBindAddress] = useState('127.0.0.1');
  const [formBindPort, setFormBindPort] = useState('5433');
  const [formTargetHost, setFormTargetHost] = useState('127.0.0.1');
  const [formTargetPort, setFormTargetPort] = useState('5432');
  const [formAutoStart, setFormAutoStart] = useState(true);
  const [formDescription, setFormDescription] = useState('');

  const handleCreateTunnel = (e: React.FormEvent) => {
    e.preventDefault();
    const host = hosts.find((h) => h.id === formHostId) || hosts[0];
    if (!host) {
      toast({ title: 'Server tidak tersedia', description: 'Tambahkan host terlebih dahulu.', type: 'error' });
      return;
    }

    const newRule: PortForwardRule = {
      id: `tun-${Date.now()}`,
      name: formName.trim() || `${formType.toUpperCase()} :${formBindPort}`,
      hostId: host.id,
      hostName: host.name,
      type: formType,
      bindAddress: formBindAddress.trim() || '127.0.0.1',
      bindPort: parseInt(formBindPort, 10) || 5433,
      targetHost: formType !== 'dynamic' ? (formTargetHost.trim() || '127.0.0.1') : undefined,
      targetPort: formType !== 'dynamic' ? (parseInt(formTargetPort, 10) || 5432) : undefined,
      isActive: formAutoStart,
      activeConnections: 0,
      trafficUpMb: 0,
      trafficDownMb: 0,
      description: formDescription.trim(),
    };

    onAddTunnel(newRule);
    toast({
      title: 'Aturan tunnel berhasil dibuat',
      description: `${newRule.bindAddress}:${newRule.bindPort}`,
      type: 'success',
    });
    setIsAddModalOpen(false);
  };

  const getCLICommand = (rule: PortForwardRule) => {
    const host = hosts.find((h) => h.id === rule.hostId);
    const hostTarget = host ? `${host.username}@${host.hostname}` : 'user@host';

    if (rule.type === 'local') {
      return `ssh -L ${rule.bindAddress}:${rule.bindPort}:${rule.targetHost}:${rule.targetPort} ${hostTarget} -N`;
    }
    if (rule.type === 'remote') {
      return `ssh -R ${rule.bindAddress}:${rule.bindPort}:${rule.targetHost}:${rule.targetPort} ${hostTarget} -N`;
    }
    return `ssh -D ${rule.bindAddress}:${rule.bindPort} ${hostTarget} -N`;
  };

  const handleCopyCLI = (rule: PortForwardRule) => {
    const cmd = getCLICommand(rule);
    navigator.clipboard.writeText(cmd);
    setCopiedId(rule.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: 'Perintah SSH tunnel disalin ke clipboard', description: cmd, type: 'info' });
  };

  return (
    <div className="flex flex-col h-full bg-surface text-on-surface overflow-y-auto">
      {/* Top Banner Toolbar */}
      <div className="border-b border-surface-container-high/60 bg-surface-container-low/70 backdrop-blur-sm sticky top-0 z-10 p-3 sm:p-4 px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center shrink-0 border border-secondary/20 shadow-xs">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-on-surface tracking-tight">
                  Port Forwarding & Tunnels
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-surface-container text-on-surface-variant border border-surface-container-high">
                  {tunnels.length} Aturan
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant/80 hidden sm:block">
                Terowongan SSH aman untuk koneksi database remote, port forward lokal & proxy SOCKS5
              </p>
            </div>
          </div>

          <Button size="sm" onClick={() => setIsAddModalOpen(true)} className="gap-1.5 shrink-0 shadow-sm">
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Tunnel Baru</span>
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-4">
        {tunnels.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 sm:p-16 border border-dashed border-surface-container-high rounded-2xl text-center bg-surface-container-low/40">
            <div className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center text-on-surface-variant mb-3 border border-surface-container-high">
              <Network className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-on-surface">Belum ada port forwarding yang dibuat</h3>
            <p className="text-xs text-on-surface-variant/80 mt-1 max-w-sm">
              Buat terowongan SSH untuk mem-forward port PostgreSQL atau service remote ke komputer lokal Anda.
            </p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={() => setIsAddModalOpen(true)}>
              <Plus className="w-3.5 h-3.5" />
              <span>Buat Tunnel Pertama</span>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {tunnels.map((rule) => {
              const isCopied = copiedId === rule.id;

              return (
                <div
                  key={rule.id}
                  className="rounded-xl border border-surface-container-high bg-surface-container-low p-4 shadow-sm hover:border-primary/40 hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Left: Status Toggle + Name + Gateway */}
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="pt-0.5">
                      <Switch
                        checked={rule.isActive}
                        onCheckedChange={() => {
                          onToggleTunnel(rule.id);
                          toast({
                            title: rule.isActive ? 'Tunnel dinonaktifkan' : 'Tunnel aktif',
                            description: `${rule.bindAddress}:${rule.bindPort}`,
                            type: rule.isActive ? 'info' : 'success',
                          });
                        }}
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-on-surface truncate">{rule.name}</h4>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-surface-container text-secondary border border-surface-container-high">
                          {rule.type === 'local' ? 'Local Forward (-L)' : rule.type === 'remote' ? 'Remote Forward (-R)' : 'SOCKS Proxy (-D)'}
                        </span>
                        <span className={cn(
                          'text-[10px] font-bold px-1.5 py-0.2 rounded-full',
                          rule.isActive
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-surface-container text-on-surface-variant'
                        )}>
                          {rule.isActive ? 'ACTIVE' : 'IDLE'}
                        </span>
                      </div>

                      {rule.description && (
                        <p className="text-xs text-on-surface-variant/80 mt-0.5 truncate">{rule.description}</p>
                      )}

                      <div className="flex items-center gap-2 mt-1 text-[11px] text-on-surface-variant">
                        <Server className="w-3.5 h-3.5 text-secondary" />
                        <span>Gateway: <strong className="text-on-surface">{rule.hostName}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Visual Port Flow */}
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-surface-container border border-surface-container-high/60 font-mono text-xs overflow-x-auto">
                    <span className="text-primary font-bold">{rule.bindAddress}:{rule.bindPort}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-on-surface-variant shrink-0" />
                    <span className="text-emerald-400 font-bold">
                      {rule.type === 'dynamic' ? 'Dynamic SOCKS5' : `${rule.targetHost}:${rule.targetPort}`}
                    </span>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant={isCopied ? 'subtle' : 'secondary'}
                      onClick={() => handleCopyCLI(rule)}
                      className="gap-1.5 text-xs h-8"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-semibold">Tersalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin CLI</span>
                        </>
                      )}
                    </Button>

                    <button
                      onClick={() => {
                        if (confirm(`Hapus aturan tunnel "${rule.name}"?`)) {
                          onDeleteTunnel(rule.id);
                          toast({ title: 'Tunnel dihapus', type: 'info' });
                        }
                      }}
                      className="p-2 rounded-lg text-on-surface-variant hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Hapus Aturan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Tunnel Modal */}
      <Dialog
        open={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        title="Buat Aturan SSH Port Forwarding"
        description="Terowongkan port lokal atau remote melalui server SSH gateway"
        maxWidth="md"
      >
        <form onSubmit={handleCreateTunnel} className="space-y-4 text-xs font-sans">
          <div className="space-y-1.5">
            <Label htmlFor="tun-name" required>Nama / Label Tunnel</Label>
            <Input
              id="tun-name"
              placeholder="e.g. Postgres Remote DB 5432 ke Lokal 5433"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tun-host">Gateway SSH Host</Label>
              <Select
                id="tun-host"
                value={formHostId}
                onChange={(e) => setFormHostId(e.target.value)}
              >
                {hosts.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.hostname})
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tun-type">Tipe Forwarding</Label>
              <Select
                id="tun-type"
                value={formType}
                onChange={(e) => setFormType(e.target.value as TunnelType)}
              >
                <option value="local">Local Forward (-L) [Lokal ➔ Remote]</option>
                <option value="remote">Remote Forward (-R) [Remote ➔ Lokal]</option>
                <option value="dynamic">Dynamic SOCKS (-D) [Proxy]</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-surface-container-high/80">
            <div className="space-y-1.5">
              <Label htmlFor="tun-bind-addr">Bind Address (Lokal)</Label>
              <Input
                id="tun-bind-addr"
                value={formBindAddress}
                onChange={(e) => setFormBindAddress(e.target.value)}
                placeholder="127.0.0.1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tun-bind-port" required>Bind Port (Lokal)</Label>
              <Input
                id="tun-bind-port"
                type="number"
                value={formBindPort}
                onChange={(e) => setFormBindPort(e.target.value)}
                placeholder="5433"
                required
              />
            </div>
          </div>

          {formType !== 'dynamic' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tun-target-addr" required>Target Host (Remote)</Label>
                <Input
                  id="tun-target-addr"
                  value={formTargetHost}
                  onChange={(e) => setFormTargetHost(e.target.value)}
                  placeholder="127.0.0.1 atau db.internal"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tun-target-port" required>Target Port (Remote)</Label>
                <Input
                  id="tun-target-port"
                  type="number"
                  value={formTargetPort}
                  onChange={(e) => setFormTargetPort(e.target.value)}
                  placeholder="5432"
                  required
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="tun-desc">Deskripsi / Catatan</Label>
            <Input
              id="tun-desc"
              placeholder="e.g. Akses database produksi dari DBeaver/pgStudio"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-surface-container-high bg-surface-container">
            <div>
              <Label>Aktifkan Otomatis</Label>
              <p className="text-[11px] text-on-surface-variant/80">Nyalakan tunnel begitu aturan dibuat</p>
            </div>
            <Switch checked={formAutoStart} onCheckedChange={setFormAutoStart} />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-container-high/80">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddModalOpen(false)}>
              Batal
            </Button>
            <Button type="submit" size="sm">
              Buat Tunnel
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
