'use client';

import { useEffect, useRef, useState, Children, isValidElement } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Scroll-triggered entrance.
 *
 * The design system defined four keyframes and 78 of 84 pages called none of
 * them, so every screen painted fully-formed and inert. Motion here is not
 * decoration: an element that arrives draws the eye to it in the order we
 * choose, which is the difference between a page you scan and a page that
 * leads you.
 *
 * Deliberately restrained — a short rise and a fade, once. Content that
 * re-animates every time it scrolls past is a page that will not sit still to
 * be read, and on a booking flow that reads as broken rather than lively.
 */

/** One observer for the whole page rather than one per element. */
let io: IntersectionObserver | null = null;
const shown = new WeakSet<Element>();

function observer(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  if (!io) {
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('is-revealed');
          shown.add(e.target);
          io?.unobserve(e.target);
        }
      },
      // Fires slightly before the element is fully in view, so the motion has
      // finished by the time it reaches a comfortable reading position.
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
  }
  return io;
}

export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  /** Milliseconds. Use for deliberate sequencing, not to slow the page down. */
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  const ref = useRef<HTMLElement>(null);
  // Server-rendered markup must be visible: if JS never runs, or the observer
  // is unavailable, the content still has to be readable.
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) return;
    setArmed(true);
    const obs = observer();
    if (!obs) return;
    // Anything already on screen at mount reveals immediately rather than
    // waiting for a scroll that may never come on a short page.
    obs.observe(el);
    return () => obs.unobserve(el);
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={cn(armed && 'reveal', className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

/**
 * Reveals children one after another.
 *
 * A grid whose twelve cards all arrive together is a flash, not a sequence.
 * Staggering them gives the eye a path through the group. The step is capped
 * so a long list never leaves the last item waiting seconds to appear.
 */
export function RevealGroup({
  children,
  step = 60,
  max = 8,
  className,
}: {
  children: ReactNode;
  step?: number;
  /** Beyond this many items the delay stops growing. */
  max?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      {Children.map(children, (child, i) =>
        isValidElement(child) ? (
          <Reveal delay={Math.min(i, max) * step}>{child}</Reveal>
        ) : (
          child
        ),
      )}
    </div>
  );
}
