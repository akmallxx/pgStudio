import React, { useState } from 'react';
import {
  X,
  Table as TableIcon,
  Plus,
  Trash2,
  Key,
  Check,
  Code2,
  Copy,
  Layers,
  Sparkles,
  AlertCircle,
  RotateCw,
} from 'lucide-react';
import { api } from '../../services/api';

export interface ColumnDraft {
  id: string;
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isNullable: boolean;
  isUnique: boolean;
  defaultValue: string;
  comment: string;
  isCustomType?: boolean;
}

interface CreateTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTableCreated: (newTableName: string) => void;
  onShowToast: (message: string, icon?: string, isError?: boolean) => void;
  existingTableNames?: string[];
  activeSchema?: string;
}

export interface TypeCategory {
  category: string;
  types: { value: string; label: string; desc: string }[];
}

export const POSTGRES_TYPE_CATEGORIES: TypeCategory[] = [
  {
    category: 'Bilangan Bulat & Serial (Integers)',
    types: [
      { value: 'BIGSERIAL', label: 'BIGSERIAL', desc: 'Auto-increment 8-byte (PK ID besar)' },
      { value: 'SERIAL', label: 'SERIAL', desc: 'Auto-increment 4-byte (PK ID standar)' },
      { value: 'SMALLSERIAL', label: 'SMALLSERIAL', desc: 'Auto-increment 2-byte (PK kecil)' },
      { value: 'BIGINT', label: 'BIGINT', desc: 'Signed 8-byte integer' },
      { value: 'INTEGER', label: 'INTEGER', desc: 'Signed 4-byte integer' },
      { value: 'SMALLINT', label: 'SMALLINT', desc: 'Signed 2-byte integer' },
    ],
  },
  {
    category: 'Desimal & Keuangan (Numeric / Float)',
    types: [
      { value: 'NUMERIC(12,2)', label: 'NUMERIC(12,2)', desc: 'Mata uang / harga standar' },
      { value: 'NUMERIC(14,4)', label: 'NUMERIC(14,4)', desc: 'Keuangan presisi 4 desimal' },
      { value: 'NUMERIC(18,6)', label: 'NUMERIC(18,6)', desc: 'Kripto / kurs presisi tinggi' },
      { value: 'NUMERIC', label: 'NUMERIC', desc: 'Presisi desimal tak terbatas' },
      { value: 'DOUBLE PRECISION', label: 'DOUBLE PRECISION', desc: 'Float 8-byte (15 digit)' },
      { value: 'REAL', label: 'REAL', desc: 'Float 4-byte (6 digit)' },
      { value: 'MONEY', label: 'MONEY', desc: 'Mata uang PostgreSQL' },
    ],
  },
  {
    category: 'Teks & Karakter (String / Text)',
    types: [
      { value: 'VARCHAR(255)', label: 'VARCHAR(255)', desc: 'String variabel maks 255' },
      { value: 'VARCHAR(100)', label: 'VARCHAR(100)', desc: 'String variabel maks 100' },
      { value: 'VARCHAR(50)', label: 'VARCHAR(50)', desc: 'String pendek maks 50' },
      { value: 'VARCHAR', label: 'VARCHAR', desc: 'String tanpa batas panjang' },
      { value: 'TEXT', label: 'TEXT', desc: 'Teks panjang tanpa batas' },
      { value: 'CHAR(1)', label: 'CHAR(1)', desc: 'Karakter tunggal tetap (Y/N)' },
      { value: 'CHAR(10)', label: 'CHAR(10)', desc: 'Karakter panjang tetap 10' },
      { value: 'CITEXT', label: 'CITEXT', desc: 'Teks case-insensitive' },
    ],
  },
  {
    category: 'Tanggal & Waktu (Date & Time)',
    types: [
      { value: 'TIMESTAMPTZ', label: 'TIMESTAMPTZ', desc: 'Timestamp dengan zona waktu (Rekomendasi)' },
      { value: 'TIMESTAMP', label: 'TIMESTAMP', desc: 'Timestamp tanpa zona waktu' },
      { value: 'DATE', label: 'DATE', desc: 'Tanggal kalender (YYYY-MM-DD)' },
      { value: 'TIME', label: 'TIME', desc: 'Waktu dalam hari (HH:MM:SS)' },
      { value: 'TIMETZ', label: 'TIMETZ', desc: 'Waktu dengan zona waktu' },
      { value: 'INTERVAL', label: 'INTERVAL', desc: 'Rentang waktu / durasi' },
    ],
  },
  {
    category: 'Boolean & Identifier',
    types: [
      { value: 'BOOLEAN', label: 'BOOLEAN', desc: 'Benar / Salah (true / false)' },
      { value: 'UUID', label: 'UUID', desc: 'Universally Unique ID (gen_random_uuid)' },
    ],
  },
  {
    category: 'JSON & Dokumen Biner',
    types: [
      { value: 'JSONB', label: 'JSONB', desc: 'Biner JSON terindeks cepat (Rekomendasi)' },
      { value: 'JSON', label: 'JSON', desc: 'JSON teks mentah' },
      { value: 'BYTEA', label: 'BYTEA', desc: 'Binary string / file blob' },
      { value: 'XML', label: 'XML', desc: 'Dokumen XML' },
    ],
  },
  {
    category: 'Jaringan & Alamat (Networking)',
    types: [
      { value: 'INET', label: 'INET', desc: 'Alamat host IPv4 atau IPv6' },
      { value: 'CIDR', label: 'CIDR', desc: 'Spesifikasi jaringan IPv4/IPv6' },
      { value: 'MACADDR', label: 'MACADDR', desc: 'Alamat MAC 6-byte' },
      { value: 'MACADDR8', label: 'MACADDR8', desc: 'Alamat MAC 8-byte' },
    ],
  },
  {
    category: 'Pencarian & Geometri (Search / Spatial)',
    types: [
      { value: 'TSVECTOR', label: 'TSVECTOR', desc: 'Full-text search document vector' },
      { value: 'TSQUERY', label: 'TSQUERY', desc: 'Full-text search query' },
      { value: 'POINT', label: 'POINT', desc: 'Titik koordinat geometris (x, y)' },
      { value: 'POLYGON', label: 'POLYGON', desc: 'Bidang geometri poligon' },
    ],
  },
  {
    category: 'Array PostgreSQL (List)',
    types: [
      { value: 'TEXT[]', label: 'TEXT[]', desc: 'Array kumpulan teks' },
      { value: 'INTEGER[]', label: 'INTEGER[]', desc: 'Array kumpulan integer' },
      { value: 'BIGINT[]', label: 'BIGINT[]', desc: 'Array kumpulan bigint' },
      { value: 'VARCHAR[]', label: 'VARCHAR[]', desc: 'Array kumpulan varchar' },
      { value: 'UUID[]', label: 'UUID[]', desc: 'Array kumpulan UUID' },
      { value: 'JSONB[]', label: 'JSONB[]', desc: 'Array kumpulan JSONB' },
    ],
  },
];

