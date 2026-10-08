// API client service for communicating with pgStudio Go backend

export interface ConnectionConfig {
  id?: string;
  name?: string;
  uri?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl_mode?: string;
  ssh_settings?: any;
  advanced_settings?: any;
}

export interface TestConnectionResponse {
  connected: boolean;
  latency_ms?: number;
  version?: string;
  error?: string;
  message?: string;
}

export interface SchemaTable {
  name: string;
  type: string;
  rows: number;
  size: string;
}

export interface CatalogSchemaResponse {
  is_live: boolean;
  database?: string;
  schema: string;
  tables: SchemaTable[];
}

export interface ErdRelation {
  source_table: string;
  source_col: string;
  target_table: string;
  target_col: string;
}

export interface ErdColumn {
  name: string;
  type: string;
  is_nullable: boolean;
  default: string;
  is_pk: boolean;
}

export interface CatalogErdResponse {
  is_live: boolean;
  columns: Record<string, ErdColumn[]>;
  relations: ErdRelation[];
}

export interface TableRowsResponse {
  is_live: boolean;
  table: string;
  page: number;
  limit: number;
  total_count: number;
  search?: string;
  columns: { name: string; type: string; is_nullable?: boolean; default?: string; is_pk?: boolean }[];
  rows: Record<string, any>[];
}

export interface QueryExecuteResponse {
  execution_time_ms: number;
  planning_time_ms?: number;
  row_count: number;
  transfer_kb?: number;
  columns?: { name: string; type: string }[];
  rows?: Record<string, any>[];
  status: string;
  message?: string;
  error?: string;
  detail?: string;
  hint?: string;
  line?: number;
  position?: number;
}

export interface QueryExplainResponse {
  plan: string[];
  recommendation?: string;
}

export interface SessionItem {
  pid: number;
  user: string;
  client_addr: string;
  state: 'active' | 'idle in tx' | 'idle' | string;
  statement: string;
  duration: string;
}

export interface SessionsResponse {
  sessions: SessionItem[];
  total: number;
}

export interface DatabaseOverviewResponse {
  is_live: boolean;
  database_name: string;
  database_size: string;
  version: string;
  version_short?: string;
  active_conns: number;
  max_conns?: number;
  cache_hit_ratio: number;
  backend_pid?: number;
  server_encoding?: string;
  isolation_level?: string;
  tables_count?: number;
  transactions_sec?: number;
  host?: string;
  port?: number;
  user?: string;
  connection_name?: string;
  tables?: {
    name: string;
    tag: string;
    rows: string;
    disk: string;
    target: string;
  }[];
}

export interface StudioSettings {
  max_query_history: number;
  default_page_size: number;
  autocommit_default: boolean;
  theme_preset: string;
  statement_timeout_ms: number;
  catalog_scope: string;
}

export interface GolangServiceUsage {
  version: string;
  os: string;
  arch: string;
  num_cpu: number;
  num_goroutine: number;
  process_threads: number;
  pid: number;
  uptime_seconds: number;
  uptime_formatted: string;
  started_at: string;
  requests_total: number;
  queries_total: number;
  memory: {
    alloc_bytes: number;
    alloc_formatted: string;
    total_alloc_bytes: number;
    total_alloc_formatted: string;
    sys_bytes: number;
    sys_formatted: string;
    heap_alloc_bytes: number;
    heap_alloc_formatted: string;
    heap_sys_bytes: number;
    heap_sys_formatted: string;
    heap_inuse_bytes: number;
    heap_inuse_formatted: string;
    stack_inuse_bytes: number;
    stack_inuse_formatted: string;
    vm_rss_kb: number;
    vm_rss_formatted: string;
    vm_size_kb: number;
    vm_size_formatted: string;
  };
  gc: {
    num_gc: number;
    last_gc_time: string;
    last_gc_ago_sec: number;
    last_pause_ms: number;
    pause_total_ms: number;
  };
  pool: {
    connected: boolean;
    database?: string;
    host?: string;
    max_conns?: number;
    total_conns?: number;
    idle_conns?: number;
    acquired_conns?: number;
    new_conns_count?: number;
    empty_acquire_count?: number;
  };
}

