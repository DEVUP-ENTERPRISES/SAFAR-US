'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Logo } from '@/components/layout/logo';
import { authApi } from '@/features/auth/api';
import { ApiError } from '@/lib/api/types';

// The consumer app's own domain — Host's dashboard pages live there, not here.
const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

/**
 * House Fleet's own sign-in. No admin session needed — this is a real
 * email+password login against the seeded fleet account, same /auth/login
 * every guest and host uses. Success hands off into the real Host dashboard.
 */
export default function HouseFleetLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await authApi.login({ email, password });
      if (!result.user.roles.includes('host')) {
        setError('This account is not the House Fleet account.');
        setBusy(false);
        return;
      }
      const url = new URL('/host/bridge', WEB_URL);
      // Fragment, not query: it is never sent to a server, logged, or leaked through Referer.
      url.hash = new URLSearchParams({ at: result.tokens.accessToken, rt: result.tokens.refreshToken }).toString();
      window.location.href = url.toString();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in');
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-subtle/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo className="mb-2 h-10 w-10" />
          <CardTitle>House Fleet</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">CatoDrive&apos;s own vehicles</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
