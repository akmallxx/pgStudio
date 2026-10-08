export type HostEnvironment = 'Production' | 'Staging' | 'Database' | 'Homelab' | 'Cloud' | 'Development';

export interface Host {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  authType: 'key' | 'password' | 'agent';
  keyName?: string;
  password?: string;
  environment?: HostEnvironment;
  tags: string[];
  status: 'online' | 'unreachable' | 'unknown';
  latencyMs?: number;
  lastConnected?: string;
  notes?: string;
}

export interface TerminalLine {
  id: string;
  type: 'input' | 'output' | 'system' | 'error' | 'success';
  text: string;
  timestamp?: string;
}

export interface SSHSession {
  id: string;
  hostId: string;
  hostName: string;
  username: string;
  hostname: string;
  port: number;
  connectedAt: Date;
  lines: TerminalLine[];
  currentDirectory: string;
  status: 'connecting' | 'connected' | 'disconnected';
  commandHistory: string[];
}

export interface Snippet {
  id: string;
  description: string;
  script: string;
  targetHostIds: string[]; // empty array = Global (all connections)
}

export interface SFTPFile {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  sizeBytes: number;
  permissions: string;
  owner: string;
  group: string;
  modified: string;
  isEditable?: boolean;
}

export interface TransferItem {
  id: string;
  fileName: string;
  direction: 'upload' | 'download';
  totalBytes: number;
  transferredBytes: number;
  progressPercent: number;
  status: 'queued' | 'transferring' | 'completed' | 'failed';
  speed: string;
}

export type TunnelType = 'local' | 'remote' | 'dynamic';

export interface PortForwardRule {
  id: string;
  name: string;
  hostId: string;
  hostName: string;
  type: TunnelType;
  bindAddress: string;
  bindPort: number;
  targetHost?: string;
  targetPort?: number;
  isActive: boolean;
  activeConnections: number;
  trafficUpMb: number;
  trafficDownMb: number;
  description: string;
}

export type ActiveView = 'hosts' | 'terminal' | 'sftp' | 'snippets' | 'port-forwarding';
