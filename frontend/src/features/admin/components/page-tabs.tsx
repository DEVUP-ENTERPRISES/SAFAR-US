'use client';

import type { ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

export interface PageTab {
  key: string;
  label: string;
  render: () => ReactNode;
}

/** The open tab, kept in ?tab= so it can be linked and survives a reload. */
export function useTabParam(keys: string[]): [string, (key: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get('tab');
  const active = current && keys.includes(current) ? current : keys[0];
  const open = (key: string) => {
    const next = new URLSearchParams(params.toString());
    next.set('tab', key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return [active, open];
}

export function TabBar({ tabs, active, onChange, className }: { tabs: { key: string; label: string }[]; active: string; onChange: (key: string) => void; className?: string }) {
  return (
    <div role="tablist" aria-label="Views" className={cn('flex gap-1 overflow-x-auto rounded-full border border-border bg-card p-1 [scrollbar-width:none]', className)}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === active}
          onClick={() => onChange(t.key)}
          className={cn('shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors', t.key === active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Tabs for a page that groups related views. */
export function PageTabs({ tabs }: { tabs: PageTab[] }) {
  const [active, open] = useTabParam(tabs.map((t) => t.key));
  const tab = tabs.find((t) => t.key === active) ?? tabs[0];
  return (
    <div className="space-y-6">
      <TabBar tabs={tabs} active={tab.key} onChange={open} />
      <div role="tabpanel" aria-label={tab.label}>{tab.render()}</div>
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
