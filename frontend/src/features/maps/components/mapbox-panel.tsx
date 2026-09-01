'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Star, X, Zap } from 'lucide-react';
import type { Vehicle } from '@/features/vehicles/types';
import { MAPBOX_TOKEN } from '@/features/maps/api';
import { loadMapbox } from '@/features/maps/mapbox-loader';

/* Mapbox GL types aren't installed (loaded from CDN), so the handful of shapes
   we touch are declared narrowly rather than pulling in @types/mapbox-gl. */
type LngLat = [number, number];
interface MbFeature {
  geometry: { coordinates: LngLat };
  properties: { cluster?: boolean; cluster_id?: number; point_count?: number; id?: string; price?: number };
}
interface MbSource {
  setData(data: unknown): void;
  getClusterExpansionZoom(clusterId: number, cb: (err: unknown, zoom: number) => void): void;
}
interface MbMap {
  setCenter(c: LngLat): void;
  fitBounds(b: unknown, opts?: unknown): void;
  easeTo(opts: { center: LngLat; zoom: number }): void;
  remove(): void;
  addControl(c: unknown, pos?: string): void;
  addSource(id: string, source: unknown): void;
  getSource(id: string): MbSource | undefined;
  querySourceFeatures(id: string): MbFeature[];
  isSourceLoaded(id: string): boolean;
  on(type: string, listener: (...args: unknown[]) => void): void;
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

/**
 * The results map on Mapbox GL. Markers cluster at low zoom (tap a cluster to
 * zoom in) and split into price pins as you zoom in; tapping a pin opens a
 * vehicle card. Clustering is native (a GeoJSON source with cluster:true); the
 * markers themselves are custom HTML so the price pills keep their look and we
 * own the click behaviour.
 */
export function MapboxPanel({
  lat,
  lng,
  vehicles = [],
}: {
  lat: number;
  lng: number;
  label: string;
  count: number;
  vehicles?: Vehicle[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MbMap | null>(null);
  const vehiclesRef = useRef<Vehicle[]>(vehicles);
  const markers = useRef<Record<string, MbMarker>>({});
  const onScreen = useRef<Record<string, MbMarker>>({});
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Vehicle | null>(null);

  const withCoords = (vs: Vehicle[]) => vs.filter((v) => v.location?.coordinates?.length === 2);

  const featureCollection = (vs: Vehicle[]) => ({
    type: 'FeatureCollection',
    features: withCoords(vs).map((v) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: v.location.coordinates as LngLat },
      properties: { id: v._id, price: Math.round(v.pricing.dailyPrice / 100) },
    })),
  });

  const fitToResults = (map: MbMap, mb: MbNamespace, vs: Vehicle[]) => {
    const pts = withCoords(vs);
    if (pts.length < 2) return;
    const bounds = new mb.LngLatBounds();
    pts.forEach((v) => bounds.extend(v.location.coordinates as LngLat));
    map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
  };

  // Reconcile custom markers with what the clustered source currently shows.
  const syncMarkers = () => {
    const mb = (window as unknown as { mapboxgl?: MbNamespace }).mapboxgl;
    const map = mapRef.current;
    if (!mb || !map || !map.isSourceLoaded('vehicles')) return;

    const next: Record<string, MbMarker> = {};
    for (const f of map.querySourceFeatures('vehicles')) {
      const coords = f.geometry.coordinates;
      const p = f.properties;
      const id = p.cluster ? `cl-${p.cluster_id}` : `pt-${p.id}`;
      if (!markers.current[id]) {
        const el = p.cluster
          ? clusterEl(p.point_count ?? 0, () => {
              map.getSource('vehicles')?.getClusterExpansionZoom(p.cluster_id!, (err, zoom) => {
                if (!err) map.easeTo({ center: coords, zoom });
              });
            })
          : pinEl(p.price ?? 0, () => {
              const v = vehiclesRef.current.find((x) => x._id === p.id);
              if (v) setSelected(v);
            });
        markers.current[id] = new mb.Marker({ element: el }).setLngLat(coords);
      }
      next[id] = markers.current[id];
      if (!onScreen.current[id]) next[id].addTo(map);
    }
    // Drop markers that scrolled out of view / were re-clustered.
    for (const id in onScreen.current) if (!next[id]) onScreen.current[id].remove();
    onScreen.current = next;
  };

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

