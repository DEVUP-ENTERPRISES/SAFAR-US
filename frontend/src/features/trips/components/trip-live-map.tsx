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
  easeTo(opts: { center?: LngLat; zoom?: number; duration?: number }): void;
  fitBounds(b: unknown, opts?: unknown): void;
  remove(): void;
  addControl(c: unknown, pos?: string): void;
  addSource(id: string, s: unknown): void;
  addLayer(l: unknown): void;
  getSource(id: string): { setData(d: unknown): void } | undefined;
  on(type: string, cb: () => void): void;
  loaded(): boolean;
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
  Marker: new (opts?: { element?: HTMLElement; anchor?: string }) => MbMarker;
  LngLatBounds: new () => { extend(c: LngLat): void };
  NavigationControl: new (opts?: Record<string, unknown>) => unknown;
}

/**
 * The live map: the car, moving.
 *
 * Two details are what separate this from a dot that teleports, and both are
 * the reason ride-hailing maps feel alive:
 *
 *  1. GPS ARRIVES EVERY ~15 SECONDS. The marker does not. Each new fix starts
 *     an animation that walks the marker from where it is to where it now is,
 *     so the car glides continuously instead of jumping once a quarter minute.
 *  2. THE CAR POINTS WHERE IT IS GOING. Bearing is computed from the previous
 *     fix to the new one and the icon is rotated to match, which is what makes
 *     a shape read as a vehicle in motion rather than a sticker.
 *
 * During handover both parties broadcast, so positions are tracked per role and
 * rendered as two distinct markers — the car and the person meeting it. Without
 * the role on the event these would be one marker flicking between two people.
 */
export function TripLiveMap({
  bookingId,
  initial,
  destination,
  height = '16rem',
}: {
  bookingId: string;
  /** Last known car position, if the trip already has one. */
  initial?: { lng: number; lat: number; updatedAt?: string } | null;
  /** Where the handover happens, drawn as a pin. */
  destination?: { lat: number; lng: number; label?: string } | null;
  height?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MbMap | null>(null);
  const ready = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);

  // One animator per role, so the car and the person meeting it move
  // independently rather than fighting over a single marker.
  const cars = useRef<Record<string, MarkerAnimator>>({});

  useEffect(() => {
    if (!bookingId) return;
    const socket = connectSocket();
    socket.emit('booking:join', bookingId, () => undefined);

    const onLocation = (loc: { bookingId: string; role?: string; lng: number; lat: number; at?: string }) => {
      if (loc.bookingId !== bookingId) return;
      const role = loc.role ?? 'guest';
      const mb = (window as unknown as { mapboxgl?: MbNamespace }).mapboxgl;
      const map = mapRef.current;
      if (!mb || !map || !ready.current) return;

      if (!cars.current[role]) cars.current[role] = new MarkerAnimator(mb, map, role);
      cars.current[role].moveTo([loc.lng, loc.lat]);
      setSeen(true);

      // Follow the car, not the person meeting it.
      if (role === 'guest') map.easeTo({ center: [loc.lng, loc.lat], duration: 900 });
    };

    socket.on('trip:location', onLocation);
    return () => { socket.off('trip:location', onLocation); };
  }, [bookingId]);

  // Boot once. Recreating on prop changes would reset the viewer's pan.
  useEffect(() => {
    if (!MAPBOX_TOKEN || !ref.current) return;
    let cancelled = false;
    const start: LngLat = initial
      ? [initial.lng, initial.lat]
      : destination
        ? [destination.lng, destination.lat]
        : [-98.5795, 39.8283]; // US centroid until there is anything to show

    loadMapbox()
      .then(() => {
        if (cancelled || !ref.current) return;
        const mb = (window as unknown as { mapboxgl: MbNamespace }).mapboxgl;
        mb.accessToken = MAPBOX_TOKEN;
        const map = new mb.Map({
          container: ref.current,
          center: start,
          zoom: initial || destination ? 13 : 3,
          style: 'mapbox://styles/mapbox/streets-v12',
          attributionControl: true,
        });
        map.addControl(new mb.NavigationControl({ showCompass: false }), 'top-right');
        mapRef.current = map;

        map.on('load', () => {
          ready.current = true;
          if (destination) placePin(mb, map, [destination.lng, destination.lat]);
          if (initial) {
            cars.current.guest = new MarkerAnimator(mb, map, 'guest');
            cars.current.guest.moveTo([initial.lng, initial.lat], true);
            setSeen(true);
          }
          // Show both ends at once when we know both.
          if (initial && destination) {
            const b = new mb.LngLatBounds();
            b.extend([initial.lng, initial.lat]);
            b.extend([destination.lng, destination.lat]);
            map.fitBounds(b, { padding: 70, maxZoom: 14, duration: 0 });
          }
        });
      })
      .catch((e: Error) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
      Object.values(cars.current).forEach((c) => c.destroy());
      cars.current = {};
      ready.current = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!MAPBOX_TOKEN || error) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-accent p-6 text-center"
        style={{ height }}
      >
        <MapPin className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{error ? `Map unavailable: ${error}` : 'Map not configured'}</p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border" style={{ height }}>
      <div ref={ref} className="h-full w-full" />
      {!seen && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
          <p className="text-xs font-medium text-white">Waiting for a location…</p>
        </div>
      )}
    </div>
  );
}

