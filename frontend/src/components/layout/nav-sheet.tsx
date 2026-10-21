'use client';

import { useEffect, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface NavSheetItem {
  slug: string;
  label: string;
  path: string;
  group: string;
}

/** The full menu as a bottom sheet on phones, grouped like the desktop sidebar. */
export function NavSheet({ open, onClose, title, items, icons, fallbackIcon: FallbackIcon, isActive, className }: {
  open: boolean;
  onClose: () => void;
  title: string;
  items: NavSheetItem[];
  icons: Record<string, ComponentType<{ className?: string }>>;
  fallbackIcon: ComponentType<{ className?: string }>;
  isActive: (item: NavSheetItem) => boolean;
  /** Where the sheet stops showing, matching the panel's own phone bar. */
  className?: string;
}) {
  const pathname = usePathname();
  useEffect(() => onClose(), [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;

  const groups: { name: string; items: NavSheetItem[] }[] = [];
  for (const it of items) {
    let g = groups.find((x) => x.name === it.group);
    if (!g) groups.push((g = { name: it.group, items: [] }));
    g.items.push(it);
  }

  return (
    <div className={cn('fixed inset-0 z-[60]', className ?? 'md:hidden')} role="dialog" aria-modal="true" aria-label={`${title} menu`}>
      <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-border bg-background pb-safe">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-background px-5 py-4">
          <p className="text-base font-bold">{title}</p>
          <button type="button" onClick={onClose} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-5 px-3 py-4">
          {groups.map((g) => (
            <div key={g.name}>
              <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{g.name}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {g.items.map((n) => {
                  const NavIcon = icons[n.slug] ?? FallbackIcon;
                  const active = isActive(n);
                  return (
                    <Link
                      key={n.slug}
                      href={n.path}
                      aria-current={active ? 'page' : undefined}
                      className={cn('flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-3 text-sm font-medium', active ? 'bg-primary/10 text-primary' : 'hover:bg-accent')}
                    >
                      <NavIcon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{n.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
