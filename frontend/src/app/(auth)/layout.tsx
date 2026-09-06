'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { config } from '@/lib/config';
import { Logo } from '@/components/layout/logo';
import { vehicleApi } from '@/features/vehicles/api';

/**
 * The auth shell.
 *
 * This used to hotlink three hardcoded Unsplash photos. Two problems with that,
 * and both bit: they were stock cars we do not have on the platform, and one of
 * the three was deleted upstream and started returning 404 — so a third of the
 * time the login page rendered a broken-image icon.
 *
 * Now it shows real cars from the marketplace, and the panel is designed to
 * stand on its own without any image at all. The gradient composition below is
 * pure CSS: it needs no network, cannot rot, and is what renders while photos
 * load, when the marketplace is empty, or when a request fails. A photo only
 * ever appears after it has actually decoded, so a dead URL degrades to the
 * designed panel instead of a broken icon.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState<string[]>([]);

  // Real listings, fetched without auth. Decorative, so every failure is silent.
  const photos = useQuery({
    queryKey: ['auth-showcase'],
    queryFn: async () => {
      const facets = await vehicleApi.facets();
      const city = facets.cities?.[0];
      if (!city) return [];
      const vehicles = await vehicleApi.search({ lng: city.lng, lat: city.lat, radiusKm: 200, limit: 6 });
      return vehicles
        .map((v) => v.photos?.find((p) => p.isCover)?.url ?? v.photos?.[0]?.url)
        .filter((u): u is string => !!u)
        .slice(0, 3);
    },
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  // Only photos that decoded are eligible to show.
  useEffect(() => {
    if (!photos.data?.length) return;
    let cancelled = false;
    Promise.all(
      photos.data.map(
        (src) =>
          new Promise<string | null>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(src);
            img.onerror = () => resolve(null);
            img.src = src;
          }),
      ),
    ).then((r) => {
      if (!cancelled) setLoaded(r.filter((s): s is string => !!s));
    });
    return () => { cancelled = true; };
  }, [photos.data]);

  useEffect(() => {
    if (loaded.length < 2) return;
    const t = setInterval(() => setActive((p) => (p + 1) % loaded.length), 6000);
    return () => clearInterval(t);
  }, [loaded.length]);

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* LEFT: the brand panel. Holds up with or without photography. */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-ink lg:flex">
        {/* Designed backdrop — no network, always present. */}
        <div aria-hidden className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_15%_10%,hsl(var(--primary)/0.30),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_90%_95%,hsl(var(--primary)/0.16),transparent_65%)]" />
        </div>

        {/* Real cars, layered over it once they have decoded. */}
        {loaded.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
              i === active ? 'opacity-45' : 'opacity-0'
            }`}
          />
        ))}

        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />

        {/* Brand */}
        <div className="relative z-10 flex items-center p-10">
          <Link href="/" className="flex items-center gap-2.5 text-white transition-transform hover:scale-105">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white p-1 shadow-lg">
              <Logo className="h-9 w-9" />
            </span>
            <span className="display text-2xl tracking-tight">{config.appName}</span>
          </Link>
        </div>

        {/* Copy. States a guarantee we actually enforce rather than a superlative. */}
        <div className="relative z-10 p-10 pb-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-widest text-white/90 backdrop-blur-md">
            <ShieldCheck className="h-4 w-4" /> Booking protected
          </span>
          <h1 className="display mt-6 text-5xl leading-[1.05] text-white xl:text-6xl">
            Drive away<br />certain.
          </h1>
          <p className="mt-6 max-w-md text-lg font-medium leading-relaxed text-white/70">
            If your host cancels, we find you another car and cover the difference. Your trip is not their
            change of mind.
          </p>

          {loaded.length > 1 && (
            <div className="mt-12 flex items-center gap-3">
              {loaded.map((src, i) => (
                <button
                  key={src}
                  onClick={() => setActive(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === active ? 'w-8 bg-white' : 'w-2 bg-white/30 hover:bg-white/50'
                  }`}
                  aria-label={`Show car ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: the form */}
      <div className="relative flex w-full flex-col lg:w-1/2">
        <div className="flex h-20 items-center justify-between px-6 lg:hidden">
          <Link href="/" className="flex items-center gap-2.5 transition-transform hover:scale-105">
            <Logo className="h-9 w-9 shrink-0" />
            <span className="display text-xl tracking-tight">{config.appName}</span>
          </Link>
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center p-6 sm:p-12 lg:p-16">
          <div className="w-full max-w-md animate-slide-in-right">{children}</div>
        </div>
      </div>
    </div>
  );
}