export const ALL_FLAT_TYPES = POSTGRES_TYPE_CATEGORIES.flatMap((c) =>
  c.types.map((t) => t.value)
);

const PRESETS: Array<{
  name: string;
  desc: string;
  defaultTableName: string;
  columns: Array<Omit<ColumnDraft, 'id'>>;
}> = [
  {
    name: 'Standard Entity',
    desc: 'ID serial otomatis dengan timestamps audit',
    defaultTableName: 'items',
    columns: [
      {
        name: 'id',
        type: 'BIGSERIAL',
        isPrimaryKey: true,
        isNullable: false,
        isUnique: true,
        defaultValue: '',
        comment: 'Primary identifier',
      },
      {
        name: 'name',
        type: 'VARCHAR(255)',
        isPrimaryKey: false,
        isNullable: false,
        isUnique: false,
        defaultValue: '',
        comment: '',
      },
      {
        name: 'description',
        type: 'TEXT',
        isPrimaryKey: false,
        isNullable: true,
        isUnique: false,
        defaultValue: '',
        comment: '',
      },
      {
        name: 'created_at',
        type: 'TIMESTAMPTZ',
        isPrimaryKey: false,
        isNullable: false,
        isUnique: false,
        defaultValue: 'now()',
        comment: 'Record creation timestamp',
      },
      {
        name: 'updated_at',
        type: 'TIMESTAMPTZ',
        isPrimaryKey: false,
        isNullable: false,
        isUnique: false,
        defaultValue: 'now()',
        comment: 'Record update timestamp',
      },
    ],
  },
  {
    name: 'Users & Auth',
    desc: 'Tabel akun pengguna dengan UUID dan status',
    defaultTableName: 'users',
    columns: [
      {
        name: 'id',
        type: 'UUID',
        isPrimaryKey: true,
        isNullable: false,
        isUnique: true,
        defaultValue: 'gen_random_uuid()',
        comment: 'UUID unique identifier',
      },
      {
        name: 'email',
        type: 'VARCHAR(255)',
        isPrimaryKey: false,
        isNullable: false,
        isUnique: true,
        defaultValue: '',
        comment: 'Unique email address',
      },
      {
        name: 'username',
        type: 'VARCHAR(100)',
        isPrimaryKey: false,
        isNullable: false,
        isUnique: true,
        defaultValue: '',
        comment: 'Display username',
      },
      {
        name: 'password_hash',
        type: 'TEXT',
        isPrimaryKey: false,
        isNullable: false,
        isUnique: false,
        defaultValue: '',
        comment: 'Bcrypt hashed password',
      },
      {
        name: 'role',
        type: 'VARCHAR(50)',
        isPrimaryKey: false,
        isNullable: false,
        isUnique: false,
        defaultValue: "'user'",
        comment: 'Access control role',
      },
      {
        name: 'is_active',
        type: 'BOOLEAN',
        isPrimaryKey: false,
        isNullable: false,
        isUnique: false,
        defaultValue: 'true',
        comment: 'Account active flag',
      },
      {
        name: 'created_at',
        type: 'TIMESTAMPTZ',
        isPrimaryKey: false,
        isNullable: false,
        isUnique: false,
        defaultValue: 'now()',
        comment: '',
      },
    ],
  },
  {
    name: 'Products & Store',
    desc: 'Katalog produk e-commerce / inventory',
    defaultTableName: 'products',
    columns: [
      {
        name: 'id',
        type: 'BIGSERIAL',
        isPrimaryKey: true,
        isNullable: false,
        isUnique: true,
        defaultValue: '',
        comment: '',
      },
      {
        name: 'sku',
        type: 'VARCHAR(50)',
        isPrimaryKey: false,
        isNullable: false,
        isUnique: true,
        defaultValue: '',
        comment: 'Stock keeping unit',
      },
      {
        name: 'name',
        type: 'VARCHAR(255)',
        isPrimaryKey: false,
        isNullable: false,
        isUnique: false,
        defaultValue: '',
        comment: 'Product title',
      },
      {
        name: 'price',
        type: 'NUMERIC(12,2)',
        isPrimaryKey: false,
        isNullable: false,
        isUnique: false,
        defaultValue: '0.00',
        comment: 'Unit price in currency',
      },
      {
        name: 'stock_quantity',
        type: 'INTEGER',
        isPrimaryKey: false,
        isNullable: false,
        isUnique: false,
        defaultValue: '0',
        comment: 'Available inventory',
      },
      {
        name: 'is_available',
        type: 'BOOLEAN',
        isPrimaryKey: false,
        isNullable: false,
        isUnique: false,
        defaultValue: 'true',
        comment: 'Published status',
      },
      {
        name: 'created_at',
        type: 'TIMESTAMPTZ',
        isPrimaryKey: false,
        isNullable: false,
        isUnique: false,
        defaultValue: 'now()',
        comment: '',
      },
    ],
  },
  {
    name: 'Audit Logs',
    desc: 'Pencatatan event & payload JSONB',
    defaultTableName: 'audit_logs',
    columns: [
      {
        name: 'id',
        type: 'BIGSERIAL',
        isPrimaryKey: true,
        isNullable: false,
        isUnique: true,
        defaultValue: '',
        comment: '',
      },
      {
        name: 'event_type',
        type: 'VARCHAR(100)',
        isPrimaryKey: false,
        isNullable: false,
        isUnique: false,
        defaultValue: '',
        comment: 'Event identifier',
      },
      {
        name: 'actor_id',
        type: 'VARCHAR(100)',
        isPrimaryKey: false,
        isNullable: true,
        isUnique: false,
        defaultValue: '',
        comment: 'User or system ID',
      },
      {
        name: 'payload',
        type: 'JSONB',
        isPrimaryKey: false,
        isNullable: true,
        isUnique: false,
        defaultValue: "'{}'",
        comment: 'Structured payload JSON',
      },
      {
        name: 'ip_address',
        type: 'VARCHAR(45)',
        isPrimaryKey: false,
        isNullable: true,
        isUnique: false,
        defaultValue: '',
        comment: 'Client IP',
      },
      {
        name: 'recorded_at',
        type: 'TIMESTAMPTZ',
        isPrimaryKey: false,
        isNullable: false,
        isUnique: false,
        defaultValue: 'now()',
        comment: '',
      },
    ],
  },
  {
    name: 'Blank (Kosong)',
    desc: 'Tabel kosong dengan 1 kolom primary key id',
    defaultTableName: 'new_table',
    columns: [
      {
        name: 'id',
        type: 'BIGSERIAL',
        isPrimaryKey: true,
        isNullable: false,
        isUnique: true,
        defaultValue: '',
        comment: 'Primary identifier',
      },
    ],
  },
];

