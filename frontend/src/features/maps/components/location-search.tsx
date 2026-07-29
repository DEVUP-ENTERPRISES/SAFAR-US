'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Search } from 'lucide-react';
import { mapsApi } from '../api';

/** Location autocomplete backed by /maps/autocomplete (Google when configured). */
export function LocationSearch({ onPick, placeholder = 'Search a city or place', bare = false }: {
  onPick: (loc: { lat: number; lng: number; label: string; city: string }) => void;
  placeholder?: string;
  /** Borderless, no magnifier — blends into a segmented bar (e.g. the navbar). */
  bare?: boolean;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const suggestions = useQuery({
    queryKey: ['ac', q],
    queryFn: () => mapsApi.autocomplete(q),
    enabled: q.length >= 2,
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const pick = async (description: string) => {
    setQ(description);
    setOpen(false);
    const [geo] = await mapsApi.geocode(description);
    if (geo) onPick({ lat: geo.lat, lng: geo.lng, label: geo.formatted, city: geo.city });
  };

  return (
    <div ref={ref} className="relative flex-1">
      {bare ? (
        <div className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="w-full min-w-0 border-0 bg-transparent text-sm font-medium focus:outline-none placeholder:font-normal placeholder:text-muted-foreground"
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card px-4 h-11 focus-within:border-foreground focus-within:ring-1 focus-within:ring-foreground transition-all hover:border-border">
          <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="flex-1 border-0 bg-transparent px-2 text-sm focus:outline-none placeholder:text-muted-foreground"
          />
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
        </div>
      )}
      {open && suggestions.data && suggestions.data.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lift">
          {suggestions.data.map((s, i) => (
            <button key={i} onClick={() => pick(s.description)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent">
              <MapPin className="h-4 w-4 text-muted-foreground" /> {s.description}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
