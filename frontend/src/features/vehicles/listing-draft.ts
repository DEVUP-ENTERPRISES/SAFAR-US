'use client';

const KEY = 'cato.listing-draft.v1';

/**
 * The listing wizard survives a refresh, a back button, and a closed tab.
 *
 * Seven steps of typing and four photo uploads is too much work to lose to a
 * stray reload, and a host who loses it once does not start again. Saved on
 * every change, restored on mount, cleared only when the listing is actually
 * created.
 */
export function saveListingDraft<T>(draft: T, step: number): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ draft, step, at: Date.now() }));
  } catch {
    // Private mode / quota — the wizard still works, it just won't survive.
  }
}

export function readListingDraft<T>(): { draft: T; step: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { draft: T; step: number; at: number };
    // A month-old abandoned draft is noise, not a rescue.
    if (Date.now() - parsed.at > 30 * 24 * 60 * 60 * 1000) {
      clearListingDraft();
      return null;
    }
    return { draft: parsed.draft, step: parsed.step };
  } catch {
    return null;
  }
}

export function clearListingDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