export interface ServiceUsageResponse {
  golang: GolangServiceUsage;
}

export interface TriggerGCResponse {
  message: string;
  freed_bytes: number;
  freed_formatted: string;
  alloc_before: string;
  alloc_after: string;
  num_gc: number;
}

export interface TableBloatItem {
  schema: string;
  table: string;
  live_tup: number;
  dead_tup: number;
  bloat_ratio: number;
  total_size_bytes: number;
  total_size_formatted: string;
  last_vacuum: string;
  last_autovacuum: string;
}

export interface LockItem {
  pid: number;
  locktype: string;
  mode: string;
  granted: boolean;
  relation: string;
  schema_name: string;
  username: string;
  current_query: string;
  session_state: string;
  duration_sec: number;
}

export interface LockContentionItem {
  blocked_pid: number;
  blocked_user: string;
  blocking_pid: number;
  blocking_user: string;
  blocked_statement: string;
  blocking_statement: string;
}

export interface LocksResponse {
  locks: LockItem[];
  contentions: LockContentionItem[];
  total: number;
}

export interface SavedConnectionItem {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  ssl_mode: string;
  badge: 'PROD' | 'REPLICA / RO' | 'STAGING' | 'LOCAL';
  color?: string;
  created_at?: string;
  ssh_settings?: any;
  advanced_settings?: any;
}

export interface QueryHistoryItem {
  id: string;
  query: string;
  duration_ms: number;
  row_count: number;
  status: 'SUCCESS' | 'ERROR' | 'STANDBY';
  database: string;
  executed_at: string;
  error_message?: string;
}

