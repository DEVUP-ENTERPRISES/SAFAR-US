'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { LocationSearch } from '@/features/maps/components/location-search';
import { useFacets } from '@/features/vehicles/hooks';
import { useSearchBar } from './search-store';

/**
 * The Where / From / Until / Age search bar, bound to the shared store. Rendered
 * inline in the navbar on desktop and as a full box on mobile, so both places
 * stay in sync and drive the same results.
 */
export function SearchBarFields({ variant = 'bar' }: { variant?: 'bar' | 'nav' }) {
  const router = useRouter();
  const pathname = usePathname();
  const facets = useFacets();
  const cities = facets.data?.cities ?? [];
  const s = useSearchBar();

  const activeCity = cities.find((c) => c.city === s.city) ?? cities[0];
  const cityLabel = s.center?.label ?? activeCity?.city ?? s.city;

  const onSearch = () => {
    if (pathname !== '/search') {
      const qs = new URLSearchParams();
      if (s.city) qs.set('city', s.city);
      if (s.fromDate) qs.set('start', s.fromDate);
      if (s.untilDate) qs.set('end', s.untilDate);
      router.push(`/search?${qs.toString()}`);
    } else {
      // Already on results — they update live from the store; nudge to the top.
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const isNav = variant === 'nav';
  const labelCls = cn('block font-bold text-[#635BFF]', isNav ? 'mb-0.5 text-[10px] leading-none' : 'text-xs');
  const dateCls = 'bg-transparent text-sm font-medium outline-none';
  const timeCls = 'w-[4.75rem] bg-transparent text-sm font-medium text-muted-foreground outline-none';
  const seg = isNav ? 'flex flex-col justify-center px-4' : 'px-3 py-1.5';

  return (
    <div
      className={cn(
        'flex items-stretch',
        isNav
          ? 'w-full divide-x divide-border/60'
          : 'flex-col gap-1 rounded-[1.75rem] border border-border bg-card p-2 shadow-sm lg:flex-row lg:divide-x lg:divide-border',
      )}
    >
      {/* Where */}
      <div className={cn('min-w-0 flex-1', seg)}>
        <span className={labelCls}>Where</span>
        <div className={isNav ? '' : '-ms-1'}>
          <LocationSearch
            bare={isNav}
            onPick={(p) => s.patch({ center: { lat: p.lat, lng: p.lng, label: p.label } })}
            placeholder={cityLabel || 'Anywhere'}
          />
        </div>
        {!isNav && cities.length > 0 && (
          <select
            value={s.city}
            onChange={(e) => s.patch({ city: e.target.value, center: null })}
            className="mt-0.5 w-full cursor-pointer bg-transparent text-sm text-muted-foreground outline-none"
          >
            {cities.map((c) => (
              <option key={c.city} value={c.city}>{c.city} ({c.vehicles})</option>
            ))}
          </select>
        )}
      </div>

      {/* From */}
      <div className={seg}>
        <span className={labelCls}>From</span>
        <div className="flex items-center gap-1.5">
          <input type="date" value={s.fromDate} onChange={(e) => s.patch({ fromDate: e.target.value })} className={dateCls} />
          <input type="time" value={s.fromTime} onChange={(e) => s.patch({ fromTime: e.target.value })} className={timeCls} />
        </div>
      </div>

      {/* Until */}
      <div className={seg}>
        <span className={labelCls}>Until</span>
        <div className="flex items-center gap-1.5">
          <input type="date" value={s.untilDate} min={s.fromDate || undefined} onChange={(e) => s.patch({ untilDate: e.target.value })} className={dateCls} />
          <input type="time" value={s.untilTime} onChange={(e) => s.patch({ untilTime: e.target.value })} className={timeCls} />
        </div>
      </div>

      {/* Age */}
      <div className={seg}>
        <span className={labelCls}>Age</span>
        <input type="number" min={18} max={99} value={s.age} onChange={(e) => s.patch({ age: e.target.value })} className={cn(dateCls, 'w-10')} />
      </div>

      {/* Search */}
      <div className={cn('flex items-center', isNav ? 'ps-4' : 'px-1')}>
        <Button className={cn('gap-2 rounded-full', isNav ? 'h-11 px-5' : 'h-12 w-full rounded-2xl px-6 lg:w-auto')} onClick={onSearch}>
          <Search className="h-4 w-4" /> Search
        </Button>
      </div>
    </div>
  );
}
