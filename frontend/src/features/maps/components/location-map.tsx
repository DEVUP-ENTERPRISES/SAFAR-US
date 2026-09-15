'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { MAPBOX_TOKEN } from '@/features/maps/api';
import { loadMapbox } from '@/features/maps/mapbox-loader';

interface MbMap { remove: () => void }
interface MbMarker { setLngLat: (c: [number, number]) => MbMarker; addTo: (m: MbMap) => MbMarker }
interface MbNamespace {
  accessToken: string;
  Map: new (opts: Record<string, unknown>) => MbMap;
  Marker: new (opts?: Record<string, unknown>) => MbMarker;
  NavigationControl: new () => unknown;
}

/**
 * A single-pin location map — for a contact/office page, not a search
 * results grid. Deliberately standalone rather than reusing MapboxPanel,
 * which is built around plotting many vehicles with price pills.
 *
 * Degrades to a plain address card when no Mapbox token is configured, same
 * pattern as every other optional-provider surface in the app — a missing
 * map must never be a broken page.
 */
export function LocationMap({
  lat,
  lng,
  label,
  zoom = 10,
  className,
}: {
  lat: number;
  lng: number;
  label: string;
  zoom?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!MAPBOX_TOKEN) {
      setError('no token configured');
      return;
    }
    let map: MbMap | null = null;
    let cancelled = false;

    loadMapbox()
      .then(() => {
        if (cancelled || !ref.current) return;
        const mb = (window as unknown as { mapboxgl: MbNamespace }).mapboxgl;
        mb.accessToken = MAPBOX_TOKEN;
        map = new mb.Map({
          container: ref.current,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: [lng, lat],
          zoom,
          attributionControl: false,
        });
        new mb.Marker({ color: '#1f8f8a' }).setLngLat([lng, lat]).addTo(map);
      })
      .catch((err: Error) => setError(err.message));

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lng, zoom]);

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 rounded-3xl border border-border bg-muted/30 p-10 text-center ${className ?? ''}`}>
        <MapPin className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">Map unavailable: {error}</p>
      </div>
    );
  }

  return <div ref={ref} className={`overflow-hidden rounded-3xl border border-border ${className ?? ''}`} />;
}
