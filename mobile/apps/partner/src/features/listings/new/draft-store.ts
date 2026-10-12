import { create } from 'zustand';
import { INITIAL_LISTING_DRAFT, type ListingDraft } from '@catodrive/core/web/features/vehicles/new-listing';

/** The wizard's draft and step, kept while the app runs so leaving the screen never loses the work. */
export const useListingDraft = create<{
  draft: ListingDraft;
  step: number;
  set: <K extends keyof ListingDraft>(k: K, v: ListingDraft[K]) => void;
  patch: (fn: (d: ListingDraft) => ListingDraft) => void;
  goTo: (step: number) => void;
  reset: () => void;
}>((set) => ({
  draft: INITIAL_LISTING_DRAFT,
  step: 0,
  set: (k, v) => set((s) => ({ draft: { ...s.draft, [k]: v } })),
  patch: (fn) => set((s) => ({ draft: fn(s.draft) })),
  goTo: (step) => set({ step }),
  reset: () => set({ draft: INITIAL_LISTING_DRAFT, step: 0 }),
}));
