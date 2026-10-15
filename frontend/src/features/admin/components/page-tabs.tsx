'use client';

import type { ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

export interface PageTab {
  key: string;
  label: string;
  render: () => ReactNode;
}

/** Tabs for a page that groups related views; the open tab lives in ?tab= so it can be linked and survives a reload. */
export function PageTabs({ tabs }: { tabs: PageTab[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = tabs.find((t) => t.key === params.get('tab')) ?? tabs[0];

  const open = (key: string) => {
    const next = new URLSearchParams(params.toString());
    next.set('tab', key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Views" className="flex gap-1 overflow-x-auto rounded-full border border-border bg-card p-1 [scrollbar-width:none]">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === active.key}
            onClick={() => open(t.key)}
            className={cn('shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors', t.key === active.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={active.label}>{active.render()}</div>
    </div>
  );
}

/** The top of a tab: what it shows, and its own controls such as a date range. */
export function TabIntro({ description, actions }: { description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
