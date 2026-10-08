import React from 'react';
import { cn } from 'nexussh/utils/cn';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'subtle';
  size?: 'sm' | 'default' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const baseClasses =
      'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer';

    const variantClasses = {
      default:
        'bg-primary text-on-primary shadow-sm hover:brightness-110 active:scale-[0.98] font-semibold',
      secondary:
        'bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-surface-container-highest active:scale-[0.98]',
      outline:
        'border border-surface-container-high bg-transparent text-on-surface hover:bg-surface-container hover:text-on-surface',
      ghost:
        'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
      destructive:
        'bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 hover:text-rose-200',
      subtle:
        'bg-surface-container text-on-surface border border-surface-container-high hover:bg-surface-container-high',
    };

    const sizeClasses = {
      sm: 'h-8 rounded-lg px-2.5 text-xs',
      default: 'h-9 px-3.5 py-1.5 text-xs',
      lg: 'h-10 rounded-lg px-5 text-sm',
      icon: 'h-8 w-8 p-0',
    };

    return (
      <button
        ref={ref}
        className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
