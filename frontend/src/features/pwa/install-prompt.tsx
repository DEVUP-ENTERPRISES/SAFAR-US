'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Share, Plus, X } from 'lucide-react';
import { Logo } from '@/components/layout/logo';

/**
 * The "install this app" prompt — trustworthy, platform-aware, and shown at most
 * once until it's earned a dismissal cooldown or the app is installed.
 *
 * The bug this is built to avoid: nagging someone who already installed, or on
 * every visit. So it stays hidden when ANY of these is true:
 *   - the app is already running installed (display-mode: standalone / iOS
 *     navigator.standalone), or was ever installed (a persisted flag), or
 *   - it was dismissed within the last 24 hours.
 *
 * Platforms differ, so the UI does too:
 *   - Android/Chrome/Edge fire `beforeinstallprompt` → a one-tap Install button.
 *   - iOS Safari has no install API → a short "Add to Home Screen" instruction
 *     (only on Safari, where A2HS actually exists).
 * Shown on the home page only, after a short delay, so it never interrupts a
 * booking in progress.
 */

const DISMISS_KEY = 'cato-pwa-dismissed';
const INSTALLED_KEY = 'cato-pwa-installed';
// It's an app we want on every home screen — so a dismissal only rests it for a
// day, then we offer again. (Once installed it never shows: see suppressed().)
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function suppressed(): boolean {
  try {
    if (localStorage.getItem(INSTALLED_KEY)) return true;
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return !!t && Date.now() - t < COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const pathname = usePathname() ?? '';
  const [mode, setMode] = useState<'hidden' | 'android' | 'ios'>('hidden');
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);

  useEffect(() => {
    // Never on the admin console, and only on the home page (their ask), and
    // never once installed or recently dismissed.
    if (isStandalone() || suppressed()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const showAfterDelay = (next: 'android' | 'ios') => {
      // Short enough to feel prompt, long enough not to fight first paint.
      timer = setTimeout(() => {
        if (!cancelled) setMode(next);
      }, 900);
    };

    const onBIP = (e: Event) => {
      e.preventDefault(); // stop Chrome's mini-infobar; we show our own UI
      setDeferred(e as BIPEvent);
      if (pathname === '/') showAfterDelay('android');
    };

    const onInstalled = () => {
      try {
        localStorage.setItem(INSTALLED_KEY, '1');
      } catch {
        /* private mode — fine, standalone detection still hides it next time */
      }
      setMode('hidden');
    };

    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);

    // iOS Safari has no beforeinstallprompt — offer manual instructions there.
    const ua = window.navigator.userAgent;
    const isIOS =
      /iP(hone|od|ad)/.test(ua) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
    if (isIOS && isSafari && pathname === '/') showAfterDelay('ios');

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [pathname]);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setMode('hidden');
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') {
      try {
        localStorage.setItem(INSTALLED_KEY, '1');
      } catch {
        /* ignore */
      }
    }
    setDeferred(null);
    setMode('hidden');
  };

  // Render only on the home page. The component is mounted app-wide (persistent
  // chrome), so without this a bar shown on home stayed visible after a
  // client-side navigation to /account etc. — which is the "showing on other
  // tabs" bug. Gating the render keeps it strictly a home-page prompt.
  if (mode === 'hidden' || pathname !== '/') return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:justify-end lg:px-6">
      <div
        role="dialog"
        aria-label="Install CATO Drive"
        className="animate-slide-up w-full max-w-[24rem] overflow-hidden rounded-2xl bg-[#17130f] text-white shadow-2xl shadow-black/50 ring-1 ring-white/10"
      >
        <div className="flex items-center gap-3.5 px-4 pt-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[0.85rem] bg-black/50 ring-1 ring-white/10">
            <Logo className="h-8 w-8" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-tight">Install CATO Drive</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-white/55">
              Book premium cars delivered curbside — right from your home screen. No app store, no clutter.
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Not now"
            className="-me-1 shrink-0 rounded-full p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode === 'android' ? (
          <div className="flex items-center gap-4 px-4 pb-4 pt-3.5">
            <button
              onClick={dismiss}
              className="shrink-0 text-[13px] font-semibold text-white/45 transition-colors hover:text-white"
            >
              Not now
            </button>
            <button
              onClick={install}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-transform active:scale-[0.98]"
            >
              Install
            </button>
          </div>
        ) : (
          <div className="px-4 pb-4 pt-3">
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-white/60">
              Tap
              <Share className="h-4 w-4 text-white/80" />
              <span className="font-semibold text-white">Share</span>
              then
              <Plus className="h-4 w-4 text-white/80" />
              <span className="font-semibold text-white">Add to Home Screen</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
