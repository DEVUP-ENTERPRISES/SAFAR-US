'use client';

import { ShieldCheck, Car, Smartphone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import type { TabProps } from './shared';

export function SafetyTab({ draft, set }: TabProps) {
  return (
    <>
        <>
      {draft.appRelease && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-primary" /> Mobile apps</CardTitle>
            <p className="text-sm text-muted-foreground">An app older than the minimum version must update before it can be used. Older than the latest version, it shows an "update available" banner.</p>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            {(['customer', 'partner'] as const).map((app) => (
              <div key={app} className="space-y-3">
                <p className="font-semibold">{app === 'customer' ? 'CatoDrive (guests)' : 'CatoDrive Partner (hosts and partners)'}</p>
                <Field label="Minimum version" hint="Like 1.2.0. Older apps are blocked until updated.">
                  <Input value={draft.appRelease![app].minVersion}
                    onChange={(e) => set((d) => { d.appRelease![app].minVersion = e.target.value.trim(); })} />
                </Field>
                <Field label="Latest version" hint="The version in the stores now.">
                  <Input value={draft.appRelease![app].latestVersion}
                    onChange={(e) => set((d) => { d.appRelease![app].latestVersion = e.target.value.trim(); })} />
                </Field>
                <Field label="Google Play link">
                  <Input value={draft.appRelease![app].androidUrl} placeholder="https://play.google.com/store/apps/details?id=…"
                    onChange={(e) => set((d) => { d.appRelease![app].androidUrl = e.target.value.trim(); })} />
                </Field>
                <Field label="App Store link">
                  <Input value={draft.appRelease![app].iosUrl} placeholder="https://apps.apple.com/app/…"
                    onChange={(e) => set((d) => { d.appRelease![app].iosUrl = e.target.value.trim(); })} />
                </Field>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
        </>
        <>
      {/* Abuse limits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Abuse limits</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Stops someone using the platform to test stolen card numbers. Applies to topping up the wallet, saving a card,
            booking and paying.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Card attempts per member per hour">
            <Input type="number" min={1} max={500} value={draft.security.cardAttemptsPerHour}
              onChange={(e) => set((d) => { d.security.cardAttemptsPerHour = Number(e.target.value); })} />
          </Field>
          <Field label="Wrong passwords or codes before an account locks">
            <Input type="number" min={3} max={50} value={draft.security.loginAttemptsPerAccount}
              onChange={(e) => set((d) => { d.security.loginAttemptsPerAccount = Number(e.target.value); })} />
          </Field>
          <Field label="Base lockout (minutes, doubles on repeat)">
            <Input type="number" min={1} max={1440} value={draft.security.loginLockoutMinutes}
              onChange={(e) => set((d) => { d.security.loginLockoutMinutes = Number(e.target.value); })} />
          </Field>
          <Field label="Seconds a used sign-in token can be retried" hint="Keeps people signed in when a restart drops a reply. 0 = strict.">
            <Input type="number" min={0} max={600} value={draft.security.refreshRetryLeewaySeconds ?? 60}
              onChange={(e) => set((d) => { d.security.refreshRetryLeewaySeconds = Number(e.target.value); })} />
          </Field>
          <Field label="Countries we text (calling codes)" hint="Comma separated, e.g. +1. Texts to anywhere else are refused, which stops SMS fraud.">
            <Input defaultValue={(draft.security.smsAllowedPrefixes ?? ['+1']).join(', ')}
              onBlur={(e) => set((d) => { d.security.smsAllowedPrefixes = e.target.value.split(',').map((x) => x.trim()).filter((x) => /^\+\d{1,4}$/.test(x)); })} />
          </Field>
          <Field label="Largest upload (MB)">
            <Input type="number" min={1} max={50} value={draft.security.maxUploadMb}
              onChange={(e) => set((d) => { d.security.maxUploadMb = Number(e.target.value); })} />
          </Field>
          <Field label="Upload links per member per hour">
            <Input type="number" min={5} max={1000} value={draft.security.uploadUrlsPerHour}
              onChange={(e) => set((d) => { d.security.uploadUrlsPerHour = Number(e.target.value); })} />
          </Field>
        </CardContent>
      </Card>
        </>
    </>
  );
}
