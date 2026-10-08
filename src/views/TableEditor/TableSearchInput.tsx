import React, { useState, useRef, useEffect } from 'react';
import { Search, Loader2, X } from 'lucide-react';

export interface TableSearchInputProps {
  initialValue: string;
  rowCount: number;
  isLoading?: boolean;
  onSearch: (value: string) => void;
}

export const TableSearchInput = React.memo<TableSearchInputProps>(({
  initialValue,
  rowCount,
  isLoading = false,
  onSearch,
}) => {
  const [localValue, setLocalValue] = useState(initialValue);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<any>(null);

  // Synchronize when initialValue (e.g. from URL param or clear) changes externally
  useEffect(() => {
    setLocalValue(initialValue);
  }, [initialValue]);

  // Global Ctrl+F / Cmd+F shortcut to focus table search
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalValue(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // 450ms debounce prevents flooding backend with intermediate ILIKE searches
    debounceTimerRef.current = setTimeout(() => {
      onSearch(val);
    }, 450);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      onSearch(localValue);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      setLocalValue('');
      onSearch('');
    }
  };

  const handleClear = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setLocalValue('');
    onSearch('');
  };

  return (
    <div className="relative flex items-center">
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 absolute left-2.5 text-primary animate-spin pointer-events-none" />
      ) : (
        <Search className="w-3.5 h-3.5 absolute left-2.5 text-on-surface-variant pointer-events-none" />
      )}
      <input
        ref={inputRef}
        value={localValue}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        className="pl-7 pr-16 py-1.5 w-48 sm:w-60 rounded-lg bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant/50 font-code-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary border border-surface-container-high transition-colors"
        placeholder={`Search in ${rowCount.toLocaleString()} records...`}
        type="text"
      />
      {localValue ? (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 text-xs text-on-surface-variant hover:text-on-surface cursor-pointer p-0.5 rounded hover:bg-surface-container-high transition-colors"
          title="Hapus pencarian (Esc)"
        >
          <X className="w-3 h-3" />
        </button>
      ) : !isFocused ? (
        <kbd
          className="absolute right-2 px-1.5 py-0.5 rounded bg-surface-container-high/90 text-on-surface-variant/80 font-code-sm text-[9px] border border-outline-variant/30 select-none pointer-events-none transition-opacity duration-150"
          title="Shortcut: Ctrl+F (atau ⌘F)"
        >
          Ctrl+F
        </kbd>
      ) : null}
    </div>
  );
});

TableSearchInput.displayName = 'TableSearchInput';
