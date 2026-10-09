export type AppSuiteMode = 'pgstudio' | 'nexussh';

export type DatabaseViewMode =
  | 'table-editor'
  | 'sql-editor'
  | 'schema-and-erd'
  | 'performance-and-logs'
  | 'database-overview'
  | 'database-connections'
  | 'connection-settings'
  | 'nexus-ssh';

export interface ColumnDefinition {
  name: string;
  type: string;
  isPk?: boolean;
  isFk?: boolean;
  fkTarget?: string;
  isUnique?: boolean;
  isNullable?: boolean;
  defaultValue?: string;
}

export type ColumnMeta = ColumnDefinition;

export interface TableRow {
  id: string;
  customer_id?: string;
  order_number?: string;
  status?: 'completed' | 'pending' | 'processing' | 'cancelled' | 'refunded';
  total_amount?: number;
  items_count?: number;
  metadata?: Record<string, any>;
  shipping_address?: Record<string, string>;
  created_at?: string;
  [key: string]: any;
}

export interface TableMeta {
  name: string;
  schema: string;
  rowCount: number;
  sizeFormatted: string;
  heapSize: string;
  toastSize: string;
  columns: ColumnDefinition[];
  rows: TableRow[];
}

export interface SqlTab {
  id: string;
  title: string;
  sql: string;
  isDirty?: boolean;
  tag?: string;
}

export interface QueryResult {
  executionTimeMs: number;
  planningTimeMs: number;
  rowCount: number;
  transferKb: number;
  columns: { name: string; type: string }[];
  rows: any[];
  message?: string;
}

export interface ErdNode {
  id: string;
  name: string;
  schema: string;
  rowCount: string;
  x: number;
  y: number;
  isSelected?: boolean;
  columns: {
    name: string;
    type: string;
    keyType?: 'PK' | 'FK' | 'UQ' | 'AI';
    icon?: string;
  }[];
}

export interface ErdConnector {
  id: string;
  sourceId: string;
  sourceCol: string;
  targetId: string;
  targetCol: string;
  type: '1:N' | '0..1';
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  isSelf?: boolean;
}

export interface SessionProcess {
  pid: number;
  user: string;
  clientAddr: string;
  state: 'active' | 'idle in tx' | 'autovacuum' | 'idle';
  statement: string;
  duration: string;
}

export interface SlowQuery {
  queryId: string;
  sql: string;
  tag: string;
  totalTime: string;
  meanLatencyMs: number;
  stddevMs: number;
  calls: number;
  rowsPerCall: number;
  bufferHitPercent: number;
  recommendation?: string;
}

export interface ClusterConnection {
  id: string;
  name: string;
  badge: 'PROD' | 'REPLICA / RO' | 'STAGING' | 'LOCAL';
  host: string;
  port: number;
  user: string;
  password?: string;
  defaultDb: string;
  sslMode: string;
  latencyMs: number;
  status: 'connected' | 'standby' | 'idle' | 'active';
  description: string;
  discoveredDbs: string[];
  maxConnections?: number;
  replicationLag?: string;
  readOnly?: boolean;
  autoCommit?: boolean;
  sshSettings?: SshTunnelConfig;
  advancedSettings?: AdvancedConnectionSettings;
}

export interface JumpServerConfig {
  id: string;
  order: string;
  host: string;
  port: number;
  user: string;
  authMethod: 'Password' | 'Public Key' | 'Agent' | 'Pageant';
  password?: string;
  privateKey?: string;
}

export interface SshTunnelConfig {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  authMethod: 'Password' | 'Public Key' | 'Agent' | 'Pageant';
  password?: string;
  privateKey?: string;
  saveCredentials?: boolean;
  jumpServers?: JumpServerConfig[];
  implementation?: 'SSHJ' | 'JSch';
  bypassHostVerification?: boolean;
  shareTunnel?: boolean;
  keepAliveMs?: number;
  timeoutMs?: number;
  localHost?: string;
  localPort?: number;
  remoteHost?: string;
  remotePort?: number;
}

export interface AdvancedConnectionSettings {
  sessionRole?: string;
  localClient?: string;
  showTemplateDatabases?: boolean;
  showUnavailableDatabases?: boolean;
  showDatabaseStatistics?: boolean;
  readAllDataTypes?: boolean;
  readTableKeysWithColumns?: boolean;
  replaceLegacyTimezone?: boolean;
  quoteDollarMode?: 'Code block' | 'Plain text';
  quoteTagMode?: 'Code block' | 'Plain text';
  usePreparedStatements?: boolean;
}

export type TransactionStatementType = 'INSERT' | 'UPDATE' | 'DELETE' | 'COMMIT' | 'ROLLBACK' | 'DDL';
export type TransactionStatus = 'ACTIVE' | 'COMMITTED' | 'ROLLED_BACK';

export interface TransactionStatement {
  id: string;
  type: TransactionStatementType;
  sql: string;
  tableName?: string;
  rowId?: string | number;
  rowsAffected?: number;
  durationMs?: number;
  status: 'PENDING' | 'SUCCESS' | 'ERROR';
  timestamp: string;
  errorMessage?: string;
  payload?: any;
  originalData?: any;
}

export interface ActiveTransaction {
  id: string;
  database: string;
  tableName: string;
  status: TransactionStatus;
  startedAt: string;
  statements: TransactionStatement[];
}
