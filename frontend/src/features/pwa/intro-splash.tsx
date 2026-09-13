'use client';

import { useEffect, useState } from 'react';
import { Logo } from '@/components/layout/logo';

/**
 * The launch intro.
 *
 * Shows on a COLD START only — the first open, and every time the app is
 * reopened after being killed from the background — never on in-app navigation.
 * That's exactly what a per-session flag gives us: sessionStorage survives
 * client-side navigation within one app session but is cleared when the tab/PWA
 * is closed, so a fresh launch re-shows it and moving between sections does not.
 *
 * Skippable (tap anywhere), self-dismisses in ~2.4s, and is skipped entirely
 * for anyone who prefers reduced motion.
 */
const SEEN_KEY = 'cato-intro-seen';

export function IntroSplash() {
  // 'pending' until we've decided; 'show' animates; 'leaving' fades; null unmounts.
  const [phase, setPhase] = useState<'pending' | 'show' | 'leaving' | null>('pending');
  const [lit, setLit] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === '1';
    } catch {
      /* private mode — treat as not seen, it just shows once and won't persist */
    }
    if (reduced || seen) {
      setPhase(null);
      return;
    }
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
    setPhase('show');
    // Light the content one frame in so the entrance transitions actually run.
    const raf = requestAnimationFrame(() => setLit(true));
    const leave = setTimeout(() => setPhase('leaving'), 2200);
    const done = setTimeout(() => setPhase(null), 2750);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, []);

  if (phase === null || phase === 'pending') return null;

  const skip = () => setPhase('leaving');

  return (
    <div
      onClick={skip}
      role="presentation"
      className={`grain fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden hero-mesh transition-opacity duration-500 ${
        phase === 'leaving' ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {/* Logo — scales and fades in with a soft glow behind it. */}
      <div className="relative">
        <div
          className={`pointer-events-none absolute inset-0 -z-10 rounded-full bg-primary/25 blur-3xl transition-all duration-700 ${
            lit ? 'scale-150 opacity-100' : 'scale-50 opacity-0'
          }`}
        />
        <Logo
          className={`h-24 w-24 transition-all duration-700 ease-out ${
            lit ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
          }`}
        />
      </div>

      {/* Wordmark rises in, just after the logo. */}
      <p
        className={`display mt-6 text-4xl tracking-tight text-white transition-all duration-700 ease-out ${
          lit ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
        style={{ transitionDelay: '260ms' }}
      >
        CATO DRIVE
      </p>

      {/* A thin accent line draws out under it. */}
      <span
        className={`mt-4 block h-0.5 rounded-full bg-primary transition-all duration-[700ms] ease-out ${
          lit ? 'w-16 opacity-100' : 'w-0 opacity-0'
        }`}
        style={{ transitionDelay: '520ms' }}
      />

      <p
        className={`absolute bottom-10 text-xs uppercase tracking-[0.25em] text-white/40 transition-opacity duration-700 ${
          lit ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transitionDelay: '700ms' }}
      >
        Drive away certain
      </p>
    </div>
  );
}
