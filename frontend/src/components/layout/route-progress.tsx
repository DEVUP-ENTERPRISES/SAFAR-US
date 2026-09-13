'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * A thin brand progress bar across the top on navigation — the Linear/GitHub
 * pattern. It starts the moment a same-origin link is clicked (so it reacts to
 * intent, not just arrival) and completes when the new route renders.
 *
 * The app router gives no navigation-start event, so intent is detected by a
 * capture-phase click on any in-app <a>; completion is the pathname changing.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  // Start on any in-app link click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement)?.closest('a');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || a.target === '_blank' || a.hasAttribute('download')) return;
      let dest: URL;
      try { dest = new URL(href, location.href); } catch { return; }
      if (dest.origin !== location.origin || dest.pathname === location.pathname) return;
      clear();
      setActive(true);
      setWidth(8);
      timers.current.push(setTimeout(() => setWidth(65), 80));
      timers.current.push(setTimeout(() => setWidth(88), 350));
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // Complete when the destination has rendered.
  useEffect(() => {
    if (!active) return;
    clear();
    setWidth(100);
    const t = setTimeout(() => { setActive(false); setWidth(0); }, 350);
    timers.current.push(t);
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div aria-hidden className={`pointer-events-none fixed inset-x-0 top-0 z-[95] h-[3px] transition-opacity duration-300 ${active ? 'opacity-100' : 'opacity-0'}`}>
      <div
        className="h-full rounded-e-full bg-primary shadow-[0_0_10px_1px] shadow-primary/60 transition-[width] duration-300 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