export const CreateTableModal: React.FC<CreateTableModalProps> = ({
  isOpen,
  onClose,
  onTableCreated,
  onShowToast,
  existingTableNames = [],
  activeSchema = 'public',
}) => {
  const [tableName, setTableName] = useState('');
  const [schema, setSchema] = useState(activeSchema || 'public');
  const [description, setDescription] = useState('');
  const [activeTab, setActiveTab] = useState<'visual' | 'sql'>('visual');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [columns, setColumns] = useState<ColumnDraft[]>([
    {
      id: 'col_1',
      name: 'id',
      type: 'BIGSERIAL',
      isPrimaryKey: true,
      isNullable: false,
      isUnique: true,
      defaultValue: '',
      comment: '',
    },
    {
      id: 'col_2',
      name: 'name',
      type: 'VARCHAR(255)',
      isPrimaryKey: false,
      isNullable: false,
      isUnique: false,
      defaultValue: '',
      comment: '',
    },
    {
      id: 'col_3',
      name: 'created_at',
      type: 'TIMESTAMPTZ',
      isPrimaryKey: false,
      isNullable: false,
      isUnique: false,
      defaultValue: 'now()',
      comment: '',
    },
  ]);

  if (!isOpen) return null;

  // Sanitize table name input
  const cleanTableName = tableName.trim().replace(/\s+/g, '_').toLowerCase();

  const isDuplicateName = existingTableNames.some(
    (t) => t.toLowerCase() === cleanTableName
  );

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setTableName(preset.defaultTableName);
    setColumns(
      preset.columns.map((col, idx) => ({
        ...col,
        id: `col_${Date.now()}_${idx}`,
      }))
    );
    setErrorMsg('');
  };

  const handleAddColumn = () => {
    setColumns((prev) => [
      ...prev,
      {
        id: `col_${Date.now()}`,
        name: `column_${prev.length + 1}`,
        type: 'VARCHAR(255)',
        isPrimaryKey: false,
        isNullable: true,
        isUnique: false,
        defaultValue: '',
        comment: '',
      },
    ]);
  };

  const handleRemoveColumn = (id: string) => {
    if (columns.length <= 1) {
      setErrorMsg('Tabel harus memiliki minimal 1 kolom');
      return;
    }
    setColumns((prev) => prev.filter((c) => c.id !== id));
  };

  const handleUpdateColumn = (id: string, updates: Partial<ColumnDraft>) => {
    setColumns((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          const updated = { ...c, ...updates };
          // If setting PK, typically not nullable & unique
          if (updates.isPrimaryKey === true) {
            updated.isNullable = false;
            updated.isUnique = true;
          }
          return updated;
        }
        return c;
      })
    );
  };

  // Generate real-time live SQL statement
  const generateLiveSql = (): string => {
    const tableTarget = cleanTableName || 'nama_tabel';
    const schemaTarget = schema || 'public';

    const colLines: string[] = [];
    const pkCols: string[] = [];
    const comments: string[] = [];

    columns.forEach((col) => {
      const colName = col.name.trim() || 'unnamed_col';
      let line = `"${colName}" ${col.type || 'TEXT'}`;

      if (col.isPrimaryKey) {
        pkCols.push(`"${colName}"`);
      }

      if (col.defaultValue && col.defaultValue.trim() !== '') {
        line += ` DEFAULT ${col.defaultValue.trim()}`;
      }

      if (!col.isNullable && !col.isPrimaryKey) {
        line += ` NOT NULL`;
      }

      if (col.isUnique && !col.isPrimaryKey) {
        line += ` UNIQUE`;
      }

      colLines.push(line);

      if (col.comment.trim()) {
        comments.push(
          `COMMENT ON COLUMN ${schemaTarget}."${tableTarget}"."${colName}" IS '${col.comment.replace(/'/g, "''")}';`
        );
      }
    });

    if (pkCols.length > 0) {
      colLines.push(`CONSTRAINT pk_${tableTarget} PRIMARY KEY (${pkCols.join(', ')})`);
    }

    let sql = `CREATE TABLE ${schemaTarget}."${tableTarget}" (\n    ${colLines.join(',\n    ')}\n);`;

    if (description.trim()) {
      comments.unshift(
        `COMMENT ON TABLE ${schemaTarget}."${tableTarget}" IS '${description.replace(/'/g, "''")}';`
      );
    }

    if (comments.length > 0) {
      sql += '\n\n' + comments.join('\n');
    }

    return sql;
  };

  const handleCopySql = () => {
    const sql = generateLiveSql();
    navigator.clipboard?.writeText(sql);
    onShowToast('DDL CREATE TABLE berhasil disalin!', 'content_copy');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!cleanTableName) {
      setErrorMsg('Nama tabel tidak boleh kosong');
      return;
    }

    // Check valid identifier
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(cleanTableName)) {
      setErrorMsg('Nama tabel hanya boleh mengandung huruf, angka, dan underscore, serta tidak diawali angka');
      return;
    }

    if (isDuplicateName) {
      setErrorMsg(`Tabel "${cleanTableName}" sudah ada di skema ${schema}`);
      return;
    }

    if (columns.length === 0) {
      setErrorMsg('Tabel harus memiliki minimal satu kolom');
      return;
    }

    // Check column names
    const colNameSet = new Set<string>();
    for (const c of columns) {
      const cName = c.name.trim().toLowerCase();
      if (!cName) {
        setErrorMsg('Semua kolom harus memiliki nama');
        return;
      }
      if (colNameSet.has(cName)) {
        setErrorMsg(`Nama kolom "${cName}" duplikat`);
        return;
      }
      colNameSet.add(cName);
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: cleanTableName,
        schema: schema || 'public',
        description: description.trim(),
        columns: columns.map((c) => ({
          name: c.name.trim().replace(/\s+/g, '_').toLowerCase(),
          type: c.type,
          is_primary_key: c.isPrimaryKey,
          is_nullable: c.isNullable,
          is_unique: c.isUnique,
          default_value: c.defaultValue.trim() || undefined,
          comment: c.comment.trim() || undefined,
        })),
      };

      const res = await api.createTable(payload);
      onShowToast(res?.message || `Tabel ${cleanTableName} berhasil dibuat!`, 'table_rows');
      onTableCreated(cleanTableName);
      onClose();
    } catch (err: any) {
      console.error('Create table error:', err);
      // Fallback: try raw DDL execution if /tables endpoint is not reachable
      try {
        const rawSql = generateLiveSql();
        await api.executeQuery(rawSql);
        onShowToast(`Tabel ${cleanTableName} berhasil dibuat!`, 'table_rows');
        onTableCreated(cleanTableName);
        onClose();
      } catch (rawErr: any) {
        setErrorMsg(rawErr.message || err.message || 'Gagal membuat tabel. Periksa sintaks kolom atau koneksi database.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-surface-container-low border border-surface-container-highest rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-1 sm:p-2 bg-surface-container flex items-center justify-between border-b border-surface-container-high shrink-0">
          <div className="flex items-center gap-1">
            <div className="w-9 h-9 flex items-center justify-center text-primary">
              <TableIcon className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <h3 className="font-headline-sm text-base sm:text-lg font-bold text-on-surface flex items-center gap-2">
                <span>Buat Tabel Baru</span>
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab & Template Bar */}
        <div className="px-4 py-2 bg-surface-container-lowest border-b border-surface-container-high flex flex-wrap items-center justify-between gap-2 shrink-0">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-on-surface-variant flex items-center gap-1 font-semibold mr-1">
              <span>Presets:</span>
            </span>
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => applyPreset(p)}
                className="px-2.5 py-1 rounded-lg text-xs bg-surface-container hover:bg-surface-container-high text-on-surface border border-surface-container-highest transition-colors cursor-pointer shadow-xs"
                title={p.desc}
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center p-0.5 rounded-lg bg-surface-container border border-surface-container-high">
            <button
              type="button"
              onClick={() => setActiveTab('visual')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'visual'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Visual Editor</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sql')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'sql'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>SQL Preview</span>
            </button>
          </div>
        </div>

        {/* Body Container */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4">
          {/* Error Notice */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-error-container/20 border border-error/30 text-error flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <input
            type="text"
            value={schema}
            onChange={(e) => setSchema(e.target.value)}
            placeholder="public"
            className="hidden w-full px-3 py-1.5 rounded-lg bg-surface-container text-on-surface text-xs font-code-sm border border-surface-container-high focus:border-primary transition-colors outline-none"
          />
          {/* General Table Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-surface-container-lowest p-3.5 rounded-xl border border-surface-container-high/60">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface flex items-center justify-between">
                <span>Nama Tabel *</span>
                {isDuplicateName && (
                  <span className="text-[10px] text-error font-normal">Sudah ada!</span>
                )}
              </label>
              <input
                type="text"
                value={tableName}
                onChange={(e) => {
                  setTableName(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="misal: customers, invoices"
                required
                className={`w-full px-3 py-1.5 rounded-lg bg-surface-container text-on-surface text-xs font-code-sm border transition-colors outline-none ${
                  isDuplicateName
                    ? 'border-error focus:border-error'
                    : 'border-surface-container-high focus:border-primary'
                }`}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface">Deskripsi / Komentar (Opsional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Keterangan fungsi tabel"
                className="w-full px-3 py-1.5 rounded-lg bg-surface-container text-on-surface text-xs border border-surface-container-high focus:border-primary transition-colors outline-none"
              />
            </div>
          </div>

          {activeTab === 'visual' ? (
            /* ================= VISUAL COLUMNS EDITOR ================= */
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-on-surface uppercase tracking-wider font-label-sm">
                  Daftar Kolom ({columns.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddColumn}
                  className="flex items-center gap-1 px-3 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 font-semibold text-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Kolom</span>
                </button>
              </div>

              {/* Columns Table / Form List */}
              <div className="overflow-x-auto rounded-xl border border-surface-container-high bg-surface-container-lowest shadow-sm">
                <table className="w-full border-collapse text-left text-xs font-code-sm">
                  <thead>
                    <tr className="bg-surface-container border-b border-surface-container-high text-on-surface-variant text-[11px]">
                      <th className="p-2.5 font-semibold">Nama Kolom</th>
                      <th className="p-2.5 font-semibold min-w-[170px]">Tipe Data</th>
                      <th className="p-2.5 font-semibold text-center w-12" title="Primary Key">
                        PK
                      </th>
                      <th className="p-2.5 font-semibold text-center w-14" title="Dapat Bernilai Null">
                        Nullable
                      </th>
                      <th className="p-2.5 font-semibold text-center w-12" title="Nilai Unik">
                        Unique
                      </th>
                      <th className="p-2.5 font-semibold min-w-[140px]">Default Value</th>
                      <th className="p-2.5 font-semibold min-w-[140px]">Komentar</th>
                      <th className="p-2.5 font-semibold text-center w-10">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container-high/40">
                    {columns.map((col) => (
                      <tr key={col.id} className="hover:bg-surface-container/40 transition-colors">
                        {/* Name */}
                        <td className="p-2">
                          <input
                            type="text"
                            value={col.name}
                            onChange={(e) =>
                              handleUpdateColumn(col.id, {
                                name: e.target.value.replace(/\s+/g, '_').toLowerCase(),
                              })
                            }
                            placeholder="nama_kolom"
                            required
                            className="w-full px-2 py-1 rounded bg-surface-container text-on-surface border border-surface-container-high focus:border-primary outline-none"
                          />
                        </td>

                        {/* Type */}
                        <td className="p-2 min-w-[210px]">
                          {col.isCustomType ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={col.type}
                                onChange={(e) => handleUpdateColumn(col.id, { type: e.target.value })}
                                placeholder="misal: VARCHAR(32), my_enum"
                                autoFocus
                                required
                                className="w-full px-2 py-1 rounded bg-surface-container text-on-surface font-semibold border border-primary/50 focus:border-primary outline-none text-xs font-code-sm"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateColumn(col.id, { isCustomType: false, type: 'VARCHAR(255)' })}
                                className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
                                title="Kembali ke pilihan dropdown"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <select
                              value={
                                ALL_FLAT_TYPES.includes(col.type)
                                  ? col.type
                                  : '__custom__'
                              }
                              onChange={(e) => {
                                if (e.target.value === '__custom__') {
                                  handleUpdateColumn(col.id, { isCustomType: true });
                                } else {
                                  handleUpdateColumn(col.id, { type: e.target.value, isCustomType: false });
                                }
                              }}
                              className="w-full px-2 py-1 rounded bg-surface-container text-on-surface font-semibold border border-surface-container-high focus:border-primary outline-none text-xs cursor-pointer font-code-sm"
                            >
                              {POSTGRES_TYPE_CATEGORIES.map((cat) => (
                                <optgroup key={cat.category} label={cat.category}>
                                  {cat.types.map((t) => (
                                    <option key={t.value} value={t.value}>
                                      {t.label} ({t.desc})
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                              <optgroup label="Lainnya">
                                <option value="__custom__">✍️ Ketik tipe custom / ENUM...</option>
                              </optgroup>
                            </select>
                          )}
                        </td>

                        {/* Primary Key */}
                        <td className="p-2 text-center">
                          <label className="inline-flex items-center justify-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={col.isPrimaryKey}
                              onChange={(e) =>
                                handleUpdateColumn(col.id, { isPrimaryKey: e.target.checked })
                              }
                              className="w-4 h-4 rounded text-primary focus:ring-0 cursor-pointer accent-primary"
                            />
                          </label>
                        </td>

                        {/* Nullable */}
                        <td className="p-2 text-center">
                          <label className="inline-flex items-center justify-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={col.isNullable}
                              disabled={col.isPrimaryKey}
                              onChange={(e) =>
                                handleUpdateColumn(col.id, { isNullable: e.target.checked })
                              }
                              className="w-4 h-4 rounded text-primary focus:ring-0 cursor-pointer accent-primary disabled:opacity-30"
                            />
                          </label>
                        </td>

                        {/* Unique */}
                        <td className="p-2 text-center">
                          <label className="inline-flex items-center justify-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={col.isUnique}
                              disabled={col.isPrimaryKey}
                              onChange={(e) =>
                                handleUpdateColumn(col.id, { isUnique: e.target.checked })
                              }
                              className="w-4 h-4 rounded text-primary focus:ring-0 cursor-pointer accent-primary disabled:opacity-30"
                            />
                          </label>
                        </td>

                        {/* Default Value */}
                        <td className="p-2">
                          <input
                            type="text"
                            value={col.defaultValue}
                            onChange={(e) =>
                              handleUpdateColumn(col.id, { defaultValue: e.target.value })
                            }
                            placeholder="now(), 0, 'active'"
                            className="w-full px-2 py-1 rounded bg-surface-container text-on-surface border border-surface-container-high focus:border-primary outline-none"
                          />
                        </td>

                        {/* Comment */}
                        <td className="p-2">
                          <input
                            type="text"
                            value={col.comment}
                            onChange={(e) => handleUpdateColumn(col.id, { comment: e.target.value })}
                            placeholder="Keterangan..."
                            className="w-full px-2 py-1 rounded bg-surface-container text-on-surface-variant border border-surface-container-high focus:border-primary outline-none"
                          />
                        </td>

                        {/* Actions */}
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveColumn(col.id)}
                            disabled={columns.length <= 1}
                            className="p-1 rounded text-on-surface-variant hover:text-error hover:bg-error-container/20 transition-colors cursor-pointer disabled:opacity-20"
                            title="Hapus Kolom"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* ================= SQL DDL PREVIEW TAB ================= */
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-on-surface uppercase tracking-wider font-label-sm">
                  Live Generated PostgreSQL DDL
                </span>
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="flex items-center gap-1 px-3 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary border border-surface-container-highest text-xs transition-colors cursor-pointer shadow-xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin SQL DDL</span>
                </button>
              </div>
              <div className="rounded-xl bg-surface-container-lowest border border-surface-container-high p-4 overflow-x-auto font-mono text-xs text-on-surface max-h-72">
                <pre className="whitespace-pre leading-relaxed text-secondary">
                  <code>{generateLiveSql()}</code>
                </pre>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="mt-auto pt-4 border-t border-surface-container-high flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopySql}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-xs transition-colors cursor-pointer border border-surface-container-highest"
              >
                <Copy className="w-3.5 h-3.5 text-secondary" />
                <span>Salin DDL SQL</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold transition-colors cursor-pointer border border-surface-container-high"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !cleanTableName || isDuplicateName}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-on-primary text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    <span>Membuat Tabel...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Buat Tabel Sekarang</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
