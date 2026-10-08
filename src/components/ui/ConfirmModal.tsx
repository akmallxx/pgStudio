import React, { useState } from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle2, Trash2, LogOut, Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

export type ConfirmType = 'danger' | 'warning' | 'info' | 'success';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: React.ReactNode;
  type?: ConfirmType;
  confirmText?: string;
  cancelText?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

const typeStyles: Record<
  ConfirmType,
  {
    iconBg: string;
    iconBorder: string;
    iconColor: string;
    confirmVariant: 'danger' | 'primary' | 'secondary';
    defaultIcon: React.ReactNode;
  }
> = {
  danger: {
    iconBg: 'bg-rose-500/15',
    iconBorder: 'border-rose-500/30',
    iconColor: 'text-rose-400',
    confirmVariant: 'danger',
    defaultIcon: <Trash2 className="w-5 h-5 text-rose-400" />,
  },
  warning: {
    iconBg: 'bg-amber-500/15',
    iconBorder: 'border-amber-500/30',
    iconColor: 'text-amber-400',
    confirmVariant: 'danger',
    defaultIcon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
  },
  info: {
    iconBg: 'bg-sky-500/15',
    iconBorder: 'border-sky-500/30',
    iconColor: 'text-sky-400',
    confirmVariant: 'primary',
    defaultIcon: <Info className="w-5 h-5 text-sky-400" />,
  },
  success: {
    iconBg: 'bg-emerald-500/15',
    iconBorder: 'border-emerald-500/30',
    iconColor: 'text-emerald-400',
    confirmVariant: 'primary',
    defaultIcon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
  },
};

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  type = 'warning',
  confirmText = 'Konfirmasi',
  cancelText = 'Batal',
  icon,
  children,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const cfg = typeStyles[type];

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="sm" showCloseButton={false}>
      <div className="p-6">
        <div className="flex items-start gap-4 mb-4">
          <div
            className={`w-11 h-11 rounded-xl ${cfg.iconBg} border ${cfg.iconBorder} flex items-center justify-center shrink-0 shadow-sm`}
          >
            {icon || cfg.defaultIcon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-on-surface leading-tight">{title}</h3>
            <div className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
              {description}
            </div>
          </div>
        </div>

        {children && <div className="mt-3 mb-1">{children}</div>}

        <div className="flex items-center justify-end gap-2.5 pt-4 mt-2 border-t border-surface-container-high/60">
          <Button
            variant="ghost"
            size="md"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {cancelText}
          </Button>
          <Button
            variant={cfg.confirmVariant}
            size="md"
            onClick={handleConfirm}
            isLoading={isSubmitting}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
