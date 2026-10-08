import React from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Trash2,
  Edit3,
  Power,
  Zap,
  Wifi,
  X,
  Info,
  Database,
  Lock,
} from 'lucide-react';

export interface ToastProps {
  show: boolean;
  message: string;
  icon?: string;
  isError?: boolean;
  onClose?: () => void;
}

const renderIcon = (iconName?: string, isError?: boolean) => {
  const cls = `w-4 h-4 shrink-0 ${isError ? 'text-rose-400' : 'text-primary'}`;
  switch (iconName) {
    case 'verified':
    case 'check':
      return <CheckCircle2 className={cls} />;
    case 'delete':
      return <Trash2 className={cls} />;
    case 'edit':
      return <Edit3 className={cls} />;
    case 'power':
      return <Power className={cls} />;
    case 'wifi_tethering':
      return <Wifi className={cls} />;
    case 'zap':
      return <Zap className={cls} />;
    case 'database':
      return <Database className={cls} />;
    case 'lock':
      return <Lock className={cls} />;
    case 'warning':
    case 'error':
      return <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />;
    default:
      return isError ? <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" /> : <CheckCircle2 className="w-4 h-4 shrink-0 text-primary" />;
  }
};

export const Toast: React.FC<ToastProps> = ({
  show,
  message,
  icon,
  isError,
  onClose,
}) => {
  return (
    <div
      className={`fixed bottom-8 right-6 z-[120] flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-container-high/95 backdrop-blur-md border border-surface-container-highest shadow-2xl transition-all duration-300 max-w-sm select-none ${
        show ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-8 opacity-0 scale-95 pointer-events-none'
      }`}
    >
      <div className="shrink-0">{renderIcon(icon, isError)}</div>
      <div className="text-xs font-medium text-on-surface leading-snug flex-1">
        {message}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
