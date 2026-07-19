'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, AlertTriangle } from 'lucide-react';
import { GOOGLE_MAPS_KEY } from '../api';
import { loadGoogleMaps } from '../loader';
import type { Vehicle } from '@/features/vehicles/types';

/* Minimal shapes for the bits of the Maps API we touch — avoids pulling in the
   whole @types/google.maps package for a handful of call sites. */
type GMap = { setCenter: (p: { lat: number; lng: number }) => void; fitBounds: (b: unknown) => void };
type GMarker = { setMap: (m: GMap | null) => void; addListener: (e: string, cb: () => void) => void };
interface GNamespace {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
    Marker: new (opts: Record<string, unknown>) => GMarker;
    LatLngBounds: new () => { extend: (p: { lat: number; lng: number }) => void };
    Size: new (w: number, h: number) => unknown;
    Point: new (x: number, y: number) => unknown;
  };
}

const pinWidth = (price: string) => Math.max(46, 22 + price.length * 9);

/** A price pin drawn as an inline SVG data URI — no image assets to ship. */
function pinIcon(price: string, active: boolean): string {
  const w = pinWidth(price);
  const bg = active ? '#111827' : '#ffffff';
  const fg = active ? '#ffffff' : '#111827';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="40">
    <rect x="1" y="1" rx="12" width="${w - 2}" height="26" fill="${bg}" stroke="#111827" stroke-width="1.5"/>
    <path d="M${w / 2 - 5} 25 L${w / 2} 34 L${w / 2 + 5} 25 Z" fill="${bg}" stroke="${bg}"/>
    <text x="${w / 2}" y="19" font-family="system-ui,-apple-system,sans-serif" font-size="13"
      font-weight="700" fill="${fg}" text-anchor="middle">${price}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/**
 * The search map: one clickable price pin per car, kept in sync with results.
 *
 * This replaced an Embed-API <iframe>. An embed can render a map but cannot
 * draw markers on it — so the map had no idea which cars were for sale. On a
 * rental marketplace the pins *are* the product; a map without them is a
 * decorative panel taking up half the screen.
 */
export function MapPanel({
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
  const mapRef = useRef<GMap | null>(null);
  const markersRef = useRef<GMarker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  // Boot the map once. Re-creating it on prop changes would reset the user's zoom.
  useEffect(() => {
    if (!GOOGLE_MAPS_KEY || !ref.current) return;
    let cancelled = false;

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !ref.current) return;
        const g = (window as unknown as { google: GNamespace }).google;
        mapRef.current = new g.maps.Map(ref.current, {
          center: { lat, lng },
          zoom: 12,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });
      })
      .catch((e: Error) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recentre when the search area changes.
  useEffect(() => {
    mapRef.current?.setCenter({ lat, lng });
  }, [lat, lng]);

  // Redraw pins whenever results (or the active pin) change.
  useEffect(() => {
    const g = (window as unknown as { google?: GNamespace }).google;
    if (!g?.maps || !mapRef.current) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const withCoords = vehicles.filter((v) => v.location?.coordinates?.length === 2);
    if (withCoords.length === 0) return;

    const bounds = new g.maps.LatLngBounds();

    for (const v of withCoords) {
      const [vlng, vlat] = v.location.coordinates as [number, number];
      const price = `$${Math.round(v.pricing.dailyPrice / 100)}`;
      const isActive = active === v._id;
      const w = pinWidth(price);

      const marker = new g.maps.Marker({
        position: { lat: vlat, lng: vlng },
        map: mapRef.current,
        title: `${v.make} ${v.model}`,
        zIndex: isActive ? 999 : 1,
        icon: {
          url: pinIcon(price, isActive),
          scaledSize: new g.maps.Size(w, 40),
          anchor: new g.maps.Point(w / 2, 34),
        },
      });

      marker.addListener('click', () => {
        setActive(v._id);
        router.push(`/vehicles/${v._id}`);
      });

      markersRef.current.push(marker);
      bounds.extend({ lat: vlat, lng: vlng });
    }

    if (withCoords.length > 1) mapRef.current.fitBounds(bounds);
  }, [vehicles, active, router]);

  // ── No key, or the API failed to load: keep the layout, explain why. ──
  if (!GOOGLE_MAPS_KEY || error) {
    return (
      <div
        className="sticky top-24 flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-accent p-6 text-center"
        style={{ height: '75vh' }}
      >
        {error ? (
          <AlertTriangle className="h-10 w-10 text-destructive" />
        ) : (
          <MapPin className="h-10 w-10 text-primary" />
        )}
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">{count} cars in this area</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {error ? `Map unavailable: ${error}` : 'Add a Google Maps key to see cars on the map.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="sticky top-24 overflow-hidden rounded-2xl border border-border shadow-soft"
      style={{ height: '75vh' }}
    >
      <div ref={ref} className="h-full w-full" />
    </div>
  );
}
