'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/** Tells the person when the connection drops and comes back; pending saves resume by themselves. */
export function ConnectionBanner() {
  const [state, setState] = useState<'online' | 'offline' | 'back'>('online');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offline = () => { clearTimeout(timer); setState('offline'); };
    const online = () => {
      setState((s) => (s === 'offline' ? 'back' : s));
      timer = setTimeout(() => setState('online'), 4_000);
    };
    if (!navigator.onLine) offline();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, []);

  if (state === 'online') return null;
  const off = state === 'offline';
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed inset-x-4 bottom-20 z-[90] mx-auto flex max-w-md items-start gap-3 rounded-lg border p-3 text-sm shadow-lg md:bottom-6',
        off ? 'border-destructive/30 bg-card' : 'border-success/30 bg-card',
      )}
    >
      {off ? <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />}
      <div className="min-w-0">
        <p className="font-semibold">{off ? 'You’re offline' : 'Back online'}</p>
        <p className="text-muted-foreground">
          {off ? 'Your work on this page is safe. Anything you save will go through once you’re reconnected.' : 'Everything on this page is up to date again.'}
        </p>
      </div>
    </div>
  );
}
