'use client';

import { useEffect, useRef, useState } from 'react';
import { Phone, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { authApi } from './api';
import type { AuthResult } from './types';

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

/**
 * Sign-in options beyond email + password.
 *
 * Both paths already existed on the API and were simply unreachable: the app
 * only ever offered a password. Phone especially matters for a US car
 * marketplace — a phone number is the thing a host actually needs to reach a
 * guest at pickup, so signing up with one is the shortest honest path.
 */
export function SocialSignIn({ onSuccess }: { onSuccess: (r: AuthResult) => void }) {
  const toast = useToast();
  const [phoneMode, setPhoneMode] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const googleRef = useRef<HTMLDivElement>(null);

  // Google Identity Services renders its own button and hands back an ID token
  // we exchange server-side. Loaded on demand so it costs nothing when unused.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleRef.current) return;
    // Narrow shapes for the two GIS calls we make, rather than pulling in types
    // for a script that is loaded at runtime.
    const w = window as unknown as {
      google?: {
        accounts?: {
          id?: {
            initialize(opts: { client_id: string; callback: (res: unknown) => void }): void;
            renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
          };
        };
      };
    };

    const render = () => {
      const id = w.google?.accounts?.id;
      if (!id || !googleRef.current) return;
      id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (res: unknown) => {
          const credential = (res as { credential?: string })?.credential;
          if (!credential) return;
          try {
            onSuccess(await authApi.google(credential));
          } catch (err) {
            toast({ tone: 'error', title: err instanceof Error ? err.message : 'Google sign-in failed' });
          }
        },
      });
      id.renderButton(googleRef.current, { theme: 'outline', size: 'large', width: 320, text: 'continue_with' });
    };

    if (w.google?.accounts?.id) return render();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [onSuccess, toast]);

  const sendCode = async () => {
    setBusy(true);
    try {
      await authApi.requestPhoneOtp(phone.trim());
      setSent(true);
      toast({ tone: 'success', title: `Code sent to ${phone}` });
    } catch (err) {
      toast({ tone: 'error', title: err instanceof Error ? err.message : 'Could not send the code' });
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      onSuccess(await authApi.verifyPhoneOtp(phone.trim(), code.trim()));
    } catch (err) {
      toast({ tone: 'error', title: err instanceof Error ? err.message : 'That code didn’t work' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">or continue with</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {GOOGLE_CLIENT_ID && <div ref={googleRef} className="flex justify-center" />}

      {!phoneMode ? (
        <Button variant="outline" className="w-full" onClick={() => setPhoneMode(true)}>
          <Phone className="h-4 w-4" /> Continue with phone
        </Button>
      ) : (
        <div className="space-y-3 rounded-xl border border-border p-4">
          {!sent ? (
            <>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 000 1234"
                inputMode="tel"
                autoFocus
              />
              <Button className="w-full" loading={busy} disabled={phone.trim().length < 6} onClick={sendCode}>
                Send code <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">We texted a 6-digit code to {phone}.</p>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                autoFocus
              />
              <Button className="w-full" loading={busy} disabled={code.length !== 6} onClick={verify}>
                Verify and continue
              </Button>
              <button onClick={() => setSent(false)} className="w-full text-xs text-muted-foreground hover:text-foreground">
                Use a different number
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
