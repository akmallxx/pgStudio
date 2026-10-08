import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost' | 'accent';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-on-primary hover:bg-primary/90 font-semibold shadow-xs shadow-primary/20 hover:shadow-primary/30 border border-primary/20',
  secondary:
    'bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-surface-container-highest/60',
  danger:
    'bg-rose-600 hover:bg-rose-500 text-white font-semibold shadow-xs shadow-rose-900/30 border border-rose-500/30',
  outline:
    'bg-transparent hover:bg-surface-container border border-surface-container-highest text-on-surface-variant hover:text-on-surface',
  ghost:
    'bg-transparent hover:bg-surface-container text-on-surface-variant hover:text-on-surface',
  accent:
    'bg-secondary/15 hover:bg-secondary/25 text-secondary border border-secondary/30 font-medium',
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: 'px-2 py-1 text-[11px] gap-1 rounded',
  sm: 'px-2.5 py-1.5 text-xs gap-1.5 rounded-md',
  md: 'px-3.5 py-2 text-xs gap-2 rounded-lg',
  lg: 'px-4 py-2.5 text-sm gap-2.5 rounded-xl font-medium',
  icon: 'p-1.5 rounded-lg text-xs justify-center shrink-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'sm',
      isLoading = false,
      leftIcon,
      rightIcon,
      className = '',
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`inline-flex items-center justify-center font-sans transition-all duration-150 cursor-pointer select-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${
          variantStyles[variant]
        } ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        {children && <span>{children}</span>}
        {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
