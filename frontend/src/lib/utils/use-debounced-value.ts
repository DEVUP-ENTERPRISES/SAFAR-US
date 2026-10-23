'use client';

import { useEffect, useState } from 'react';

/** The value, once it has stopped changing for `ms` — so a search box sends one request, not one per key. */
export function useDebouncedValue<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}
