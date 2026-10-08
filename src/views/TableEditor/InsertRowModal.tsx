import React from 'react';
import { PlusSquare } from 'lucide-react';
import { ColumnMeta } from '../../types/database';
import { Modal } from '../../components/ui/Modal';

export interface InsertRowModalProps {
  isOpen: boolean;
  tableName: string;
  columns: ColumnMeta[];
  newRowInputs: Record<string, any>;
  onInputChange: (name: string, value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const InsertRowModal: React.FC<InsertRowModalProps> = ({
  isOpen,
  tableName,
  columns,
  newRowInputs,
  onInputChange,
  onSubmit,
  onClose,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Insert Row into public.${tableName}`}
      icon={<PlusSquare className="w-4 h-4 text-primary" />}
      maxWidth="lg"
    >
      <form onSubmit={onSubmit} className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
        {columns
          .filter((c) => !c.isPk)
          .map((col) => (
            <div key={col.name} className="space-y-1">
              <label className="block font-label-sm text-xs font-semibold text-on-surface">
                {col.name} <span className="text-on-surface-variant font-normal">({col.type})</span>
              </label>
              <input
                placeholder={`Enter ${col.name}...`}
                value={newRowInputs[col.name] || ''}
                onChange={(e) => onInputChange(col.name, e.target.value)}
                className="w-full px-3 py-1.5 rounded bg-surface-container-lowest text-on-surface font-code-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary border border-surface-container-high"
              />
            </div>
          ))}

        <div className="pt-2 flex items-center justify-end gap-2 border-t border-surface-container-high">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-surface-container-high text-on-surface text-xs font-label-md cursor-pointer hover:bg-surface-container-highest transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 rounded bg-primary text-on-primary font-semibold text-xs hover:bg-primary-fixed shadow cursor-pointer transition-colors"
          >
            Insert Row
          </button>
        </div>
      </form>
    </Modal>
  );
};
