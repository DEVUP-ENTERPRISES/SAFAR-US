'use client';

import { create } from 'zustand';

const MAX = 3;

interface CompareState {
  ids: string[];
  toggle: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  has: (id: string) => boolean;
}

const KEY = 'cato.compare';

/**
 * localStorage access that cannot take the app down with it.
 *
 * The read ran unguarded at module scope, inside the store initialiser. Three
 * ways that throws — corrupt JSON, a browser with storage disabled, Safari in
 * private mode — and because AppChrome mounts the compare tray on every
 * consumer page, any of them white-screened the entire marketplace rather than
 * losing a three-item tray. recently-viewed.ts already guards its own access
 * this way; this brings the two in line.
 *
 * The shape is checked as well as the parse: a stale or hand-edited value like
 * `{"a":1}` parses fine, and would then crash on the first .includes call.
 */
function read(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX);
  } catch {
    return [];
  }
}

/** Persisting is a convenience; failing to persist must not break the click. */
function write(ids: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* storage full or unavailable — the tray still works for this session */
  }
}

/** Compare tray — up to 3 vehicles, persisted to localStorage. */
export const useCompareStore = create<CompareState>((set, get) => ({
  ids: read(),
  toggle: (id) => {
    const cur = get().ids;
    let next: string[];
    if (cur.includes(id)) next = cur.filter((x) => x !== id);
    else if (cur.length >= MAX) next = [...cur.slice(1), id];
    else next = [...cur, id];
    write(next);
    set({ ids: next });
  },
  remove: (id) => {
    const next = get().ids.filter((x) => x !== id);
    write(next);
    set({ ids: next });
  },
  clear: () => {
    write([]);
    set({ ids: [] });
  },
  has: (id) => get().ids.includes(id),
}));
