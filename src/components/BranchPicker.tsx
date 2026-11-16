import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, GitBranch, RefreshCw, Search, Star } from 'lucide-react';
import { GitHubBranchSummary } from '../services/github';

interface BranchPickerProps {
  /** Id of the trigger button, so a `<label htmlFor>` can point at the picker. */
  id?: string;
  branches: GitHubBranchSummary[];
  /** The repository's default branch (`main`, `master`, …), when known. */
  defaultBranch: string | null;
  /** Currently selected branch name. May be a branch that is not in `branches`. */
  value: string;
  onSelect: (branchName: string) => void;
  onRefresh: () => void;
  loading: boolean;
  error: string | null;
  /** True when the repository has more branches than were loaded. */
  truncated: boolean;
  disabled?: boolean;
  /** Shown instead of the list when no repository has been chosen yet. */
  emptyHint?: string;
}

/** Keeps the list snappy for repositories with hundreds of branches. */
const MAX_VISIBLE_OPTIONS = 100;

function formatPushed(iso: string | null): string {
  if (!iso) return '';
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return '';
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/**
 * Searchable branch dropdown (combobox) backed by
 * `GET /api/github/branches?repo=owner/repo`. The repository's default branch
 * is pinned to the top of the list and highlighted with a star. A branch name
 * that is not in the list can still be typed through the surrounding
 * "Enter manually" fallback.
 */
export const BranchPicker: React.FC<BranchPickerProps> = ({
  id,
  branches,
  defaultBranch,
  value,
  onSelect,
  onRefresh,
  loading,
  error,
  truncated,
  disabled = false,
  emptyHint = 'Select a repository first.',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const matches = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return branches;
    return branches.filter((branch) => terms.every((term) => branch.name.toLowerCase().includes(term)));
  }, [branches, query]);

  // The default branch always stays at the top, whatever the search term is.
  const options = useMemo(() => {
    const defaultEntry = matches.find((branch) => branch.isDefault);
    const visible = matches.filter((branch) => !branch.isDefault).slice(0, MAX_VISIBLE_OPTIONS);
    return defaultEntry ? [defaultEntry, ...visible] : visible;
  }, [matches]);

  const hiddenMatches = Math.max(0, matches.filter((branch) => !branch.isDefault).length - MAX_VISIBLE_OPTIONS);
  const optionId = (index: number) => `${listId}-option-${index}`;
  // The list can shrink underneath the highlight (typing, refresh): stay in range.
  const highlighted = Math.min(activeIndex, Math.max(0, options.length - 1));
  const selectedEntry = branches.find((branch) => branch.name === value.trim()) || null;

  const close = (returnFocus: boolean) => {
    setOpen(false);
    setQuery('');
    if (returnFocus) triggerRef.current?.focus();
  };

  const choose = (branch: GitHubBranchSummary | undefined) => {
    if (!branch) return;
    onSelect(branch.name);
    close(true);
  };

  // Opening: start on the current selection and move focus into the search box.
  useEffect(() => {
    if (!open) return;
    const selectedIndex = options.findIndex((branch) => branch.name === value.trim());
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    searchRef.current?.focus();
    // Runs only when the dropdown opens; later moves come from typing and arrow keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close when the visitor clicks or tabs away.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open]);

  // Keep the keyboard-highlighted row visible while arrowing through the list.
  useEffect(() => {
    if (!open) return;
    const active = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`);
    active?.scrollIntoView({ block: 'nearest' });
  }, [open, highlighted]);

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (options.length > 0) setActiveIndex((highlighted + 1) % options.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (options.length > 0) setActiveIndex((highlighted - 1 + options.length) % options.length);
        break;
      case 'Home':
        if (options.length > 0) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case 'End':
        if (options.length > 0) {
          event.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      case 'Enter':
        // Never let Enter bubble up and submit the surrounding verification form.
        event.preventDefault();
        choose(options[highlighted]);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      default:
        break;
    }
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
    }
  };

  const isInitialLoad = loading && branches.length === 0;
  const triggerLabel = value.trim() || (loading ? 'Loading branches…' : 'Select a branch');

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Branch"
        disabled={disabled}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={handleTriggerKeyDown}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white flex items-center justify-between gap-2 text-left hover:border-slate-400 focus:outline-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span className="flex items-center gap-2 min-w-0">
          <GitBranch className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className={`truncate font-mono ${value.trim() ? 'text-slate-900' : 'text-slate-400'}`}>
            {triggerLabel}
          </span>
          {(selectedEntry?.isDefault || (value.trim() && defaultBranch === value.trim())) && (
            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-indigo-600 bg-indigo-50 border border-indigo-200 rounded px-1 py-px">
              default
            </span>
          )}
        </span>
        {loading ? (
          <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin shrink-0" />
        ) : (
          <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search branches…"
                aria-label="Search branches"
                aria-autocomplete="list"
                aria-controls={listId}
                aria-activedescendant={options.length > 0 ? optionId(highlighted) : undefined}
                autoComplete="off"
                spellCheck={false}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-indigo-500 font-mono"
              />
            </div>
          </div>

          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Repository branches"
            className="max-h-64 overflow-y-auto py-1"
          >
            {options.map((branch, index) => {
              const isActive = index === highlighted;
              const isSelected = branch.name === value.trim();
              const pushed = formatPushed(branch.pushedAt);
              const meta = [branch.isDefault ? 'Default branch' : '', branch.protected ? 'Protected' : '', pushed ? `Pushed ${pushed}` : '']
                .filter(Boolean)
                .join(' · ');
              return (
                <li
                  key={branch.name}
                  id={optionId(index)}
                  data-index={index}
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(branch)}
                  className={`mx-1 px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center gap-2 ${
                    isActive ? 'bg-indigo-50' : ''
                  }`}
                >
                  {branch.isDefault ? (
                    <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-label="Default branch" />
                  ) : (
                    <GitBranch className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-label="Branch" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs text-slate-900">{branch.name}</span>
                    {meta && <span className="block truncate text-[10px] text-slate-500">{meta}</span>}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                </li>
              );
            })}

            {options.length === 0 && (
              <li role="presentation" className="px-3 py-4 text-center text-xs text-slate-500">
                {isInitialLoad
                  ? 'Loading branches…'
                  : error
                    ? error
                    : branches.length === 0
                      ? emptyHint
                      : `No branches match “${query.trim()}”. Use “Enter manually” for a branch that is not listed.`}
              </li>
            )}

            {hiddenMatches > 0 && (
              <li role="presentation" className="px-3 py-2 text-center text-[11px] text-slate-400">
                {hiddenMatches} more — keep typing to narrow the list.
              </li>
            )}
          </ul>

          <div className="px-3 py-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <span className="truncate">
              {error && branches.length > 0
                ? error
                : `${branches.length}${truncated ? '+' : ''} ${branches.length === 1 ? 'branch' : 'branches'}`}
            </span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium shrink-0 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
