'use client';

import { useSyncExternalStore } from 'react';

/**
 * One shared record of "can this person install the app, and have they?".
 *
 * Browsers fire `beforeinstallprompt` once, early, before most pages have
 * mounted, so anything that wants to offer an install button later (the profile
 * page) has to have listened from the start. This module registers its listeners
 * as soon as it loads and keeps the event for whoever asks.
 */
const INSTALLED_KEY = 'cato-pwa-installed';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BIPEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function standalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function markInstalled() {
  installed = true;
  deferred = null;
  try {
    localStorage.setItem(INSTALLED_KEY, '1');
  } catch {
    /* private mode: standalone detection still hides it next time */
  }
  emit();
}

if (typeof window !== 'undefined') {
  try {
    installed = standalone() || !!localStorage.getItem(INSTALLED_KEY);
  } catch {
    installed = standalone();
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    emit();
  });
  window.addEventListener('appinstalled', markInstalled);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export type InstallState = 'installed' | 'native' | 'ios' | 'manual';

function snapshot(): InstallState {
  if (installed) return 'installed';
  if (deferred) return 'native';
  const ua = window.navigator.userAgent;
  const ios = /iP(hone|od|ad)/.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  return ios ? 'ios' : 'manual';
}

/** Where this person stands: already installed, one tap away, iOS instructions, or use the browser menu. */
export function useInstallState(): { state: InstallState; install: () => Promise<void> } {
  const state = useSyncExternalStore(subscribe, snapshot, () => 'manual' as InstallState);
  const install = async () => {
    if (!deferred) return;
    const ev = deferred;
    try {
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      if (outcome === 'accepted') return markInstalled();
    } catch {
      /* this event was already used (for example by the home page popup) */
    }
    // A prompt can only be shown once per event; the browser fires a new one later, and until then the card shows manual steps.
    deferred = null;
    emit();
  };
  return { state, install };
}