/** Top-down car silhouette, so a rotated shape reads as a vehicle. */
const CAR_SVG = `
<svg viewBox="0 0 24 24" width="26" height="26" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 1.5c-1.5 0-2.3 1-2.7 2.3L8.5 7.2c-1 .3-1.6.8-1.9 1.6-.4 1-.5 2.6-.5 4.4s.1 3.4.5 4.4c.3.8.9 1.3 1.9 1.6l.8 3.4c.4 1.3 1.2 2.3 2.7 2.3s2.3-1 2.7-2.3l.8-3.4c1-.3 1.6-.8 1.9-1.6.4-1 .5-2.6.5-4.4s-.1-3.4-.5-4.4c-.3-.8-.9-1.3-1.9-1.6l-.8-3.4C14.3 2.5 13.5 1.5 12 1.5Z"
        fill="currentColor" stroke="white" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M9.5 9.5h5" stroke="white" stroke-width="1.2" stroke-linecap="round" opacity=".9"/>
</svg>`;

/**
 * Walks a marker between GPS fixes.
 *
 * A fix every fifteen seconds rendered directly is a marker that teleports.
 * This eases from the current position to the new one over a fixed duration and
 * turns the icon to face the direction of travel.
 */
class MarkerAnimator {
  private marker: MbMarker;
  private el: HTMLElement;
  private from: LngLat | null = null;
  private to: LngLat | null = null;
  private startedAt = 0;
  private raf = 0;
  private bearing = 0;
  private readonly duration = 1400;

  constructor(mb: MbNamespace, map: MbMap, role: string) {
    const wrap = document.createElement('div');
    const isCar = role === 'guest';
    wrap.className = 'grid place-items-center';
    wrap.style.willChange = 'transform';
    wrap.innerHTML = isCar
      ? `<div class="relative">
           <span class="absolute inset-0 -m-2 animate-ping rounded-full bg-teal-500/25"></span>
           <span class="relative block text-teal-600 drop-shadow">${CAR_SVG}</span>
         </div>`
      // The person meeting the car is deliberately a different shape, not just
      // a different colour — colour alone fails for a colour-blind viewer.
      : `<span class="block h-4 w-4 rounded-full border-2 border-white bg-slate-800 shadow-lg"></span>`;

    this.el = wrap;
    this.marker = new mb.Marker({ element: wrap, anchor: 'center' }).setLngLat([0, 0]).addTo(map);
  }

  moveTo(next: LngLat, instant = false) {
    if (instant || !this.to) {
      this.to = next;
      this.from = next;
      this.marker.setLngLat(next);
      return;
    }
    // Only turn when the car actually travelled; a jittery stationary fix
    // should not spin the icon.
    if (distance(this.to, next) > 4) this.bearing = bearingOf(this.to, next);
    this.from = this.to;
    this.to = next;
    this.startedAt = performance.now();
    cancelAnimationFrame(this.raf);
    this.tick();
  }

  private tick = () => {
    if (!this.from || !this.to) return;
    const t = Math.min(1, (performance.now() - this.startedAt) / this.duration);
    // Ease-out: fast off the mark, settling into the new fix.
    const e = 1 - (1 - t) ** 3;
    const lng = this.from[0] + (this.to[0] - this.from[0]) * e;
    const lat = this.from[1] + (this.to[1] - this.from[1]) * e;
    this.marker.setLngLat([lng, lat]);
    const inner = this.el.firstElementChild as HTMLElement | null;
    if (inner) inner.style.transform = `rotate(${this.bearing}deg)`;
    if (t < 1) this.raf = requestAnimationFrame(this.tick);
  };

  destroy() {
    cancelAnimationFrame(this.raf);
    this.marker.remove();
  }
}

function placePin(mb: MbNamespace, map: MbMap, c: LngLat) {
  const el = document.createElement('div');
  el.innerHTML =
    `<span class="block h-3.5 w-3.5 rounded-full border-[3px] border-white bg-slate-900 shadow-lg"></span>`;
  new mb.Marker({ element: el, anchor: 'center' }).setLngLat(c).addTo(map);
}

/** Metres between two points — only needs to be good enough to detect movement. */
function distance([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const dx = (lng2 - lng1) * 111_320 * Math.cos((lat1 * Math.PI) / 180);
  const dy = (lat2 - lat1) * 110_540;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Compass bearing, 0 = north, which is how the icon is drawn. */
function bearingOf([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}
