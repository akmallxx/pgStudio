import React from 'react';

export type BadgeVariant =
  | 'PROD'
  | 'STAGING'
  | 'LOCAL'
  | 'REPLICA / RO'
  | 'connected'
  | 'standby'
  | 'idle'
  | 'active'
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'warning'
  | 'neutral';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string; border: string; dotColor?: string }> = {
  PROD: {
    bg: 'bg-rose-500/15',
    text: 'text-rose-400 font-bold',
    border: 'border-rose-500/30',
    dotColor: 'bg-rose-400',
  },
  STAGING: {
    bg: 'bg-sky-500/15',
    text: 'text-sky-400 font-semibold',
    border: 'border-sky-500/30',
    dotColor: 'bg-sky-400',
  },
  LOCAL: {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-400 font-semibold',
    border: 'border-emerald-500/30',
    dotColor: 'bg-emerald-400',
  },
  'REPLICA / RO': {
    bg: 'bg-purple-500/15',
    text: 'text-purple-300 font-semibold',
    border: 'border-purple-500/30',
    dotColor: 'bg-purple-400',
  },
  connected: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/25',
    dotColor: 'bg-emerald-400 animate-pulse',
  },
  standby: {
    bg: 'bg-surface-container',
    text: 'text-on-surface-variant',
    border: 'border-surface-container-highest',
    dotColor: 'bg-on-surface-variant/50',
  },
  idle: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/25',
    dotColor: 'bg-amber-400',
  },
  active: {
    bg: 'bg-primary/15',
    text: 'text-primary',
    border: 'border-primary/30',
    dotColor: 'bg-primary animate-pulse',
  },
  primary: {
    bg: 'bg-primary/15',
    text: 'text-primary',
    border: 'border-primary/30',
  },
  secondary: {
    bg: 'bg-secondary/15',
    text: 'text-secondary',
    border: 'border-secondary/30',
  },
  danger: {
    bg: 'bg-rose-500/15',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
  },
  warning: {
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
  },
  neutral: {
    bg: 'bg-surface-container-high',
    text: 'text-on-surface-variant',
    border: 'border-outline-variant/30',
  },
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'sm',
  dot = false,
  className = '',
  children,
  ...props
}) => {
  const style = variantStyles[variant] || variantStyles.neutral;
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border tracking-wide uppercase select-none ${style.bg} ${style.text} ${style.border} ${sizeClass} ${className}`}
      {...props}
    >
      <span>{children}</span>
    </span>
  );
};
