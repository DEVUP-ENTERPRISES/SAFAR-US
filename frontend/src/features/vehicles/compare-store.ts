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

/** Compare tray — up to 3 vehicles, persisted to localStorage. */
export const useCompareStore = create<CompareState>((set, get) => ({
  ids: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('cato.compare') ?? '[]') : [],
  toggle: (id) => {
    const cur = get().ids;
    let next: string[];
    if (cur.includes(id)) next = cur.filter((x) => x !== id);
    else if (cur.length >= MAX) next = [...cur.slice(1), id];
    else next = [...cur, id];
    localStorage.setItem('cato.compare', JSON.stringify(next));
    set({ ids: next });
  },
  remove: (id) => {
    const next = get().ids.filter((x) => x !== id);
    localStorage.setItem('cato.compare', JSON.stringify(next));
    set({ ids: next });
  },
  clear: () => {
    localStorage.setItem('cato.compare', '[]');
    set({ ids: [] });
  },
  has: (id) => get().ids.includes(id),
}));
