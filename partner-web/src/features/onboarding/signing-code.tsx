'use client';

import { useEffect, useState } from 'react';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { assetPartnerApi } from '@/features/asset-partners/api';
import { ApiError } from '@/lib/api/types';

const RESEND_SECONDS = 30;

/** The signer's second factor, as an e-signature service asks for: a 6-digit code emailed at the moment of signing. */
export function SigningCode({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await assetPartnerApi.sendSigningCode();
      setSentTo(res.sentTo);
      setWait(RESEND_SECONDS);
      onChange('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'We couldn’t send the code. Try again in a moment.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <p className="flex items-start gap-2 text-sm">
        <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span>To confirm it’s you signing, we email a 6-digit code to your account address. It’s recorded on the signing certificate.</span>
      </p>
      {sentTo ? (
        <Field label={`Code sent to ${sentTo}`} htmlFor="signing-code" hint="It expires in 5 minutes.">
          <div className="flex gap-2">
            <Input id="signing-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} className="max-w-36 font-mono tracking-widest tabular-nums" />
            <Button type="button" variant="ghost" disabled={wait > 0} loading={sending} onClick={() => void send()}>
              {wait > 0 ? `Resend in ${wait}s` : 'Send a new code'}
            </Button>
          </div>
        </Field>
      ) : (
        <Button type="button" variant="outline" loading={sending} onClick={() => void send()}>Email me a signing code</Button>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
