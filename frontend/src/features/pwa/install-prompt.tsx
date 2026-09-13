'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Download, Share, Plus, X, Sparkles } from 'lucide-react';
import { Logo } from '@/components/layout/logo';

/**
 * The "install this app" prompt — trustworthy, platform-aware, and shown at most
 * once until it's earned a dismissal cooldown or the app is installed.
 *
 * The bug this is built to avoid: nagging someone who already installed, or on
 * every visit. So it stays hidden when ANY of these is true:
 *   - the app is already running installed (display-mode: standalone / iOS
 *     navigator.standalone), or was ever installed (a persisted flag), or
 *   - it was dismissed within the cooldown window.
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
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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
      timer = setTimeout(() => {
        if (!cancelled) setMode(next);
      }, 2500);
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

  if (mode === 'hidden') return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:justify-end lg:px-6">
      <div
        role="dialog"
        aria-label="Install CATO Drive"
        className="animate-slide-up w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/20 ring-1 ring-black/5"
      >
        <div className="flex items-start gap-3.5 p-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#12100e] ring-1 ring-white/10">
            <Logo className="h-8 w-8" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[15px] font-bold text-foreground">
              Install CATO Drive
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
              Faster booking and curbside delivery, right from your home screen. No app store, no clutter.
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Not now"
            className="-me-1 -mt-1 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode === 'android' ? (
          <div className="flex gap-2 border-t border-border p-3">
            <button
              onClick={dismiss}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted"
            >
              Not now
            </button>
            <button
              onClick={install}
              className="flex flex-[1.5] items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:scale-[1.02] active:scale-95"
            >
              <Download className="h-4 w-4" /> Install app
            </button>
          </div>
        ) : (
          <div className="border-t border-border bg-muted/30 p-3">
            <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
              Tap
              <Share className="mx-0.5 inline h-4 w-4 text-primary" />
              <span className="font-semibold text-foreground">Share</span>, then
              <Plus className="mx-0.5 inline h-4 w-4 text-primary" />
              <span className="font-semibold text-foreground">Add to Home Screen</span>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
