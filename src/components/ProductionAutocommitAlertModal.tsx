import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { ClusterConnection } from '../types/database';

interface ProductionAutocommitAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  activeCluster?: ClusterConnection;
  activeDatabase: string;
}

export const ProductionAutocommitAlertModal: React.FC<ProductionAutocommitAlertModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  activeDatabase,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[400px] bg-surface-container-low border border-surface-container-high rounded-xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-surface-container-high/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <h3 className="text-xs font-semibold text-on-surface">
              Aktifkan Auto-Commit?
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 text-xs text-on-surface-variant leading-relaxed">
          Koneksi ini berada di mode <span className="font-semibold text-red-400">Production</span>. Setiap perubahan data akan langsung tersimpan secara permanen.
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-surface-container/50 border-t border-surface-container-high/60 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium cursor-pointer transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium cursor-pointer transition-colors"
          >
            Aktifkan
          </button>
        </div>
      </div>
    </div>
  );
};
