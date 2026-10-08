import React from 'react';
import { ConfirmModal } from './ui/ConfirmModal';
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
  return (
    <ConfirmModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      type="danger"
      title="Aktifkan Auto-Commit di Database Production?"
      description={
        <span>
          Database <strong className="text-on-surface">"{activeDatabase}"</strong> berada di mode{' '}
          <strong className="text-rose-400">Production</strong>. Setiap modifikasi data (INSERT/UPDATE/DELETE) akan langsung tersimpan permanen.
        </span>
      }
      confirmText="Aktifkan Autocommit"
      cancelText="Batal"
    />
  );
};
