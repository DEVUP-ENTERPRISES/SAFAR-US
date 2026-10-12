import { create } from 'zustand';
import { toggleCompare } from '@catodrive/core/web/features/vehicles/compare';

/** The compare tray: up to three cars, kept while the app runs. */
export const useCompareStore = create<{ ids: string[]; toggle: (id: string) => void; remove: (id: string) => void; clear: () => void }>((set) => ({
  ids: [],
  toggle: (id) => set((s) => ({ ids: toggleCompare(s.ids, id) })),
  remove: (id) => set((s) => ({ ids: s.ids.filter((x) => x !== id) })),
  clear: () => set({ ids: [] }),
}));
