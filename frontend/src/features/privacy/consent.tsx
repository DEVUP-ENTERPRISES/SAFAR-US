'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api/client';
import { usePlatformConfig } from '@/features/platform/config';

export type ConsentChoice = { analytics: boolean; marketing: boolean };
type Stored = ConsentChoice & { version: number; at: string };
type Source = 'banner' | 'settings' | 'gpc';

const KEY = 'cato_consent';
const VISITOR = 'cato_visitor_id';

function read(): Stored | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function visitorId(): string {
  try {
    let id = window.localStorage.getItem(VISITOR);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(VISITOR, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function gpcOn(): boolean {
  return typeof navigator !== 'undefined' && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

// Our own analytics runs unless the visitor turned it off; read synchronously so no pageview fires before the check.
export function analyticsAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  return read()?.analytics !== false;
}

type Ctx = {
  choice: ConsentChoice;
  decided: boolean;
  gpc: boolean;
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  save: (c: ConsentChoice, source: Source) => void;
};

const ConsentContext = createContext<Ctx | null>(null);

export function ConsentProvider({ children }: { children: ReactNode }) {
  const version = usePlatformConfig().data?.adTags?.consentVersion ?? 1;
  const [stored, setStored] = useState<Stored | null>(null);
  const [ready, setReady] = useState(false);
  const [gpc, setGpc] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setStored(read());
    setGpc(gpcOn());
    setReady(true);
  }, []);

  const save = useCallback((c: ConsentChoice, source: Source) => {
    const next: Stored = { analytics: c.analytics, marketing: gpcOn() ? false : c.marketing, version, at: new Date().toISOString() };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* the choice still applies for this visit */
    }
    setStored(next);
    setSettingsOpen(false);
    void api.post('/privacy/consent', { visitorId: visitorId(), analytics: next.analytics, marketing: next.marketing, gpc: gpcOn(), version, source }, { auth: 'optional' }).catch(() => undefined);
  }, [version]);

  const value = useMemo<Ctx>(() => {
    const current = stored && stored.version >= version ? stored : null;
    return {
      choice: { analytics: current?.analytics ?? true, marketing: !gpc && current?.marketing === true },
      decided: !ready || !!current,
      gpc,
      settingsOpen,
      openSettings: () => setSettingsOpen(true),
      closeSettings: () => setSettingsOpen(false),
      save,
    };
  }, [stored, version, gpc, ready, settingsOpen, save]);

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent(): Ctx {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error('useConsent must be used within <ConsentProvider>');
  return ctx;
}

export function useConsentOptional(): Ctx | null {
  return useContext(ConsentContext);
}
