'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { MAPBOX_TOKEN } from '@/features/maps/api';
import { loadMapbox } from '@/features/maps/mapbox-loader';
import { connectSocket } from '@/lib/realtime/socket';

/* Mapbox GL is loaded from the CDN, so only the shapes we touch are typed. */
type LngLat = [number, number];
interface MbMap {
  setCenter(c: LngLat): void;
  easeTo(opts: { center: LngLat; duration?: number }): void;
  remove(): void;
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
  NavigationControl: new (opts?: Record<string, unknown>) => unknown;
}

/**
 * The live location of a car on a trip, on a real Mapbox map. The guest's app
 * streams its position (see the guest trip screen); this renders wherever the
 * trip is watched — the guest's own screen and the host's — updating the marker
 * as fresh coordinates arrive over the socket. Falls back to a labelled panel
 * when no map token is configured so the screen is never broken.
 */
export function TripLiveMap({
  tripId,
  initial,
  height = '16rem',
}: {
  tripId: string;
  /** Last known position, if the trip already has one. */
  initial?: { lng: number; lat: number; updatedAt?: string } | null;
  height?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MbMap | null>(null);
  const markerRef = useRef<MbMarker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fix, setFix] = useState<{ lng: number; lat: number; updatedAt?: string } | null>(
    initial ?? null,
  );

  // Live updates over the socket — the same event the trip hook listens to.
  useEffect(() => {
    if (!tripId) return;
    const socket = connectSocket();
    socket.emit('trip:join', tripId, () => undefined);
    const onLocation = (loc: { tripId: string; lng: number; lat: number; at?: string }) => {
      if (loc.tripId !== tripId) return;
      setFix({ lng: loc.lng, lat: loc.lat, updatedAt: loc.at });
    };
    socket.on('trip:location', onLocation);
    return () => {
      socket.off('trip:location', onLocation);
    };
  }, [tripId]);

  // Boot the map once.
  useEffect(() => {
    if (!MAPBOX_TOKEN || !ref.current) return;
    let cancelled = false;
    const center: LngLat = fix ? [fix.lng, fix.lat] : [-98.5795, 39.8283]; // US centroid until a fix

    loadMapbox()
      .then(() => {
        if (cancelled || !ref.current) return;
        const mb = (window as unknown as { mapboxgl: MbNamespace }).mapboxgl;
        mb.accessToken = MAPBOX_TOKEN;
        const map = new mb.Map({
          container: ref.current,
          center,
          zoom: fix ? 13 : 3,
          style: 'mapbox://styles/mapbox/streets-v12',
          attributionControl: true,
        });
        map.addControl(new mb.NavigationControl({ showCompass: false }), 'top-right');
        mapRef.current = map;
        if (fix) placeMarker(mb, map, [fix.lng, fix.lat]);
      })
      .catch((e: Error) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
      markerRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move the marker + recentre when a new fix arrives.
  useEffect(() => {
    const mb = (window as unknown as { mapboxgl?: MbNamespace }).mapboxgl;
    const map = mapRef.current;
    if (!mb || !map || !fix) return;
    placeMarker(mb, map, [fix.lng, fix.lat]);
    map.easeTo({ center: [fix.lng, fix.lat], duration: 800 });
  }, [fix]);

  function placeMarker(mb: MbNamespace, map: MbMap, c: LngLat) {
    if (!markerRef.current) {
      const el = document.createElement('div');
      el.className =
        'flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-primary shadow-lg';
      el.innerHTML =
        '<span class="block h-2.5 w-2.5 rounded-full bg-white"></span>';
      markerRef.current = new mb.Marker({ element: el }).setLngLat(c).addTo(map);
    } else {
      markerRef.current.setLngLat(c);
    }
  }

  if (!MAPBOX_TOKEN || error) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-accent p-6 text-center"
        style={{ height }}
      >
        <MapPin className="h-8 w-8 text-primary" />
        <p className="text-sm text-muted-foreground">
          {fix
            ? `Last location ${fix.lng.toFixed(3)}, ${fix.lat.toFixed(3)}`
            : 'Waiting for live location…'}
        </p>
        {error && <p className="text-xs text-muted-foreground">Map unavailable: {error}</p>}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border" style={{ height }}>
      <div ref={ref} className="h-full w-full" />
      <div className="pointer-events-none absolute bottom-2 start-2 rounded-full bg-background/85 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur">
        {fix
          ? `Live · updated ${fix.updatedAt ? new Date(fix.updatedAt).toLocaleTimeString() : 'just now'}`
          : 'Waiting for live location…'}
      </div>
    </div>
  );
}
