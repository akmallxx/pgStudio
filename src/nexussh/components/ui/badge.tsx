import React from 'react';
import { cn } from 'nexussh/utils/cn';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'outline' | 'success' | 'warning' | 'error' | 'secondary';
}

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  const variantStyles = {
    default: 'border-surface-container-high bg-surface-container text-on-surface',
    outline: 'border-surface-container-high bg-transparent text-on-surface-variant',
    secondary: 'border-secondary/20 bg-secondary/10 text-secondary',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    error: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-tight',
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