        map.on('load', () => {
          map.addSource('vehicles', {
            type: 'geojson',
            data: featureCollection(vehiclesRef.current),
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 55,
          });
          map.on('render', syncMarkers);
          fitToResults(map, mb, vehiclesRef.current);
        });
        // Tapping empty map dismisses the card.
        map.on('click', () => setSelected(null));
      })
      .catch((e: Error) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
      Object.values(onScreen.current).forEach((m) => m.remove());
      markers.current = {};
      onScreen.current = {};
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.setCenter([lng, lat]);
  }, [lat, lng]);

  // Feed new results into the clustered source (markers refresh via 'render').
  useEffect(() => {
    vehiclesRef.current = vehicles;
    setSelected(null);
    const mb = (window as unknown as { mapboxgl?: MbNamespace }).mapboxgl;
    const map = mapRef.current;
    const source = map?.getSource('vehicles');
    if (map && mb && source) {
      source.setData(featureCollection(vehicles));
      fitToResults(map, mb, vehicles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles]);

  if (!MAPBOX_TOKEN || error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-primary/10 to-accent p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground">Map unavailable: {error ?? 'no token'}</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full" />
      {selected && <VehicleSheet vehicle={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/** The bottom-sheet card shown when a price pin is tapped. */
function VehicleSheet({ vehicle: v, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const photo = v.photos?.find((p) => p.isCover)?.url ?? v.photos?.[0]?.url;
  return (
    <div className="absolute inset-x-3 bottom-3 z-10">
      <Link
        href={`/vehicles/${v._id}`}
        className="flex gap-3 rounded-2xl border border-border bg-card p-3 shadow-[0_8px_30px_rgb(0,0,0,0.18)] transition-transform hover:scale-[1.01]"
      >
        {photo ? (
          <img src={photo} alt={`${v.make} ${v.model}`} className="h-20 w-24 shrink-0 rounded-xl object-cover" />
        ) : (
          <div className="h-20 w-24 shrink-0 rounded-xl bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-semibold">{v.year} {v.make} {v.model}</p>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); onClose(); }}
              className="-me-1 -mt-1 rounded-full p-1 text-muted-foreground hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
            {v.ratingCount > 0 ? (
              <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-current text-foreground" /> {v.ratingAvg.toFixed(1)} ({v.ratingCount})</span>
            ) : (
              <span>New listing</span>
            )}
            {v.listing.instantBook && <span className="inline-flex items-center gap-0.5 text-primary"><Zap className="h-3.5 w-3.5" /> Instant</span>}
          </div>
          <p className="mt-1 text-sm"><span className="font-bold">${Math.round(v.pricing.dailyPrice / 100)}</span> <span className="text-muted-foreground">/ day</span></p>
        </div>
      </Link>
    </div>
  );
}

function pinEl(price: number, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = `$${price}`;
  el.className =
    'rounded-full border border-white bg-foreground px-2 py-0.5 text-xs font-bold text-background shadow-md transition-transform hover:scale-110';
  el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return el;
}

function clusterEl(count: number, onClick: () => void): HTMLButtonElement {
  // Scale the bubble a little with density so busy areas read as busier.
  const size = count < 10 ? 34 : count < 50 ? 42 : 50;
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = String(count);
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.className =
    'flex items-center justify-center rounded-full border-2 border-white bg-primary text-sm font-bold text-primary-foreground shadow-md transition-transform hover:scale-110';
  el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return el;
}
