import React, { useEffect, forwardRef } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl';
  showCloseButton?: boolean;
  className?: string;
}

const maxWidthMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  maxWidth = 'md',
  showCloseButton = true,
  className = '',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidthMap[maxWidth]} bg-surface-container-low border border-surface-container-highest rounded-2xl shadow-2xl flex flex-col overflow-hidden text-on-surface animate-in zoom-in-95 duration-150 text-left ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar (Optional if title provided) */}
        {(title || showCloseButton) && (
          <div className="px-5 py-3.5 bg-surface-container-lowest/80 border-b border-surface-container-high flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              {icon && <span className="shrink-0">{icon}</span>}
              <div className="min-w-0">
                {typeof title === 'string' ? (
                  <h3 className="text-sm font-semibold text-on-surface truncate">{title}</h3>
                ) : (
                  title
                )}
                {subtitle && (
                  <p className="text-xs text-on-surface-variant truncate mt-0.5">{subtitle}</p>
                )}
              </div>
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer shrink-0 ml-2"
                title="Tutup dialog"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Modal Content */}
        {children}
      </div>
    </div>
  );
};

export const ModalBody: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <div className={`p-5 text-xs text-on-surface-variant leading-relaxed ${className}`}>{children}</div>;

export const ModalFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div
    className={`px-5 py-3.5 bg-surface-container/30 border-t border-surface-container-high flex items-center justify-end gap-2.5 ${className}`}
  >
    {children}
  </div>
);
