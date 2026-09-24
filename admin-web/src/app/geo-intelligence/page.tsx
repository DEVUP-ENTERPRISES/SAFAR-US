'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Globe2, MapPin, Flag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { MAPBOX_TOKEN } from '@/features/maps/api';
import { loadMapbox } from '@/features/maps/mapbox-loader';
import { adminApi, type GeoSummaryEntry } from '@/features/admin/api';

const WINDOWS = [7, 14, 30, 60, 90];

interface MbMap {
  remove(): void;
  addSource(id: string, source: unknown): void;
  addLayer(layer: unknown): void;
  addControl(c: unknown, pos?: string): void;
  getSource(id: string): { setData(data: unknown): void } | undefined;
  fitBounds(b: unknown, opts?: unknown): void;
  on(type: string, listener: () => void): void;
}
interface MbNamespace {
  accessToken: string;
  Map: new (opts: Record<string, unknown>) => MbMap;
  LngLatBounds: new () => { extend(c: [number, number]): void; isEmpty(): boolean };
  NavigationControl: new (opts?: Record<string, unknown>) => unknown;
}

function toGeoJSON(entries: GeoSummaryEntry[]) {
  return {
    type: 'FeatureCollection',
    features: entries.map((e) => ({
      type: 'Feature',
      properties: { count: e.count },
      geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
    })),
  };
}

/** Mapbox GL's native heatmap layer, weighted by visit count per city. */
function GeoHeatmap({ entries }: { entries: GeoSummaryEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const maxCount = Math.max(1, ...entries.map((e) => e.count));

  useEffect(() => {
    if (!MAPBOX_TOKEN || entries.length === 0) {
      setFailed(true);
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
          center: [0, 20],
          zoom: 1.2,
          attributionControl: false,
        });
        map.addControl(new mb.NavigationControl({ showCompass: false }), 'top-right');

        map.on('load', () => {
          if (cancelled || !map) return;
          const geojson = toGeoJSON(entries);
          map.addSource('visitors', { type: 'geojson', data: geojson });
          map.addLayer({
            id: 'visitor-heat',
            type: 'heatmap',
            source: 'visitors',
            paint: {
              'heatmap-weight': ['interpolate', ['linear'], ['get', 'count'], 0, 0, maxCount, 1],
              'heatmap-intensity': 1.2,
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 8, 6, 30],
              'heatmap-color': [
                'interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(0,0,0,0)',
                0.2, '#1f8f8a55',
                0.4, '#1f8f8aaa',
                0.6, '#f59e0bcc',
                0.8, '#ef4444dd',
                1, '#ef4444',
              ],
              'heatmap-opacity': 0.85,
            },
          });

          const bounds = new mb.LngLatBounds();
          entries.forEach((e) => bounds.extend([e.lng, e.lat]));
          if (!bounds.isEmpty()) map!.fitBounds(bounds, { padding: 48, maxZoom: 5, duration: 0 });
        });
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(entries.map((e) => [e.lat, e.lng, e.count]))]);

  if (failed) {
    return (
      <div className="flex h-[420px] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-muted/30 text-center text-sm text-muted-foreground">
        <Globe2 className="h-6 w-6" />
        {entries.length === 0 ? 'No located visits in this window yet.' : 'Map unavailable — check NEXT_PUBLIC_MAPBOX_TOKEN.'}
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={ref} className="h-[420px] w-full overflow-hidden rounded-2xl border border-border" />
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-background/90 px-3 py-1.5 text-xs font-medium shadow-soft backdrop-blur">
        <span>Visitor density:</span>
        <span className="text-muted-foreground">Low</span>
        <span className="h-2 w-24 rounded-full bg-gradient-to-r from-[#1f8f8a] via-[#f59e0b] to-[#ef4444]" />
        <span className="text-muted-foreground">High</span>
      </div>
    </div>
  );
}

function Ranked({ rows }: { rows: { label: string; count: number }[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data in this window.</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <div className="space-y-3">
      {rows.slice(0, 10).map((r) => (
        <div key={r.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{r.count}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary/70" style={{ width: `${max > 0 ? (r.count / max) * 100 : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function GeoIntelligencePage() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-geo', days],
    queryFn: () => adminApi.trafficGeo(days),
  });

  const entries = data ?? [];
  const totalVisits = entries.reduce((s, e) => s + e.count, 0);
  const countryCount = new Set(entries.map((e) => e.countryCode)).size;
  const cityCount = entries.filter((e) => e.city).length;

  const byCountry = Object.values(
    entries.reduce<Record<string, { label: string; count: number }>>((acc, e) => {
      acc[e.countryCode] ??= { label: e.country, count: 0 };
      acc[e.countryCode].count += e.count;
      return acc;
    }, {}),
  ).sort((a, b) => b.count - a.count);

  const byCity = [...entries]
    .filter((e) => e.city)
    .sort((a, b) => b.count - a.count)
    .map((e) => ({ label: `${e.city}, ${e.country}`, count: e.count }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Overview"
        title="Geographic Intelligence"
        description="Where visitors are actually coming from — resolved from IP to city/country, never storing the raw address."
        actions={
          <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
            {WINDOWS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  d === days ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}
          </div>
          <Skeleton className="h-[420px] w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              tone="primary"
              icon={<Globe2 className="h-5 w-5" />}
              label={`Located visits · last ${days}d`}
              value={totalVisits.toLocaleString()}
            />
            <StatTile
              icon={<Flag className="h-5 w-5" />}
              label="Countries reached"
              value={countryCount.toLocaleString()}
            />
            <StatTile
              icon={<MapPin className="h-5 w-5" />}
              label="Cities mapped"
              value={cityCount.toLocaleString()}
            />
          </div>

          <Card className="rounded-2xl shadow-soft">
            <CardHeader><CardTitle>Demand heatmap</CardTitle></CardHeader>
            <CardContent>
              <GeoHeatmap entries={entries} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-2xl shadow-soft">
              <CardHeader><CardTitle>Top countries</CardTitle></CardHeader>
              <CardContent><Ranked rows={byCountry} /></CardContent>
            </Card>
            <Card className="rounded-2xl shadow-soft">
              <CardHeader><CardTitle>Top cities</CardTitle></CardHeader>
              <CardContent><Ranked rows={byCity} /></CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
