import React, { useState } from 'react';
import { ColumnDefinition } from '../../types/database';
import { Columns, X, AlertCircle, Zap } from 'lucide-react';

interface InsertColumnModalProps {
  isOpen: boolean;
  tableName: string;
  onClose: () => void;
  onAddColumn: (column: {
    name: string;
    type: string;
    defaultValue?: string;
    isNullable: boolean;
    isUnique: boolean;
    comment?: string;
  }) => Promise<void>;
  existingColumns: ColumnDefinition[];
}

const COMMON_DATA_TYPES = [
  { label: 'VARCHAR(255)', desc: 'Variable-length text with limit' },
  { label: 'TEXT', desc: 'Unlimited length character string' },
  { label: 'INTEGER', desc: 'Standard 4-byte integer' },
  { label: 'BIGINT', desc: '8-byte integer for large IDs' },
  { label: 'NUMERIC(12,2)', desc: 'Exact decimal for money / prices' },
  { label: 'BOOLEAN', desc: 'Logical true / false' },
  { label: 'TIMESTAMPTZ', desc: 'Timestamp with time zone' },
  { label: 'DATE', desc: 'Calendar date (year, month, day)' },
  { label: 'JSONB', desc: 'Binary JSON with indexing support' },
  { label: 'UUID', desc: 'Universally unique identifier' },
];

