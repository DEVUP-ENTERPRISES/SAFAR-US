'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import type { Vehicle } from '@/features/vehicles/types';
import { MAPBOX_TOKEN } from '@/features/maps/api';
import { loadMapbox } from '@/features/maps/mapbox-loader';

/* Mapbox GL types aren't installed (loaded from CDN), so the handful of shapes
   we touch are declared narrowly rather than pulling in @types/mapbox-gl. */
type LngLat = [number, number];
interface MbMap {
  setCenter(c: LngLat): void;
  fitBounds(b: unknown, opts?: unknown): void;
  remove(): void;
  addControl(c: unknown, pos?: string): void;
}
interface MbMarker {
  setLngLat(c: LngLat): MbMarker;
  addTo(m: MbMap): MbMarker;
  remove(): void;
  getElement(): HTMLElement;
}
interface MbNamespace {
  accessToken: string;
  Map: new (opts: Record<string, unknown>) => MbMap;
  Marker: new (opts?: { element?: HTMLElement }) => MbMarker;
  LngLatBounds: new () => { extend(c: LngLat): void };
  NavigationControl: new (opts?: Record<string, unknown>) => unknown;
}

/**
 * The results map on Mapbox GL. Mirrors MapPanel's Google behaviour — recentre
 * on search, price pins that navigate to the car, fit-to-results — so the two
 * are interchangeable and the provider choice is invisible upstream.
 */
export function MapboxPanel({
  lat,
  lng,
  label,
  count,
  vehicles = [],
}: {
  lat: number;
  lng: number;
  label: string;
  count: number;
  vehicles?: Vehicle[];
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MbMap | null>(null);
  const markersRef = useRef<MbMarker[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Boot once; recreating on prop changes would reset the user's pan/zoom.
  useEffect(() => {
    if (!MAPBOX_TOKEN || !ref.current) return;
    let cancelled = false;

    loadMapbox()
      .then(() => {
        if (cancelled || !ref.current) return;
        const mb = (window as unknown as { mapboxgl: MbNamespace }).mapboxgl;
        mb.accessToken = MAPBOX_TOKEN;
        const map = new mb.Map({
          container: ref.current,
          center: [lng, lat] as LngLat,
          zoom: 11,
          style: 'mapbox://styles/mapbox/streets-v12',
          attributionControl: true,
        });
        map.addControl(new mb.NavigationControl({ showCompass: false }), 'top-right');
        mapRef.current = map;
      })
      .catch((e: Error) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.setCenter([lng, lat]);
  }, [lat, lng]);

  // Redraw pins on results change.
  useEffect(() => {
    const mb = (window as unknown as { mapboxgl?: MbNamespace }).mapboxgl;
    const map = mapRef.current;
    if (!mb || !map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const withCoords = vehicles.filter((v) => v.location?.coordinates?.length === 2);
    if (withCoords.length === 0) return;

    const bounds = new mb.LngLatBounds();
    for (const v of withCoords) {
      const [vlng, vlat] = v.location.coordinates as LngLat;
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = `$${Math.round(v.pricing.dailyPrice / 100)}`;
      el.className =
        'rounded-full border border-white bg-foreground px-2 py-0.5 text-xs font-bold text-background shadow-md transition-transform hover:scale-110';
      el.setAttribute('aria-label', `${v.make} ${v.model}`);
      el.addEventListener('click', () => router.push(`/vehicles/${v._id}`));

      const marker = new mb.Marker({ element: el }).setLngLat([vlng, vlat]).addTo(map);
      markersRef.current.push(marker);
      bounds.extend([vlng, vlat]);
    }
    if (withCoords.length > 1) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
    }
  }, [vehicles, router]);

  if (!MAPBOX_TOKEN || error) {
    return (
      <div
        className="sticky top-24 flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-accent p-6 text-center"
        style={{ height: '75vh' }}
      >
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">{count} cars in this area</p>
          <p className="mt-2 text-xs text-muted-foreground">Map unavailable: {error ?? 'no token'}</p>
        </div>
      </div>
    );
  }

  return <div ref={ref} className="sticky top-24 overflow-hidden rounded-2xl border border-border" style={{ height: '75vh' }} />;
}
