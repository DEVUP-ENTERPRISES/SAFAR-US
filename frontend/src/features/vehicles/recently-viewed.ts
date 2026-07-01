'use client';

import { useEffect, useState, useCallback } from 'react';

const KEY = 'kiedo.recentlyViewed';
const MAX = 12;

/** Client-side recently-viewed vehicle ids (privacy-friendly, no backend). */
export function useRecentlyViewed() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setIds(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
  }, []);

  const track = useCallback((id: string) => {
    try {
      const raw = localStorage.getItem(KEY);
      const current = raw ? (JSON.parse(raw) as string[]) : [];
      const next = [id, ...current.filter((x) => x !== id)].slice(0, MAX);
      localStorage.setItem(KEY, JSON.stringify(next));
      setIds(next);
    } catch {
      /* ignore */
    }
  }, []);

  return { ids, track };
}
