'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const isNav = variant === 'nav';
  const labelCls = cn(
    'block uppercase tracking-[0.15em] font-bold text-muted-foreground',
    isNav ? 'mb-0.5 text-[9px]' : 'mb-1 text-[10px]'
  );
  
  // Customizing native inputs to look premium
  const inputBase = "bg-transparent font-semibold text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 hover:text-primary focus:text-primary";
  const dateCls = cn(inputBase, "text-sm w-full cursor-pointer");
  const timeCls = cn(inputBase, "text-sm w-20 cursor-pointer text-muted-foreground");
  
  const seg = isNav ? 'flex flex-col justify-center px-5 h-full' : 'px-5 py-3.5';

  return (
    <div
      className={cn(
        'flex items-stretch transition-all duration-300 relative',
        isNav
          ? 'w-full divide-x divide-border/50 items-center h-[52px]'
          : 'flex-col gap-0 rounded-[2rem] border border-border/40 bg-background shadow-2xl lg:flex-row lg:h-[68px] lg:divide-x lg:divide-border/50 lg:p-1 lg:rounded-full overflow-hidden lg:overflow-visible',
      )}
    >
      {/* Where */}
      <div className={cn('min-w-0 flex-1', seg, !isNav && 'border-b border-border/40 lg:border-b-0')}>
        <span className={labelCls}>Where</span>
        <div className={isNav ? '' : '-ms-1'}>
          <LocationSearch
            bare={true}
            onPick={(p) => s.patch({ center: { lat: p.lat, lng: p.lng, label: p.label } })}
            placeholder={cityLabel || 'Anywhere'}
          />
        </div>
        {!isNav && cities.length > 0 && (
          <Select
            value={s.city}
            onChange={(e) => s.patch({ city: e.target.value, center: null })}
            className="mt-1 w-full cursor-pointer bg-transparent text-sm font-medium text-muted-foreground outline-none border-none focus:ring-0 px-0 h-auto"
          >
            {cities.map((c) => (
              <option key={c.city} value={c.city}>{c.city} ({c.vehicles})</option>
            ))}
          </Select>
        )}
      </div>

      <div className={cn(!isNav && 'flex flex-row divide-x divide-border/40 lg:divide-x-0 border-b border-border/40 lg:border-b-0')}>
        {/* From */}
        <div className={cn(seg, !isNav && 'flex-1')}>
          <span className={labelCls}>From</span>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <input type="date" value={s.fromDate} onChange={(e) => s.patch({ fromDate: e.target.value })} className={dateCls} />
            <input type="time" value={s.fromTime} onChange={(e) => s.patch({ fromTime: e.target.value })} className={timeCls} />
          </div>
        </div>

        {/* Until */}
        <div className={cn(seg, !isNav && 'flex-1')}>
          <span className={labelCls}>Until</span>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <input type="date" value={s.untilDate} min={s.fromDate || undefined} onChange={(e) => s.patch({ untilDate: e.target.value })} className={dateCls} />
            <input type="time" value={s.untilTime} onChange={(e) => s.patch({ untilTime: e.target.value })} className={timeCls} />
          </div>
        </div>
      </div>

      {/* Age */}
      <div className={cn(seg, isNav && 'hidden md:flex')}>
        <span className={labelCls}>Age</span>
        <input type="number" min={18} max={99} value={s.age} onChange={(e) => s.patch({ age: e.target.value })} className={cn(inputBase, 'w-12 text-sm cursor-text')} />
      </div>

      {/* Search */}
      <div className={cn('flex items-center', isNav ? 'ps-4 pe-1' : 'p-3')}>
        <Button 
          className={cn(
            'gap-2 rounded-full font-bold transition-transform active:scale-95', 
            isNav ? 'h-9 px-5 bg-foreground text-background hover:bg-foreground/90' : 'h-14 w-full text-base bg-primary text-primary-foreground hover:bg-primary/90 lg:w-auto lg:h-12 lg:px-8'
          )} 
          onClick={onSearch}
        >
          <Search className="h-5 w-5" /> <span>Search</span>
        </Button>
      </div>
    </div>
  );
}
