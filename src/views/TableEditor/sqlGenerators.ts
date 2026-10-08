import { TableMeta } from '../../types/database';

export const generateUpdateSql = (
  tbl: string,
  pkCol: string,
  rowId: any,
  changes: Record<string, any>
): string => {
  const setClauses: string[] = [];
  for (const [k, v] of Object.entries(changes)) {
    if (k === pkCol || k === 'id') continue;
    if (v === null || v === undefined) {
      setClauses.push(`${k} = NULL`);
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      setClauses.push(`${k} = ${v}`);
    } else if (typeof v === 'object') {
      setClauses.push(`${k} = '${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`);
    } else {
      setClauses.push(`${k} = '${String(v).replace(/'/g, "''")}'`);
    }
  }
  const idVal = typeof rowId === 'number' ? rowId : `'${String(rowId).replace(/'/g, "''")}'`;
  return `UPDATE ${tbl} SET ${setClauses.join(', ')} WHERE ${pkCol} = ${idVal};`;
};

export const generateInsertSql = (tbl: string, data: Record<string, any>): string => {
  const cols = Object.keys(data);
  const vals = cols.map((c) => {
    const v = data[c];
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number' || typeof v === 'boolean') return `${v}`;
    if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
    return `'${String(v).replace(/'/g, "''")}'`;
  });
  return `INSERT INTO ${tbl} (${cols.join(', ')}) VALUES (${vals.join(', ')});`;
};

export const generateDeleteSql = (tbl: string, pkCol: string, rowId: any): string => {
  const idVal = typeof rowId === 'number' ? rowId : `'${String(rowId).replace(/'/g, "''")}'`;
  return `DELETE FROM ${tbl} WHERE ${pkCol} = ${idVal};`;
};
