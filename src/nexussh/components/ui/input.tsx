import React from 'react';
import { cn } from 'nexussh/utils/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  prefixElement?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', label, error, hint, prefixElement, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="block text-xs font-medium text-on-surface">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {prefixElement && (
            <div className="absolute left-3 pointer-events-none text-on-surface-variant flex items-center">
              {prefixElement}
            </div>
          )}
          <input
            type={type}
            ref={ref}
            className={cn(
              'flex h-9 w-full rounded-lg border border-surface-container-high bg-surface-container px-3 py-1 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
              prefixElement && 'pl-8',
              error && 'border-rose-500 focus-visible:ring-rose-500',
              className
            )}
            {...props}
          />
        </div>
        {hint && !error && <p className="text-[11px] text-on-surface-variant/70">{hint}</p>}
        {error && <p className="text-[11px] text-rose-400">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="block text-xs font-medium text-on-surface">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={cn(
            'flex min-h-[80px] w-full rounded-lg border border-surface-container-high bg-surface-container p-3 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
            error && 'border-rose-500 focus-visible:ring-rose-500',
            className
          )}
          {...props}
        />
        {hint && !error && <p className="text-[11px] text-on-surface-variant/70">{hint}</p>}
        {error && <p className="text-[11px] text-rose-400">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, hint, children, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="block text-xs font-medium text-on-surface">
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={cn(
            'flex h-9 w-full rounded-lg border border-surface-container-high bg-surface-container px-3 py-1 text-xs text-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer',
            error && 'border-rose-500 focus-visible:ring-rose-500',
            className
          )}
          {...props}
        >
          {children}
        </select>
        {hint && !error && <p className="text-[11px] text-on-surface-variant/70">{hint}</p>}
        {error && <p className="text-[11px] text-rose-400">{error}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';
