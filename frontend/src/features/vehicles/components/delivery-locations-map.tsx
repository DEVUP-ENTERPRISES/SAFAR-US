'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { MAPBOX_TOKEN } from '@/features/maps/api';
import { loadMapbox } from '@/features/maps/mapbox-loader';
import type { DeliveryLocation } from '@/features/vehicles/types';

/* Mapbox GL types aren't installed (CDN load), so only the shapes used here
   are declared — same approach as MapboxPanel. */
type LngLat = [number, number];
interface MbMap {
  remove(): void;
  fitBounds(b: unknown, opts?: unknown): void;
  addControl(c: unknown, pos?: string): void;
}
interface MbMarker {
  setLngLat(c: LngLat): MbMarker;
  addTo(m: MbMap): MbMarker;
  remove(): void;
}
interface MbNamespace {
  accessToken: string;
  Map: new (opts: Record<string, unknown>) => MbMap;
  Marker: new (opts?: { element?: HTMLElement }) => MbMarker;
  LngLatBounds: new () => { extend(c: LngLat): void };
  NavigationControl: new (opts?: Record<string, unknown>) => unknown;
}

const PIN_GLYPH: Record<DeliveryLocation['kind'] | 'home', string> = {
  // Inline SVG paths rather than React icons: markers are raw DOM elements
  // handed to Mapbox, outside React's tree.
  airport: 'M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.5.5 0 0 0-.5.8l3.2 4-2 2-2.2-.6a.5.5 0 0 0-.5.8L5 16l1.8 2.3a.5.5 0 0 0 .8-.5L7 15.6l2-2 4 3.2a.5.5 0 0 0 .8-.5Z',
  hotel: 'M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8M2 16h20M6 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4',
  business: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01',
  custom: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  home: 'M5 11v9h14v-9M3 11l9-7 9 7M9 20v-5h6v5',
};

function makePin(kind: DeliveryLocation['kind'] | 'home', highlight: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = [
    'flex h-9 w-9 items-center justify-center rounded-full border-2 shadow-lg',
    highlight
      ? 'bg-[var(--primary)] border-white text-white'
      : 'bg-white border-[var(--primary)] text-[var(--primary)]',
  ].join(' ');
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="${PIN_GLYPH[kind]}"/></svg>`;
  return el;
}

/**
 * The host's delivery map: their home location plus every delivery location
 * they offer, so the coverage they've built is legible at a glance instead of
 * being inferable only by reading a list of addresses.
 *
 * Degrades to nothing when Mapbox isn't configured — a missing map must never
 * be what stops a host editing their delivery setup.
 */
export function DeliveryLocationsMap({
  home,
  locations,
  className,
}: {
  home?: { lat: number; lng: number };
  locations: DeliveryLocation[];
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  const pinned = locations.filter((l) => l.lat !== undefined && l.lng !== undefined);
  // Re-running the effect on every array identity would tear the map down on
  // each keystroke in the editor; the coordinates are what actually matter.
  const key = JSON.stringify([home, pinned.map((l) => [l.id, l.lat, l.lng, l.kind])]);

  useEffect(() => {
    if (!MAPBOX_TOKEN || (!home && !pinned.length)) {
      setFailed(true);
      return;
    }
    let map: MbMap | null = null;
    let cancelled = false;
    const markers: MbMarker[] = [];

    loadMapbox()
      .then(() => {
        if (cancelled || !ref.current) return;
        const mb = (window as unknown as { mapboxgl: MbNamespace }).mapboxgl;
        mb.accessToken = MAPBOX_TOKEN;
        const center: LngLat = home
          ? [home.lng, home.lat]
          : [pinned[0].lng as number, pinned[0].lat as number];

        map = new mb.Map({
          container: ref.current,
          style: 'mapbox://styles/mapbox/dark-v11',
          center,
          zoom: 9,
          attributionControl: false,
        });
        map.addControl(new mb.NavigationControl({ showCompass: false }), 'top-right');

        const bounds = new mb.LngLatBounds();
        if (home) {
          markers.push(new mb.Marker({ element: makePin('home', false) }).setLngLat(center).addTo(map));
          bounds.extend(center);
        }
        for (const l of pinned) {
          const c: LngLat = [l.lng as number, l.lat as number];
          markers.push(new mb.Marker({ element: makePin(l.kind, true) }).setLngLat(c).addTo(map));
          bounds.extend(c);
        }
        if (pinned.length + (home ? 1 : 0) > 1) {
          map.fitBounds(bounds, { padding: 64, maxZoom: 12, duration: 0 });
        }
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (failed) {
    return (
      <div className={`flex items-center justify-center gap-2 rounded-2xl border border-border bg-muted/30 py-8 text-sm text-muted-foreground ${className ?? ''}`}>
        <MapPin className="h-4 w-4" /> Add a location to see it on the map
      </div>
    );
  }

  return <div ref={ref} className={`overflow-hidden rounded-2xl border border-border ${className ?? ''}`} />;
}