export const InsertColumnModal: React.FC<InsertColumnModalProps> = ({
  isOpen,
  tableName,
  onClose,
  onAddColumn,
  existingColumns,
}) => {
  const [colName, setColName] = useState('');
  const [colType, setColType] = useState('VARCHAR(255)');
  const [customType, setCustomType] = useState('');
  const [defaultValue, setDefaultValue] = useState('');
  const [isNullable, setIsNullable] = useState(true);
  const [isUnique, setIsUnique] = useState(false);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const effectiveType = customType.trim() ? customType.trim() : colType;

  // Sanitize name: remove spaces, lowercase, snake_case
  const cleanColName = colName.trim().replace(/\s+/g, '_').toLowerCase();

  // Validate duplicate
  const isDuplicate = existingColumns.some(
    (c) => c.name.toLowerCase() === cleanColName
  );

  // Generate real-time live SQL statement
  const generateLiveSql = () => {
    if (!cleanColName) return `-- Fill column details to preview ALTER TABLE`;

    const parts = [
      `ALTER TABLE public."${tableName}"`,
      `ADD COLUMN "${cleanColName}" ${effectiveType}`,
    ];

    if (defaultValue.trim()) {
      parts.push(`DEFAULT ${defaultValue.trim()}`);
    }

    if (!isNullable) {
      parts.push(`NOT NULL`);
    }

    if (isUnique) {
      parts.push(`UNIQUE`);
    }

    let sql = parts.join(' ') + ';';
    if (comment.trim()) {
      sql += `\nCOMMENT ON COLUMN public."${tableName}"."${cleanColName}" IS '${comment.replace(/'/g, "''")}';`;
    }
    return sql;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cleanColName) {
      setErrorMsg('Nama kolom wajib diisi');
      return;
    }
    if (isDuplicate) {
      setErrorMsg(`Kolom "${cleanColName}" sudah ada di tabel ${tableName}`);
      return;
    }
    if (!effectiveType) {
      setErrorMsg('Tipe data kolom wajib dipilih');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);
    try {
      await onAddColumn({
        name: cleanColName,
        type: effectiveType,
        defaultValue: defaultValue.trim() || undefined,
        isNullable,
        isUnique,
        comment: comment.trim() || undefined,
      });
      // Reset form
      setColName('');
      setDefaultValue('');
      setComment('');
      setIsNullable(true);
      setIsUnique(false);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menambahkan kolom');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-surface-container-low border border-surface-container-highest rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-surface-container-lowest/80 border-b border-surface-container-high/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <Columns className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-on-surface">
                Insert Column (ALTER TABLE)
              </h2>
              <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant font-code-sm">
                <span>Target:</span>
                <span className="px-1.5 py-0.2 rounded bg-surface-container-high text-primary font-semibold">
                  public.{tableName}
                </span>
                <span>•</span>
                <span>PostgreSQL 16 Engine</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            title="Tutup (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 font-body-md text-xs">
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-error/10 border border-error/30 text-error flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-medium text-xs">{errorMsg}</span>
            </div>
          )}

          {/* 1. Column Name */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-on-surface flex items-center gap-1">
                <span>Column Name</span>
                <span className="text-error">*</span>
              </label>
              <span className="text-[10px] text-on-surface-variant font-code-sm">
                snake_case format
              </span>
            </div>
            <input
              type="text"
              autoFocus
              value={colName}
              onChange={(e) => {
                setColName(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="e.g. promo_code, discount_pct, is_verified"
              className={`w-full px-3 py-2 rounded-lg bg-surface-container-lowest text-on-surface font-code-sm text-xs border focus:outline-none transition-colors ${
                isDuplicate
                  ? 'border-error ring-1 ring-error'
                  : 'border-surface-container-high focus:border-primary focus:ring-1 focus:ring-primary'
              }`}
            />
            {isDuplicate && (
              <p className="text-[11px] text-error">
                Kolom "{cleanColName}" sudah terdaftar pada tabel ini.
              </p>
            )}
          </div>

          {/* 2. Data Type Selection */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-on-surface flex items-center gap-1">
                <span>PostgreSQL Data Type</span>
                <span className="text-error">*</span>
              </label>
              <span className="text-[10px] text-primary font-code-sm">
                {effectiveType}
              </span>
            </div>

            {/* Quick Type Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {COMMON_DATA_TYPES.map((t) => {
                const isSelected = colType === t.label && !customType;
                return (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => {
                      setColType(t.label);
                      setCustomType('');
                    }}
                    className={`px-2 py-1.5 rounded-lg text-left transition-all cursor-pointer border flex flex-col ${
                      isSelected
                        ? 'bg-primary/15 text-primary border-primary/40 font-semibold shadow-xs'
                        : 'bg-surface-container text-on-surface hover:bg-surface-container-high border-surface-container-high/60'
                    }`}
                  >
                    <span className="font-code-sm text-[11px] truncate">{t.label}</span>
                    <span className="text-[9px] text-on-surface-variant/70 truncate">
                      {t.desc}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Custom Type Input */}
            <div className="pt-1">
              <input
                type="text"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="Or specify custom type (e.g. INET, CITEXT, VECTOR(1536), NUMERIC(18,4))"
                className="w-full px-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-code-sm text-xs border border-surface-container-high focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* 3. Default Value */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-on-surface">Default Value</label>
              <span className="text-[10px] text-on-surface-variant font-code-sm">
                Optional (e.g. 'active', 0, NOW(), NULL)
              </span>
            </div>
            <input
              type="text"
              value={defaultValue}
              onChange={(e) => setDefaultValue(e.target.value)}
              placeholder="e.g. 'draft', 0, true, gen_random_uuid(), NOW()"
              className="w-full px-3 py-2 rounded-lg bg-surface-container-lowest text-on-surface font-code-sm text-xs border border-surface-container-high focus:outline-none focus:border-primary"
            />
          </div>

          {/* 4. Constraints (Nullable, Unique) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Allow Null */}
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container border border-surface-container-high/70 cursor-pointer hover:bg-surface-container-high transition-colors">
              <div className="space-y-0.5">
                <span className="font-semibold text-xs text-on-surface block">Nullable (ALLOW NULL)</span>
                <span className="text-[10px] text-on-surface-variant block">
                  Izinkan nilai NULL pada baris baru
                </span>
              </div>
              <input
                type="checkbox"
                checked={isNullable}
                onChange={(e) => setIsNullable(e.target.checked)}
                className="w-4 h-4 rounded bg-surface accent-primary cursor-pointer"
              />
            </label>

            {/* Unique Constraint */}
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container border border-surface-container-high/70 cursor-pointer hover:bg-surface-container-high transition-colors">
              <div className="space-y-0.5">
                <span className="font-semibold text-xs text-on-surface block">UNIQUE Constraint</span>
                <span className="text-[10px] text-on-surface-variant block">
                  Nilai kolom tidak boleh duplikat
                </span>
              </div>
              <input
                type="checkbox"
                checked={isUnique}
                onChange={(e) => setIsUnique(e.target.checked)}
                className="w-4 h-4 rounded bg-surface accent-primary cursor-pointer"
              />
            </label>
          </div>

          {/* 5. Column Comment / Documentation */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-on-surface">Description / Comment</label>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g. Status pesanan user dari checkout payment"
              className="w-full px-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm text-xs border border-surface-container-high focus:outline-none focus:border-primary"
            />
          </div>

          {/* 6. Live SQL Preview */}
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider font-code-sm">
                Generated SQL Execution Preview
              </span>
              <span className="text-[9px] text-secondary font-code-sm">DDL Transaction</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#080d1a] border border-surface-container-highest font-code-sm text-[11px] text-emerald-400 overflow-x-auto whitespace-pre leading-relaxed select-all">
              {generateLiveSql()}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-surface-container-high/60">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-xs transition-colors cursor-pointer border border-surface-container-high"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !cleanColName || isDuplicate}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-fixed text-on-primary font-semibold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-on-primary border-t-transparent rounded-full animate-spin"></span>
                  <span>Executing ALTER TABLE...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>Run ALTER TABLE</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
