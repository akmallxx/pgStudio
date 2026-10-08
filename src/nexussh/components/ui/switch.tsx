import * as React from 'react';
import { cn } from 'nexussh/utils/cn';

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  size?: 'sm' | 'default';
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, size = 'default', ...props }, ref) => {
    const isSm = size === 'sm';

    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        ref={ref}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          if (!disabled) onCheckedChange(!checked);
        }}
        className={cn(
          'peer inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50',
          isSm ? 'h-4 w-7' : 'h-5 w-9',
          checked ? 'bg-primary' : 'bg-surface-container-high hover:bg-surface-container-highest',
          className
        )}
        {...props}
      >
        <span
          className={cn(
            'pointer-events-none block rounded-full transition-transform',
            isSm ? 'h-3 w-3' : 'h-4 w-4',
            checked
              ? isSm
                ? 'translate-x-3.5 bg-on-primary shadow-sm'
                : 'translate-x-4.5 bg-on-primary shadow-sm'
              : 'translate-x-0.5 bg-on-surface-variant'
          )}
        />
      </button>
    );
  }
);
Switch.displayName = 'Switch';
