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
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json();
  if (!response.ok) {
    const errorMsg = data.error || data.message || `HTTP ${response.status}`;
    const err = new Error(errorMsg) as any;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
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
    params: { page?: number; limit?: number; sort?: string; direction?: 'ASC' | 'DESC'; search?: string; filter?: string } = {}
  ): Promise<TableRowsResponse> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page.toString());
    if (params.limit) query.set('limit', params.limit.toString());
    if (params.sort) query.set('sort', params.sort);
    if (params.direction) query.set('direction', params.direction);
    if (params.search) query.set('search', params.search);
    if (params.filter) query.set('filter', params.filter);

    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<TableRowsResponse>(`/tables/${encodeURIComponent(table)}/rows${qs}`);
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
};
