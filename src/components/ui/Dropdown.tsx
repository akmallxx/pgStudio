import React, { useState, useRef, useEffect, createContext, useContext } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface DropdownContextType {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  close: () => void;
}

const DropdownContext = createContext<DropdownContextType | undefined>(undefined);

export interface DropdownProps {
  children: React.ReactNode;
  className?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({ children, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <DropdownContext.Provider value={{ isOpen, setIsOpen, close: () => setIsOpen(false) }}>
      <div ref={containerRef} className={`relative inline-block ${className}`}>
        {children}
      </div>
    </DropdownContext.Provider>
  );
};

export const DropdownTrigger: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  const context = useContext(DropdownContext);
  if (!context) throw new Error('DropdownTrigger must be used within Dropdown');

  return (
    <div
      onClick={() => context.setIsOpen((prev) => !prev)}
      className={`cursor-pointer inline-flex items-center ${className}`}
    >
      {children}
    </div>
  );
};

export interface DropdownMenuProps {
  children: React.ReactNode;
  align?: 'left' | 'right';
  width?: string;
  className?: string;
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  children,
  align = 'left',
  width = 'w-56',
  className = '',
}) => {
  const context = useContext(DropdownContext);
  if (!context) throw new Error('DropdownMenu must be used within Dropdown');

  if (!context.isOpen) return null;

  const alignClass = align === 'right' ? 'right-0' : 'left-0';

  return (
    <div
      className={`absolute ${alignClass} mt-1.5 ${width} bg-surface-container-low border border-surface-container-highest rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 select-none ${className}`}
    >
      {children}
    </div>
  );
};

export interface DropdownItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: React.ReactNode;
  isSelected?: boolean;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
}

export const DropdownItem: React.FC<DropdownItemProps> = ({
  children,
  onClick,
  icon,
  isSelected,
  danger,
  disabled,
  className = '',
}) => {
  const context = useContext(DropdownContext);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    if (onClick) onClick();
    if (context) context.close();
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        danger
          ? 'text-rose-400 hover:bg-rose-500/10'
          : isSelected
          ? 'bg-primary/10 text-primary font-semibold'
          : 'text-on-surface hover:bg-surface-container'
      } ${className}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="truncate">{children}</span>
      </div>
      {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
    </button>
  );
};

export const DropdownDivider: React.FC = () => (
  <div className="my-1 border-t border-surface-container-high/80" />
);

export const DropdownHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider text-on-surface-variant/60">
    {children}
  </div>
);