const API_BASE = '/api/v1';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const token = localStorage.getItem('pgstudio_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };
  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !endpoint.includes('/auth/login')) {
      localStorage.removeItem('pgstudio_token');
      window.dispatchEvent(new CustomEvent('pgstudio_unauthorized'));
    }
    const errorMsg = data.error || data.message || `HTTP ${response.status}`;
    const err = new Error(errorMsg) as any;
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  // Authentication
  async login(credentials: { username: string; password: string }): Promise<{ success: boolean; token: string; user: { username: string }; message?: string }> {
    return request<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  async getAuthStatus(): Promise<{ authenticated: boolean; user?: { username: string } }> {
    return request<any>('/auth/me');
  },

  async logout(): Promise<{ success: boolean }> {
    return request<any>('/auth/logout', {
      method: 'POST',
    });
  },

  // Health
  async getHealth() {
    return request<any>('/health');
  },

  // Connection
  async testConnection(cfg: ConnectionConfig): Promise<TestConnectionResponse> {
    return request<TestConnectionResponse>('/connections/test', {
      method: 'POST',
      body: JSON.stringify(cfg),
    });
  },

  async connect(cfg: ConnectionConfig): Promise<any> {
    return request<any>('/connections/connect', {
      method: 'POST',
      body: JSON.stringify(cfg),
    });
  },

  async getCurrentConnection(): Promise<{ connected: boolean; connection: ConnectionConfig; version: string }> {
    return request<any>('/connections/current');
  },

  async testSshTunnel(cfg: {
    host: string;
    port: number;
    user: string;
    auth_method?: string;
    password?: string;
    private_key?: string;
    bypass_host_verification?: boolean;
    timeout_ms?: number;
  }): Promise<{ success: boolean; latency_ms?: number; target?: string; message: string; error?: string }> {
    return request<any>('/connections/ssh/test', {
      method: 'POST',
      body: JSON.stringify(cfg),
    });
  },

  async getDatabases(options?: { showTemplates?: boolean; showUnavailable?: boolean }): Promise<{ databases: string[]; current: string }> {
    const params = new URLSearchParams();
    if (options?.showTemplates) params.set('show_templates', 'true');
    if (options?.showUnavailable) params.set('show_unavailable', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<{ databases: string[]; current: string }>(`/databases${qs}`);
  },

  // Catalog & Schema
  async getCatalogSchema(): Promise<CatalogSchemaResponse> {
    return request<CatalogSchemaResponse>('/catalog/schema');
  },

  async getCatalogErd(): Promise<CatalogErdResponse> {
    return request<CatalogErdResponse>('/catalog/erd');
  },

  // Table Data Grid (CRUD)
  async getTableRows(
    table: string,
    params: { page?: number; limit?: number; sort?: string; direction?: 'ASC' | 'DESC'; search?: string; filter?: string; signal?: AbortSignal } = {}
  ): Promise<TableRowsResponse> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page.toString());
    if (params.limit) query.set('limit', params.limit.toString());
    if (params.sort) query.set('sort', params.sort);
    if (params.direction) query.set('direction', params.direction);
    if (params.search) query.set('search', params.search);
    if (params.filter) query.set('filter', params.filter);

    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<TableRowsResponse>(`/tables/${encodeURIComponent(table)}/rows${qs}`, {
      signal: params.signal,
    });
  },

  async insertTableRow(table: string, data: Record<string, any>): Promise<any> {
    return request<any>(`/tables/${encodeURIComponent(table)}/rows`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTableRow(table: string, id: string | number, data: Record<string, any>): Promise<any> {
    return request<any>(`/tables/${encodeURIComponent(table)}/rows/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteTableRow(table: string, id: string | number): Promise<any> {
    return request<any>(`/tables/${encodeURIComponent(table)}/rows/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async addTableColumn(
    table: string,
    payload: {
      name: string;
      type: string;
      default_value?: string;
      is_nullable?: boolean;
      is_unique?: boolean;
      comment?: string;
    }
  ): Promise<any> {
    return request<any>(`/tables/${encodeURIComponent(table)}/columns`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async createTable(payload: {
    name: string;
    schema?: string;
    description?: string;
    columns: Array<{
      name: string;
      type: string;
      is_primary_key?: boolean;
      is_nullable?: boolean;
      is_unique?: boolean;
      default_value?: string;
      comment?: string;
    }>;
  }): Promise<{ status: string; message: string; table: string; schema: string; sql: string }> {
    return request<any>('/tables', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // SQL Query Execution Engine
  async executeQuery(sql: string, maxRows = 500): Promise<QueryExecuteResponse> {
    return request<QueryExecuteResponse>('/query/execute', {
      method: 'POST',
      body: JSON.stringify({ sql, max_rows: maxRows }),
    });
  },

  async explainQuery(sql: string): Promise<QueryExplainResponse> {
    return request<QueryExplainResponse>('/query/explain', {
      method: 'POST',
      body: JSON.stringify({ sql }),
    });
  },

  // Performance Cockpit
  async getSessions(): Promise<SessionsResponse> {
    return request<SessionsResponse>('/performance/sessions');
  },

  async terminateSession(pid: number): Promise<any> {
    return request<any>(`/performance/sessions/${pid}/terminate`, {
      method: 'POST',
    });
  },

  async getSlowQueries(): Promise<any> {
    return request<any>('/performance/slow-queries');
  },

  async getServiceUsage(): Promise<ServiceUsageResponse> {
    return request<ServiceUsageResponse>('/performance/service-usage');
  },

  async triggerBackendGC(): Promise<TriggerGCResponse> {
    return request<TriggerGCResponse>('/performance/service-usage/gc', {
      method: 'POST',
    });
  },

  async getTableBloat(): Promise<{ tables: TableBloatItem[]; autovacuum_enabled: boolean; autovacuum_workers: number; total: number }> {
    return request<any>('/performance/bloat');
  },

  async runVacuum(table: string, full = false, analyze = true): Promise<{ status: string; table: string; message: string }> {
    return request<any>('/performance/vacuum', {
      method: 'POST',
      body: JSON.stringify({ table, full, analyze }),
    });
  },

  async getLocks(): Promise<LocksResponse> {
    return request<LocksResponse>('/performance/locks');
  },

  async resetStats(): Promise<{ status: string; message: string }> {
    return request<any>('/performance/reset-stats', {
      method: 'POST',
    });
  },

  // Overview
  async getDatabaseOverview(): Promise<DatabaseOverviewResponse> {
    return request<DatabaseOverviewResponse>('/database/overview');
  },

  // Master Studio Settings (Stored in backend-go/data/settings.json)
  async getSettings(): Promise<StudioSettings> {
    return request<StudioSettings>('/settings');
  },

  async updateSettings(settings: Partial<StudioSettings>): Promise<{ status: string; settings: StudioSettings; message: string }> {
    return request<any>('/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  },

  // Saved PostgreSQL Connection Profiles (Stored in backend-go/data/connections.json)
  async getSavedConnections(): Promise<SavedConnectionItem[]> {
    return request<SavedConnectionItem[]>('/connections');
  },

  async saveConnection(conn: Partial<SavedConnectionItem>): Promise<{ status: string; connection: SavedConnectionItem; message: string }> {
    return request<any>('/connections', {
      method: 'POST',
      body: JSON.stringify(conn),
    });
  },

  async deleteConnection(id: string): Promise<{ status: string; message: string }> {
    return request<any>(`/connections/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  // Query Execution History (Stored in backend-go/data/query_history.json, capped at max_query_history)
  async getQueryHistory(): Promise<QueryHistoryItem[]> {
    return request<QueryHistoryItem[]>('/query/history');
  },

  async clearQueryHistory(): Promise<{ status: string; message: string }> {
    return request<any>('/query/history', {
      method: 'DELETE',
    });
  },

  // NexusSH Suite Endpoints (Stored in backend-go/data/ssh_*.json)
  async getSshHosts(): Promise<any[]> {
    return request<any[]>('/ssh/hosts');
  },

  async saveSshHost(host: any): Promise<any> {
    return request<any>('/ssh/hosts', {
      method: 'POST',
      body: JSON.stringify(host),
    });
  },

  async deleteSshHost(id: string): Promise<any> {
    return request<any>(`/ssh/hosts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async getSshSnippets(): Promise<any[]> {
    return request<any[]>('/ssh/snippets');
  },

  async saveSshSnippet(snippet: any): Promise<any> {
    return request<any>('/ssh/snippets', {
      method: 'POST',
      body: JSON.stringify(snippet),
    });
  },

  async deleteSshSnippet(id: string): Promise<any> {
    return request<any>(`/ssh/snippets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async getSshTunnels(): Promise<any[]> {
    return request<any[]>('/ssh/tunnels');
  },

  async saveSshTunnel(tunnel: any): Promise<any> {
    return request<any>('/ssh/tunnels', {
      method: 'POST',
      body: JSON.stringify(tunnel),
    });
  },

  async deleteSshTunnel(id: string): Promise<any> {
    return request<any>(`/ssh/tunnels/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  // NexusSH Real SFTP Client Methods
  async sftpList(hostId: string, path?: string): Promise<{ success: boolean; path: string; files: any[] }> {
    return request<{ success: boolean; path: string; files: any[] }>('/sftp/list', {
      method: 'POST',
      body: JSON.stringify({ host_id: hostId, path: path || '~' }),
    });
  },

  async sftpRead(hostId: string, path: string): Promise<{ success: boolean; path: string; content: string; sizeBytes: number }> {
    return request<any>('/sftp/read', {
      method: 'POST',
      body: JSON.stringify({ host_id: hostId, path }),
    });
  },

  async sftpWrite(hostId: string, path: string, content: string): Promise<{ success: boolean; message: string }> {
    return request<any>('/sftp/write', {
      method: 'POST',
      body: JSON.stringify({ host_id: hostId, path, content }),
    });
  },

  async sftpMkdir(hostId: string, path: string): Promise<{ success: boolean; message: string }> {
    return request<any>('/sftp/mkdir', {
      method: 'POST',
      body: JSON.stringify({ host_id: hostId, path }),
    });
  },

  async sftpDelete(hostId: string, path: string, type: 'file' | 'directory' = 'file'): Promise<{ success: boolean; message: string }> {
    return request<any>('/sftp/delete', {
      method: 'POST',
      body: JSON.stringify({ host_id: hostId, path, type }),
    });
  },

  async sftpRename(hostId: string, oldPath: string, newPath: string): Promise<{ success: boolean; message: string }> {
    return request<any>('/sftp/rename', {
      method: 'POST',
      body: JSON.stringify({ host_id: hostId, old_path: oldPath, new_path: newPath }),
    });
  },

  async sftpUpload(hostId: string, remoteDir: string, file: File): Promise<{ success: boolean; message: string }> {
    const formData = new FormData();
    formData.append('host_id', hostId);
    formData.append('remote_dir', remoteDir);
    formData.append('file', file);
    const token = localStorage.getItem('pgstudio_token');
    const headers: Record<string, string> = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const res = await fetch('/api/v1/sftp/upload', {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Upload failed');
    }
    return res.json();
  },

  getSftpDownloadUrl(hostId: string, path: string): string {
    const token = localStorage.getItem('pgstudio_token') || '';
    return `/api/v1/sftp/download?host_id=${encodeURIComponent(hostId)}&path=${encodeURIComponent(path)}&token=${encodeURIComponent(token)}`;
  },

  async sftpCopyToRemote(hostId: string, localPath: string, remoteDir: string, fallbackHost?: { hostname?: string; port?: number; username?: string; password?: string }): Promise<{ success: boolean; message: string }> {
    return request<any>('/sftp/copy-to-remote', {
      method: 'POST',
      body: JSON.stringify({
        host_id: hostId,
        local_path: localPath,
        remote_dest_dir: remoteDir,
        host: fallbackHost?.hostname,
        port: fallbackHost?.port,
        user: fallbackHost?.username,
        password: fallbackHost?.password,
      }),
    });
  },

  async sftpCopyToLocal(hostId: string, remotePath: string, localDir: string, fallbackHost?: { hostname?: string; port?: number; username?: string; password?: string }): Promise<{ success: boolean; message: string }> {
    return request<any>('/sftp/copy-to-local', {
      method: 'POST',
      body: JSON.stringify({
        host_id: hostId,
        remote_path: remotePath,
        local_dest_dir: localDir,
        host: fallbackHost?.hostname,
        port: fallbackHost?.port,
        user: fallbackHost?.username,
        password: fallbackHost?.password,
      }),
    });
  },

  // Local Machine Filesystem for Dual-Pane Explorer
  async sftpLocalList(path?: string): Promise<{ success: boolean; path: string; files: any[] }> {
    return request<{ success: boolean; path: string; files: any[] }>('/sftp/local/list', {
      method: 'POST',
      body: JSON.stringify({ path: path || '~' }),
    });
  },

  async sftpLocalRead(path: string): Promise<{ success: boolean; path: string; content: string; sizeBytes: number }> {
    return request<any>('/sftp/local/read', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  },

  async sftpLocalWrite(path: string, content: string): Promise<{ success: boolean; message: string }> {
    return request<any>('/sftp/local/write', {
      method: 'POST',
      body: JSON.stringify({ path, content }),
    });
  },

  // Real SSH Exec & WebSocket URL helper
  async sshExec(hostId: string, cmd: string, cwd?: string): Promise<{ success: boolean; output: string; exit_code: number; latency_ms: number }> {
    return request<any>('/ssh/exec', {
      method: 'POST',
      body: JSON.stringify({ host_id: hostId, cmd, cwd }),
    });
  },

  getSshWsUrl(hostId: string, cols = 100, rows = 30, fallbackHost?: { hostname?: string; port?: number; username?: string }, directPort = false): string {
    const isHttps = window.location.protocol === 'https:';
    const protocol = isHttps ? 'wss:' : 'ws:';
    let host = window.location.host;

    // In local environments (e.g. Apache/Nginx on port 80 like pgstudio.localhost), connecting directly
    // to Go server on port 28432 bypasses proxy limitations for WebSockets
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname.endsWith('.localhost') || window.location.hostname === '127.0.0.1';
    if (!isHttps && (directPort || (isLocal && window.location.port !== '28432'))) {
      host = `${window.location.hostname}:28432`;
    }

    const token = localStorage.getItem('pgstudio_token') || '';
    let url = `${protocol}//${host}/api/v1/ssh/ws?host_id=${encodeURIComponent(hostId)}&token=${encodeURIComponent(token)}&cols=${cols}&rows=${rows}`;
    if (fallbackHost) {
      if (fallbackHost.hostname) url += `&host=${encodeURIComponent(fallbackHost.hostname)}`;
      if (fallbackHost.port) url += `&port=${encodeURIComponent(fallbackHost.port)}`;
      if (fallbackHost.username) url += `&user=${encodeURIComponent(fallbackHost.username)}`;
    }
    return url;
  },
};
