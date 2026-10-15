'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, Mail, Phone, IdCard, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils/cn';

interface Eligibility { eligible: boolean; canRequest: boolean; blockers: string[]; messages: string[] }

const eligibilityApi = {
  get: () => api.get<Eligibility>('/bookings/eligibility'),
  send: (channel: 'email' | 'phone') => api.post<{ sent: boolean; to: string; via: string; devCode?: string; message?: string }>('/users/me/verify-contact/send', { channel }),
  confirm: (channel: 'email' | 'phone', code: string) => api.post<{ verified: boolean }>('/users/me/verify-contact/confirm', { channel, code }),
};

/** Confirm an email or mobile number in place: send a code, type it, done. */
function ContactStep({ channel, onDone }: { channel: 'email' | 'phone'; onDone: () => void }) {
  const toast = useToast();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const fail = (e: unknown) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'That did not work' });
  const send = useMutation({
    mutationFn: () => eligibilityApi.send(channel),
    onSuccess: (r) => {
      if (r.message) toast({ tone: r.sent ? 'info' : 'success', title: r.message });
      if (!r.sent) return onDone();
      setSentTo(r.to);
      if (r.devCode) setCode(r.devCode);
    },
    onError: fail,
  });
  const confirm = useMutation({
    mutationFn: () => eligibilityApi.confirm(channel, code),
    onSuccess: () => { toast({ tone: 'success', title: channel === 'email' ? 'Email confirmed' : 'Mobile number confirmed' }); onDone(); },
    onError: fail,
  });
  const Icon = channel === 'email' ? Mail : Phone;
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" /> Confirm your {channel === 'email' ? 'email address' : 'mobile number'}</p>
      {!sentTo ? (
        <Button size="sm" loading={send.isPending} onClick={() => send.mutate()}>Send me a code</Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-10 w-32" inputMode="numeric" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <Button size="sm" disabled={code.length !== 6} loading={confirm.isPending} onClick={() => confirm.mutate()}>Confirm</Button>
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => send.mutate()}>Resend</button>
          <span className="w-full text-xs text-muted-foreground">Sent to {sentTo}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Everything still standing between this guest and a trip, each with the action that clears it.
 * Without it a booking sat in "verifying" until it expired, and nothing told the guest why.
 */
export function BookingReadiness({ className, hideWhenReady = true }: { className?: string; hideWhenReady?: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['eligibility'], queryFn: () => eligibilityApi.get(), retry: false, refetchOnMount: 'always' });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['eligibility'] }); qc.invalidateQueries({ queryKey: ['booking'] }); qc.invalidateQueries({ queryKey: ['bookings'] }); };
  if (!q.data || (hideWhenReady && q.data.eligible)) return null;

  const b = q.data.blockers;
  const steps: { key: string; done: boolean; body: React.ReactNode }[] = [
    { key: 'email', done: !b.includes('email_unverified'), body: <ContactStep channel="email" onDone={refresh} /> },
    { key: 'phone', done: !b.includes('phone_unverified'), body: <ContactStep channel="phone" onDone={refresh} /> },
    {
      key: 'identity',
      done: !b.some((x) => x.startsWith('identity_') || x === 'licence_expired'),
      body: (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold"><IdCard className="h-4 w-4 text-primary" /> Verify your licence and identity</p>
          <Link href="/account/verify-identity"><Button size="sm">{b.includes('identity_pending') ? 'Check status' : 'Verify now'}</Button></Link>
        </div>
      ),
    },
  ];
  const other = q.data.messages.filter((_, i) => !['email_unverified', 'phone_unverified'].includes(b[i]) && !b[i].startsWith('identity_') && b[i] !== 'licence_expired');

  return (
    <section className={cn('rounded-2xl border border-warning/40 bg-warning/5 p-5', className)}>
      <p className="font-bold">{q.data.eligible ? 'You are ready to drive' : 'Finish these to get your car'}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">Your trip is held while you do. Each step takes under a minute.</p>
      <ol className="mt-4 space-y-4">
        {steps.map((s) => (
          <li key={s.key} className="flex gap-3">
            {s.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />}
            <div className={cn('min-w-0 flex-1', s.done && 'opacity-60')}>{s.done ? <p className="text-sm font-medium line-through">{s.key === 'identity' ? 'Identity verified' : s.key === 'email' ? 'Email confirmed' : 'Mobile number confirmed'}</p> : s.body}</div>
          </li>
        ))}
        {other.map((m) => (
          <li key={m} className="flex gap-3 text-sm"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" /> {m}</li>
        ))}
      </ol>
    </section>
  );
}
