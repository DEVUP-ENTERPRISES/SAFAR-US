'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Phone, Trash2, ShieldCheck, Monitor, Star, BadgeCheck, KeyRound, CreditCard, Bell } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { enablePush } from '@/features/push/use-push';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { accountApi } from '@/features/account/api';
import { AvatarUpload } from '@/components/ui/avatar-upload';

function Account() {
  const qc = useQueryClient();
  const router = useRouter();
  const confirm = useConfirm();
  const me = useQuery({ queryKey: ['me'], queryFn: () => accountApi.me() });
  const kyc = useQuery({ queryKey: ['kyc-status'], queryFn: () => accountApi.kycStatus() });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => accountApi.sessions() });
  const refreshMe = () => qc.invalidateQueries({ queryKey: ['me'] });

  const [profile, setProfile] = useState({ firstName: '', lastName: '', phone: '', dateOfBirth: '', avatarUrl: '' });
  useEffect(() => {
    if (me.data) setProfile({
      firstName: me.data.firstName ?? '', lastName: me.data.lastName ?? '', avatarUrl: me.data.avatarUrl ?? '',
      phone: me.data.phone ?? '', dateOfBirth: me.data.dateOfBirth ?? '',
    });
  }, [me.data]);

  const saveProfile = useMutation({
    mutationFn: () => accountApi.updateProfile({
      ...profile,
      dateOfBirth: profile.dateOfBirth || undefined,
      avatarUrl: profile.avatarUrl || undefined,
    }),
    onSuccess: refreshMe,
  });

  const [addr, setAddr] = useState({ label: '', line1: '', city: '', state: '', zip: '' });
  const addAddress = useMutation({
    mutationFn: () => accountApi.addAddress({ ...addr, country: 'USA' }),
    onSuccess: () => { setAddr({ label: '', line1: '', city: '', state: '', zip: '' }); refreshMe(); },
  });
  const removeAddress = useMutation({ mutationFn: (id: string) => accountApi.removeAddress(id), onSuccess: refreshMe });
  const defaultAddress = useMutation({ mutationFn: (id: string) => accountApi.setDefaultAddress(id), onSuccess: refreshMe });

  const [contact, setContact] = useState({ name: '', phone: '', relation: '' });
  const addContact = useMutation({
    mutationFn: () => accountApi.addContact(contact),
    onSuccess: () => { setContact({ name: '', phone: '', relation: '' }); refreshMe(); },
  });
  const removeContact = useMutation({ mutationFn: (id: string) => accountApi.removeContact(id), onSuccess: refreshMe });

  const revoke = useMutation({ mutationFn: (id: string) => accountApi.revokeSession(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }) });
  const logoutOthers = useMutation({ mutationFn: () => accountApi.logoutOthers(), onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }) });

  // MFA
  const mfa = useQuery({ queryKey: ['mfa'], queryFn: () => accountApi.mfaStatus() });
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [mfaToken, setMfaToken] = useState('');
  const startMfa = useMutation({ mutationFn: () => accountApi.mfaSetup(), onSuccess: (d) => setMfaSetup(d) });
  const enableMfa = useMutation({ mutationFn: () => accountApi.mfaEnable(mfaToken), onSuccess: () => { setMfaSetup(null); setMfaToken(''); qc.invalidateQueries({ queryKey: ['mfa'] }); } });
  const disableMfa = useMutation({ mutationFn: () => accountApi.mfaDisable(mfaToken), onSuccess: () => { setMfaToken(''); qc.invalidateQueries({ queryKey: ['mfa'] }); } });

  // Payment methods
  const cards = useQuery({ queryKey: ['payment-methods'], queryFn: () => accountApi.paymentMethods() });
  const [card, setCard] = useState({ brand: 'visa', last4: '', expMonth: 12, expYear: 2028 });
  const notify = useToast();
  const [enablingPush, setEnablingPush] = useState(false);
  const onEnablePush = async () => {
    setEnablingPush(true);
    try { await enablePush(notify); } finally { setEnablingPush(false); }
  };
  const addCard = useMutation({
    mutationFn: () => accountApi.savePaymentMethod(card),
    onSuccess: () => { setCard({ brand: 'visa', last4: '', expMonth: 12, expYear: 2028 }); qc.invalidateQueries({ queryKey: ['payment-methods'] }); },
  });
  const removeCard = useMutation({ mutationFn: (id: string) => accountApi.removePaymentMethod(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-methods'] }) });
  const defaultCard = useMutation({ mutationFn: (id: string) => accountApi.setDefaultPaymentMethod(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-methods'] }) });

  if (me.isLoading || !me.data) return <Skeleton className="h-96 w-full" />;

  const kycTone = kyc.data?.status === 'approved' ? 'success' : kyc.data?.status === 'rejected' ? 'destructive' : 'warning';

  return (
    <div className="mx-auto max-w-4xl space-y-10 sm:space-y-12 pb-24 px-4 sm:px-0">
      <PageHeader 
        title="Account Settings" 
        description="Manage your profile, identity verification, and payment methods."
      />

      {/* Identity verification */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Identity verification</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Badge tone={kycTone}>{kyc.data?.status ?? '…'}</Badge>
            {kyc.data?.reason && <p className="mt-1 text-xs text-destructive">{kyc.data.reason}</p>}
            <p className="mt-1 text-sm text-muted-foreground">Driver license + selfie verification for booking trust.</p>
          </div>
          {kyc.data?.status === 'pending' ? (
            <Button variant="outline" onClick={() => router.push('/account/verify-identity')}>View status</Button>
          ) : kyc.data?.status !== 'approved' && (
            <Button onClick={() => router.push('/account/verify-identity')}>
              <BadgeCheck className="h-4 w-4" /> {kyc.data?.status === 'rejected' ? 'Retry verification' : 'Verify identity'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Profile */}
      <Card>
        <CardHeader><CardTitle className="text-2xl">Profile details</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <AvatarUpload
            url={profile.avatarUrl || null}
            name={profile.firstName || me.data.email}
            onChange={(next) => setProfile((prev) => ({ ...prev, avatarUrl: next?.url ?? '' }))}
          />
          <div className="grid gap-6 sm:grid-cols-2">
          <Field label="First name"><Input value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} /></Field>
          <Field label="Last name"><Input value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} /></Field>
          <Field label="Phone"><Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="+1 555 000 1234" /></Field>
          <Field label="Date of birth"><Input type="date" value={profile.dateOfBirth} onChange={(e) => setProfile({ ...profile, dateOfBirth: e.target.value })} /></Field>
          <Field label="Email"><Input value={me.data.email ?? ''} disabled /></Field>
          <div className="flex items-end gap-3">
            <Button loading={saveProfile.isPending} onClick={() => saveProfile.mutate()}>Save profile</Button>
            {saveProfile.isSuccess && <span className="text-sm text-success">Saved ✓</span>}
          </div>
          </div>
        </CardContent>
      </Card>

      {/* Saved addresses */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-2xl"><MapPin className="h-6 w-6 text-primary" /> Saved addresses</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {me.data.addresses.map((a) => (
            <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl bg-muted/30 p-5 gap-4">
              <div>
                <p className="text-base font-bold">{a.label} {a.isDefault && <Badge tone="success" className="ml-2">Default</Badge>}</p>
                <p className="mt-1 text-sm text-muted-foreground">{a.line1}, {a.city} {a.state} {a.zip}</p>
              </div>
              <div className="flex gap-1">
                {!a.isDefault && <Button size="sm" variant="ghost" onClick={() => defaultAddress.mutate(a.id)}>Set default</Button>}
                <Button size="icon" variant="ghost" className="text-destructive" onClick={async () => { const { ok } = await confirm({ title: `Remove "${a.label}"?`, description: 'This saved address will be deleted.', confirmLabel: 'Remove address', tone: 'destructive' }); if (ok) removeAddress.mutate(a.id); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-5">
            <Input placeholder="Label" value={addr.label} onChange={(e) => setAddr({ ...addr, label: e.target.value })} />
            <Input placeholder="Street" value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} />
            <Input placeholder="City" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
            <Input placeholder="State" value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })} />
            <Input placeholder="ZIP" value={addr.zip} onChange={(e) => setAddr({ ...addr, zip: e.target.value })} />
          </div>
          <Button size="sm" disabled={!addr.label || !addr.line1 || !addr.city} loading={addAddress.isPending} onClick={() => addAddress.mutate()}>Add address</Button>
        </CardContent>
      </Card>

      {/* Emergency contacts */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5 text-primary" /> Emergency contacts</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {me.data.emergencyContacts.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div><p className="text-sm font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{c.phone}{c.relation ? ` · ${c.relation}` : ''}</p></div>
              <Button size="icon" variant="ghost" className="text-destructive" onClick={async () => { const { ok } = await confirm({ title: `Remove ${c.name}?`, description: 'This emergency contact will no longer be notified during a trip SOS.', confirmLabel: 'Remove contact', tone: 'destructive' }); if (ok) removeContact.mutate(c.id); }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-3">
            <Input placeholder="Name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            <Input placeholder="Phone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            <Input placeholder="Relation" value={contact.relation} onChange={(e) => setContact({ ...contact, relation: e.target.value })} />
          </div>
          <Button size="sm" disabled={!contact.name || !contact.phone} loading={addContact.isPending} onClick={() => addContact.mutate()}>Add contact</Button>
        </CardContent>
      </Card>

      {/* Two-factor authentication */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /> Two-factor authentication</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {mfa.data?.enabled ? (
            <div className="space-y-3">
              <Badge tone="success">Enabled</Badge>
              <p className="text-sm text-muted-foreground">Enter a code from your authenticator app to disable.</p>
              <div className="flex gap-2">
                <Input value={mfaToken} onChange={(e) => setMfaToken(e.target.value)} placeholder="6-digit code" className="max-w-[140px]" />
                <Button variant="outline" className="text-destructive" disabled={mfaToken.length !== 6} loading={disableMfa.isPending} onClick={async () => { const { ok } = await confirm({ title: 'Disable two-factor authentication?', description: 'Your account will be significantly less secure. Anyone with your password can sign in.', confirmLabel: 'Disable 2FA', tone: 'destructive', requireText: 'DISABLE' }); if (ok) disableMfa.mutate(); }}>Disable 2FA</Button>
              </div>
            </div>
          ) : mfaSetup ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Add this secret to your authenticator app (Google Authenticator, Authy), then enter a code to confirm.</p>
              <code className="block break-all rounded-md bg-muted p-2 text-xs">{mfaSetup.secret}</code>
              <div className="flex gap-2">
                <Input value={mfaToken} onChange={(e) => setMfaToken(e.target.value)} placeholder="6-digit code" className="max-w-[140px]" />
                <Button disabled={mfaToken.length !== 6} loading={enableMfa.isPending} onClick={() => enableMfa.mutate()}>Confirm &amp; enable</Button>
              </div>
              {enableMfa.isError && <p className="text-sm text-destructive">Invalid code — try again.</p>}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Protect your account with an authenticator app.</p>
              <Button loading={startMfa.isPending} onClick={() => startMfa.mutate()}>Set up 2FA</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-primary" /> Notifications</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Get alerts on this device for booking updates, messages and trip reminders.</p>
            <Button variant="outline" loading={enablingPush} onClick={onEnablePush}>Enable on this device</Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <p className="text-sm text-muted-foreground">Choose channels and topics — push, email, SMS, quiet hours.</p>
            <Button variant="outline" onClick={() => router.push('/account/notifications')}>Manage preferences</Button>
          </div>
        </CardContent>
      </Card>

      {/* Payment methods */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Payment methods</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {cards.data?.map((c) => (
            <div key={c._id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium capitalize">{c.brand} •••• {c.last4} {c.isDefault && <Badge tone="success" className="ml-1">Default</Badge>}</p>
                <p className="text-xs text-muted-foreground">Expires {c.expMonth}/{c.expYear}</p>
              </div>
              <div className="flex gap-1">
                {!c.isDefault && <Button size="sm" variant="ghost" onClick={() => defaultCard.mutate(c._id)}>Set default</Button>}
                <Button size="icon" variant="ghost" className="text-destructive" onClick={async () => { const { ok } = await confirm({ title: `Remove card ending ${c.last4}?`, description: 'You will need to re-add it to pay with this card again.', confirmLabel: 'Remove card', tone: 'destructive' }); if (ok) removeCard.mutate(c._id); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-4">
            <select value={card.brand} onChange={(e) => setCard({ ...card, brand: e.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm capitalize">
              {['visa', 'mastercard', 'amex', 'discover'].map((b) => <option key={b}>{b}</option>)}
            </select>
            <Input placeholder="Last 4" maxLength={4} value={card.last4} onChange={(e) => setCard({ ...card, last4: e.target.value })} />
            <Input type="number" placeholder="MM" value={card.expMonth} onChange={(e) => setCard({ ...card, expMonth: Number(e.target.value) })} />
            <Input type="number" placeholder="YYYY" value={card.expYear} onChange={(e) => setCard({ ...card, expYear: Number(e.target.value) })} />
          </div>
          <Button size="sm" disabled={card.last4.length !== 4} loading={addCard.isPending} onClick={() => addCard.mutate()}>Add card</Button>
          <p className="text-xs text-muted-foreground">Cards are stored via your payment provider — full card numbers never touch CATO servers.</p>
        </CardContent>
      </Card>

      {/* Security / devices */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Monitor className="h-5 w-5 text-primary" /> Devices &amp; sessions</CardTitle>
          <Button size="sm" variant="outline" loading={logoutOthers.isPending} onClick={async () => { const { ok } = await confirm({ title: 'Log out all other devices?', description: 'Every other session will be signed out immediately. This device stays signed in.', confirmLabel: 'Log out others', tone: 'destructive' }); if (ok) logoutOthers.mutate(); }}>Log out other devices</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {sessions.isLoading && <Skeleton className="h-16 w-full" />}
          {sessions.data?.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">
                  {shortUa(s.userAgent)} {s.current && <Badge tone="success" className="ml-1"><Star className="mr-1 h-3 w-3" /> This device</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">{s.ip ?? 'unknown IP'} · since {formatDate(s.createdAt)}</p>
              </div>
              {!s.current && <Button size="sm" variant="ghost" className="text-destructive" loading={revoke.isPending} onClick={async () => { const { ok } = await confirm({ title: 'Revoke this session?', description: 'That device will be signed out immediately.', confirmLabel: 'Revoke session', tone: 'destructive' }); if (ok) revoke.mutate(s.id); }}>Revoke</Button>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function shortUa(ua?: string): string {
  if (!ua) return 'Unknown device';
  if (/mobile/i.test(ua)) return 'Mobile browser';
  if (/chrome/i.test(ua)) return 'Chrome';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  return ua.slice(0, 40);
}

export default function AccountPage() {
  return <AuthGuard><Account /></AuthGuard>;
}
