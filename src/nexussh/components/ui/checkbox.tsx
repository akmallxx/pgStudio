import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from 'nexussh/utils/cn';

export interface CheckboxProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, checked = false, onCheckedChange, disabled, id, ...props }, ref) => {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        ref={ref}
        id={id}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          if (!disabled && onCheckedChange) {
            onCheckedChange(!checked);
          }
        }}
        className={cn(
          'peer h-4 w-4 shrink-0 rounded-[4px] border border-zinc-700 bg-zinc-900/80 transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center',
          checked
            ? 'bg-zinc-100 text-zinc-950 border-zinc-100'
            : 'hover:border-zinc-500 hover:bg-zinc-800/60',
          className
        )}
        {...props}
      >
        {checked && <Check className="h-3 w-3 stroke-[3]" />}
      </button>
    );
  }
);
Checkbox.displayName = 'Checkbox';
