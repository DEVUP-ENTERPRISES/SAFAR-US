'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { CornerDownLeft, Keyboard, Search } from 'lucide-react';
import type { PanelNavItem } from '@/components/layout/panel-sidebar';
import { cn } from '@/lib/utils/cn';

const OPEN_EVENT = 'cato:command-palette';

/** Opens the palette from a button anywhere in the panel. */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

const isMac = () => typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

/** Best matches first: a label that starts with the search, then one containing every word. */
export function rankPages(items: PanelNavItem[], query: string): PanelNavItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  const scored: { item: PanelNavItem; score: number; i: number }[] = [];
  items.forEach((item, i) => {
    const label = item.label.toLowerCase();
    const hay = `${label} ${item.group.toLowerCase()}`;
    if (!words.every((w) => hay.includes(w))) return;
    scored.push({ item, i, score: label.startsWith(words[0]) ? 0 : label.includes(words[0]) ? 1 : 2 });
  });
  return scored.sort((a, b) => a.score - b.score || a.i - b.i).map((s) => s.item);
}

const SHORTCUTS: { keys: string[]; what: string }[] = [
  { keys: ['mod', 'K'], what: 'Go to any page' },
  { keys: ['/'], what: 'Jump to the search box on this page' },
  { keys: ['?'], what: 'Show these shortcuts' },
  { keys: ['Esc'], what: 'Close a dialog or this window' },
];

/** The palette shortcut as this computer writes it; set after mount so the server and browser render alike. */
export function PaletteShortcut({ className }: { className?: string }) {
  const [label, setLabel] = useState('Ctrl K');
  useEffect(() => { if (isMac()) setLabel('⌘K'); }, []);
  return <kbd className={className}>{label}</kbd>;
}

function Key({ k }: { k: string }) {
  return <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-sm border border-border bg-subtle px-1.5 font-sans text-xs font-semibold text-muted-foreground">{k}</kbd>;
}

/** Search every page of the panel from the keyboard, plus the panel-wide shortcuts. */
export function CommandPalette({
  items,
  icons,
  fallbackIcon: Fallback,
}: {
  items: PanelNavItem[];
  icons: Record<string, ComponentType<{ className?: string }>>;
  fallbackIcon: ComponentType<{ className?: string }>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'closed' | 'pages' | 'help'>('closed');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const results = useMemo(() => rankPages(items, query), [items, query]);
  const mod = isMac() ? '⌘' : 'Ctrl';

  const modeNow = useRef(mode);
  modeNow.current = mode;

  const open = useCallback((m: 'pages' | 'help') => {
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery('');
    setActive(0);
    setMode(m);
  }, []);
  const close = useCallback(() => {
    setMode('closed');
    returnTo.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (modeNow.current === 'pages') close();
        else open('pages');
        return;
      }
      if (modeNow.current !== 'closed' || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.key === '?') {
        e.preventDefault();
        open('help');
      } else if (e.key === '/') {
        const box = document.querySelector<HTMLInputElement>('[data-page-search], input[type="search"], input[aria-label^="Search"]');
        if (box) {
          e.preventDefault();
          box.focus();
          box.select();
        }
      }
    };
    const onOpen = () => open('pages');
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [open, close]);

  useEffect(() => {
    if (mode === 'closed') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (mode === 'pages') input.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mode]);

  useEffect(() => {
    document.getElementById(`cmd-${results[active]?.slug}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, results]);

  if (mode === 'closed') return null;

  const go = (item?: PanelNavItem) => {
    if (!item) return;
    setMode('closed');
    router.push(item.path);
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh]"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
    >
      <div className="absolute inset-0 animate-fade-in bg-foreground/40 backdrop-blur-sm" onClick={close} aria-hidden />
      {mode === 'help' ? (
        <div role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" className="relative w-full max-w-md animate-scale-in rounded-lg border border-border bg-card p-6 shadow-xl">
          <h2 id="shortcuts-title" className="flex items-center gap-2 text-lg font-semibold"><Keyboard className="h-5 w-5 text-muted-foreground" aria-hidden /> Keyboard shortcuts</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {SHORTCUTS.map((s) => (
              <li key={s.what} className="flex items-center justify-between gap-4">
                <span>{s.what}</span>
                <span className="flex shrink-0 gap-1">{s.keys.map((k) => <Key key={k} k={k === 'mod' ? mod : k} />)}</span>
              </li>
            ))}
          </ul>
          <button type="button" autoFocus onClick={close} className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-sm border border-border text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Close
          </button>
        </div>
      ) : (
        <div role="dialog" aria-modal="true" aria-label="Go to a page" className="relative flex max-h-[70vh] w-full max-w-lg animate-scale-in flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={input}
              role="combobox"
              aria-expanded="true"
              aria-controls="cmd-list"
              aria-activedescendant={results[active] ? `cmd-${results[active].slug}` : undefined}
              aria-autocomplete="list"
              placeholder="Go to a page…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onListKey}
              className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            <Key k="Esc" />
          </div>
          <ul id="cmd-list" role="listbox" aria-label="Pages" className="min-h-0 flex-1 overflow-y-auto p-2">
            {results.length ? (
              results.map((item, i) => {
                const Icon = icons[item.slug] ?? Fallback;
                return (
                  <li
                    key={item.slug}
                    id={`cmd-${item.slug}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(item)}
                    className={cn('flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2.5 text-sm', i === active ? 'bg-primary/10 text-primary' : 'text-foreground')}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{item.group}</span>
                    {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                  </li>
                );
              })
            ) : (
              <li className="px-3 py-8 text-center text-sm text-muted-foreground">No page matches “{query}”.</li>
            )}
          </ul>
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Key k="↑" /><Key k="↓" /> move · <Key k="Enter" /> open</span>
            <button type="button" onClick={() => setMode('help')} className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">All shortcuts <Key k="?" /></button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
