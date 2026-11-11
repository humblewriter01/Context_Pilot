import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, CornerDownLeft, Globe, Lock, RefreshCw, Search } from 'lucide-react';
import { GitHubRepoSummary, normalizeRepoFullName } from '../services/github';

interface RepoPickerProps {
  /** Id of the trigger button, so a `<label htmlFor>` can point at the picker. */
  id?: string;
  repos: GitHubRepoSummary[];
  /** Selected `owner/repo`. May name a repository that is not part of `repos`. */
  value: string;
  onSelect: (repo: GitHubRepoSummary) => void;
  /** The visitor typed an `owner/repo` that is not in their own list. */
  onUseCustom: (fullName: string) => void;
  onRefresh: () => void;
  loading: boolean;
  error: string | null;
  /** True when the account has more repositories than were loaded. */
  truncated: boolean;
  disabled?: boolean;
}

type PickerOption =
  | { kind: 'repo'; repo: GitHubRepoSummary }
  | { kind: 'custom'; fullName: string };

/** Keeps the list snappy for accounts with hundreds of repositories. */
const MAX_VISIBLE_OPTIONS = 100;

function formatUpdated(iso: string): string {
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
 * Searchable repository dropdown (combobox) backed by the connected GitHub
 * account. Typing an `owner/repo` that is not in the list offers it as a
 * one-off public repository, so the search box doubles as manual entry.
 */
export const RepoPicker: React.FC<RepoPickerProps> = ({
  id,
  repos,
  value,
  onSelect,
  onUseCustom,
  onRefresh,
  loading,
  error,
  truncated,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selectedRepo = useMemo(
    () => repos.find((repo) => repo.fullName.toLowerCase() === value.trim().toLowerCase()) || null,
    [repos, value]
  );

  const matches = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return repos;
    return repos.filter((repo) => {
      const haystack = `${repo.fullName} ${repo.description} ${repo.language}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [repos, query]);

  const customFullName = useMemo(() => {
    const candidate = normalizeRepoFullName(query);
    if (!candidate) return '';
    const alreadyListed = repos.some((repo) => repo.fullName.toLowerCase() === candidate.toLowerCase());
    return alreadyListed ? '' : candidate;
  }, [repos, query]);

  const options = useMemo<PickerOption[]>(() => {
    const visible: PickerOption[] = matches
      .slice(0, MAX_VISIBLE_OPTIONS)
      .map((repo) => ({ kind: 'repo', repo }));
    if (customFullName) visible.push({ kind: 'custom', fullName: customFullName });
    return visible;
  }, [matches, customFullName]);

  const hiddenMatches = Math.max(0, matches.length - MAX_VISIBLE_OPTIONS);
  const optionId = (index: number) => `${listId}-option-${index}`;
  // The list can shrink underneath the highlight (typing, refresh): stay in range.
  const highlighted = Math.min(activeIndex, Math.max(0, options.length - 1));

  const close = (returnFocus: boolean) => {
    setOpen(false);
    setQuery('');
    if (returnFocus) triggerRef.current?.focus();
  };

  const choose = (option: PickerOption | undefined) => {
    if (!option) return;
    if (option.kind === 'repo') onSelect(option.repo);
    else onUseCustom(option.fullName);
    close(true);
  };

  // Opening: start on the current selection and move focus into the search box.
  useEffect(() => {
    if (!open) return;
    const selectedIndex = options.findIndex(
      (option) => option.kind === 'repo' && option.repo.fullName === selectedRepo?.fullName
    );
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    searchRef.current?.focus();
    // Runs only when the dropdown opens; later moves come from typing and arrow keys.
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

  const isInitialLoad = loading && repos.length === 0;
  const triggerLabel = value.trim() || (isInitialLoad ? 'Loading your repositories…' : 'Select a repository');

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
        aria-label="Repository"
        disabled={disabled}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={handleTriggerKeyDown}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white flex items-center justify-between gap-2 text-left hover:border-slate-400 focus:outline-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span className="flex items-center gap-2 min-w-0">
          {selectedRepo?.isPrivate ? (
            <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          ) : (
            <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
          <span className={`truncate font-mono ${value.trim() ? 'text-slate-900' : 'text-slate-400'}`}>
            {triggerLabel}
          </span>
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
                placeholder="Search, or type owner/repo…"
                aria-label="Search repositories"
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
            aria-label="Your GitHub repositories"
            className="max-h-64 overflow-y-auto py-1"
          >
            {options.map((option, index) => {
              const isActive = index === highlighted;
              if (option.kind === 'custom') {
                return (
                  <li
                    key={`custom-${option.fullName}`}
                    id={optionId(index)}
                    data-index={index}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                    className={`mx-1 px-2.5 py-2 rounded-lg cursor-pointer flex items-center gap-2 text-xs border-t border-dashed border-slate-200 ${
                      isActive ? 'bg-indigo-50 text-indigo-900' : 'text-slate-700'
                    }`}
                  >
                    <CornerDownLeft className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span className="min-w-0">
                      Use public repository{' '}
                      <span className="font-mono font-semibold break-all">{option.fullName}</span>
                    </span>
                  </li>
                );
              }

              const { repo } = option;
              const isSelected = repo.fullName === selectedRepo?.fullName;
              const updated = formatUpdated(repo.updatedAt);
              return (
                <li
                  key={repo.fullName}
                  id={optionId(index)}
                  data-index={index}
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                  className={`mx-1 px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center gap-2 ${
                    isActive ? 'bg-indigo-50' : ''
                  }`}
                >
                  {repo.isPrivate ? (
                    <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-label="Private repository" />
                  ) : (
                    <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-label="Public repository" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs text-slate-900">{repo.fullName}</span>
                    <span className="block truncate text-[10px] text-slate-500">
                      {[repo.language, repo.archived ? 'Archived' : '', updated ? `Updated ${updated}` : '']
                        .filter(Boolean)
                        .join(' · ') || repo.defaultBranch}
                    </span>
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                </li>
              );
            })}

            {options.length === 0 && (
              <li role="presentation" className="px-3 py-4 text-center text-xs text-slate-500">
                {isInitialLoad
                  ? 'Loading your repositories…'
                  : error
                  ? error
                  : repos.length === 0
                  ? 'No repositories were found for this account. Type owner/repo to use a public one.'
                  : `No repositories match “${query.trim()}”. Type owner/repo to use a public one.`}
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
              {error && repos.length > 0
                ? error
                : `${repos.length}${truncated ? '+' : ''} ${repos.length === 1 ? 'repository' : 'repositories'}`}
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
