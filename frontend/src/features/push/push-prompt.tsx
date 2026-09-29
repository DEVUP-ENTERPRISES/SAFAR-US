'use client';

import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { pushConfigured } from './firebase';
import { enablePush } from './use-push';

/** Asks once per browser to turn on push, for people who must not miss a message (hosts and new requests). */
export function PushPrompt({ title, detail }: { title: string; detail: string }) {
  const notify = useToast();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      if (!pushConfigured() || typeof Notification === 'undefined' || Notification.permission === 'denied') return;
      setShow(Notification.permission !== 'granted' || !localStorage.getItem('cato_push_token'));
    } catch {
      /* storage or notifications unavailable: nothing to offer */
    }
  }, []);

  if (!show) return null;

  const turnOn = async () => {
    setBusy(true);
    try {
      if (await enablePush(notify)) setShow(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4">
      <BellRing className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <Button size="sm" loading={busy} onClick={turnOn}>Turn on</Button>
    </div>
  );
}
