'use client';

import { useEffect, useState } from 'react';
import { Download, Share, Plus, MoreVertical, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInstallState } from './install-store';

/** Sits on the profile page for anyone who has not installed the app, so a dismissed popup is never a lost chance. Gone for good once installed. */
export function InstallAppCard() {
  const { state, install } = useInstallState();
  // The state comes from the browser, so wait for the client before deciding whether to show anything.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready || state === 'installed') return null;

  return (
    <section className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Smartphone className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-bold">Get the CatoDrive app</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Book faster, get trip alerts and keep everything one tap away on your home screen. No app store needed.
            </p>
            {state === 'ios' && (
              <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                In Safari, tap <Share className="h-4 w-4" /> <span className="font-semibold">Share</span>, then <Plus className="h-4 w-4" />
                <span className="font-semibold">Add to Home Screen</span>.
              </p>
            )}
            {state === 'manual' && (
              <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                Open your browser menu <MoreVertical className="h-4 w-4" /> and choose <span className="font-semibold">Install app</span> or <span className="font-semibold">Add to Home screen</span>.
              </p>
            )}
          </div>
        </div>
        {state === 'native' && (
          <Button size="lg" className="rounded-xl font-bold" onClick={install}>
            <Download className="h-4 w-4" /> Install app
          </Button>
        )}
      </div>
    </section>
  );
}
