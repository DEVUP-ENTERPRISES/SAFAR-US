'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { mapsApi } from '../api';

/** Location autocomplete backed by /maps/autocomplete (Google when configured). */
export function LocationSearch({ onPick, placeholder = 'Search a city or place' }: {
  onPick: (loc: { lat: number; lng: number; label: string }) => void;
  placeholder?: string;
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
    if (geo) onPick({ lat: geo.lat, lng: geo.lng, label: geo.formatted });
  };

  return (
    <div ref={ref} className="relative flex-1">
      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3">
        <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="border-0 px-0 focus-visible:ring-0"
        />
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
      {open && suggestions.data && suggestions.data.length > 0 && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lift">
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
