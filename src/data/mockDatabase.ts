import {
  ClusterConnection,
  ErdConnector,
  ErdNode,
  QueryResult,
  SessionProcess,
  SlowQuery,
  SqlTab,
  TableMeta,
} from '../types/database';

export const EMPTY_TABLE_META: TableMeta = {
  name: 'standby',
  schema: 'public',
  rowCount: 0,
  sizeFormatted: '0 kB',
  heapSize: '0 kB',
  toastSize: '0 kB',
  columns: [],
  rows: [],
};

export const INITIAL_ORDERS: TableMeta = EMPTY_TABLE_META;

export const ALL_TABLES_MAP: Record<string, TableMeta> = {
  orders: EMPTY_TABLE_META,
};

export const INITIAL_ERD_NODES: ErdNode[] = [];

export const ERD_CONNECTORS: ErdConnector[] = [];

export const INITIAL_SQL_TABS: SqlTab[] = [
  {
    id: 'tab-1',
    title: 'scratchpad.sql',
    sql: `-- PostgreSQL Studio Query Scratchpad\n-- Ketik query SQL Anda lalu tekan Run Query (Ctrl+Enter / ⌘Enter)\n\nSELECT current_database(), current_user, version();\n`,
    tag: 'active',
  },
];

export const EMPTY_QUERY_RESULT: QueryResult = {
  executionTimeMs: 0,
  planningTimeMs: 0,
  rowCount: 0,
  transferKb: 0,
  columns: [],
  rows: [],
};

export const MONTHLY_SALES_RESULTS: QueryResult = EMPTY_QUERY_RESULT;

export const INITIAL_SESSIONS: SessionProcess[] = [];

export const INITIAL_SLOW_QUERIES: SlowQuery[] = [];

export const CLUSTER_CONNECTIONS: ClusterConnection[] = [
  {
    id: 'conn_localhost_default',
    name: 'Localhost PostgreSQL',
    badge: 'LOCAL',
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    defaultDb: 'postgres',
    sslMode: 'disable',
    latencyMs: 12,
    status: 'connected',
    description: 'Instance lokal PostgreSQL default pada port 5432.',
    discoveredDbs: ['postgres'],
  },
];
