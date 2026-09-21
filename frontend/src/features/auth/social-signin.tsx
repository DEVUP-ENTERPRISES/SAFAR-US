'use client';

import { useEffect, useRef, useState } from 'react';
import { Phone, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { authApi } from './api';
import type { AuthResult } from './types';

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
export const APPLE_CLIENT_ID = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID ?? '';

/** The actual Apple mark — lucide's "Apple" is the fruit, not the brand glyph. */
function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 384 512" fill="currentColor" className={className} aria-hidden="true">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141 0 184.8 0 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-57.7-90-57.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
    </svg>
  );
}

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

  // Sign in with Apple JS — popup flow, no redirect route needed. Apple hands
  // back an identity token we verify server-side the same way as Google's.
  const [appleReady, setAppleReady] = useState(false);
  useEffect(() => {
    if (!APPLE_CLIENT_ID) return;
    const w = window as unknown as {
      AppleID?: {
        auth: {
          init(opts: { clientId: string; scope: string; redirectURI: string; usePopup: boolean }): void;
          signIn(): Promise<{ authorization: { id_token: string } }>;
        };
      };
    };
    const init = () => {
      if (!w.AppleID) return;
      w.AppleID.auth.init({
        clientId: APPLE_CLIENT_ID,
        scope: 'email name',
        redirectURI: window.location.origin,
        usePopup: true,
      });
      setAppleReady(true);
    };
    if (w.AppleID) return init();
    const script = document.createElement('script');
    script.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
    script.async = true;
    script.onload = init;
    document.head.appendChild(script);
  }, []);

  const signInWithApple = async () => {
    const w = window as unknown as { AppleID?: { auth: { signIn(): Promise<{ authorization: { id_token: string } }> } } };
    if (!w.AppleID) return;
    try {
      const res = await w.AppleID.auth.signIn();
      onSuccess(await authApi.apple(res.authorization.id_token));
    } catch (err) {
      // A cancelled popup rejects too — don't toast that as an error.
      const msg = err instanceof Error ? err.message : '';
      if (msg && msg !== 'popup_closed_by_user') {
        toast({ tone: 'error', title: 'Apple sign-in failed' });
      }
    }
  };

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

      {APPLE_CLIENT_ID && (
        <Button
          variant="outline"
          className="w-full"
          disabled={!appleReady}
          onClick={signInWithApple}
        >
          <AppleLogo className="h-4 w-4" /> Continue with Apple
        </Button>
      )}

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
