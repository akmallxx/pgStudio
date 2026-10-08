import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
      <div className="space-y-1.5 w-full text-left">
        {label && (
          <label htmlFor={inputId} className="block text-[11px] font-medium text-on-surface-variant">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`w-full py-2 bg-surface-container border text-xs text-on-surface rounded-lg placeholder:text-on-surface-variant/40 focus:outline-none transition-colors ${
              leftIcon ? 'pl-9' : 'pl-3'
            } ${rightIcon ? 'pr-9' : 'pr-3'} ${
              error
                ? 'border-rose-500/60 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30'
                : 'border-surface-container-highest focus:border-primary focus:ring-1 focus:ring-primary/40'
            } ${className}`}
            {...props}
          />
          {rightIcon && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="text-[11px] text-rose-400 leading-tight">{error}</p>}
        {!error && hint && <p className="text-[11px] text-on-surface-variant/60 leading-tight">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
