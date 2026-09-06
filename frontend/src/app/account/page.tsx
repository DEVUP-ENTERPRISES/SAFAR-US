'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Phone, Trash2, ShieldCheck, Monitor, Star, BadgeCheck, KeyRound, CreditCard, Bell } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { formatDate } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { accountApi } from '@/features/account/api';
import { AddCard } from '@/features/payments/add-card';
import { AvatarUpload } from '@/components/ui/avatar-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Field } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { enablePush } from '@/features/push/use-push';

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
  const notify = useToast();
  const [enablingPush, setEnablingPush] = useState(false);
  const onEnablePush = async () => {
    setEnablingPush(true);
    try { await enablePush(notify); } finally { setEnablingPush(false); }
  };
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
      <section className="bg-muted/30 rounded-3xl p-6 sm:p-8 border border-border/40">
        <h2 className="flex items-center gap-2 text-xl font-bold mb-6"><ShieldCheck className="h-6 w-6 text-primary" /> Identity verification</h2>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div>
            <Badge tone={kycTone} className="mb-2 uppercase tracking-widest text-[10px]">{kyc.data?.status ?? '…'}</Badge>
            {kyc.data?.reason && <p className="mt-1 text-sm font-semibold text-destructive">{kyc.data.reason}</p>}
            <p className="mt-1 text-base font-medium text-muted-foreground">Driver license + selfie verification for booking trust.</p>
          </div>
          {kyc.data?.status === 'pending' ? (
            <Button size="lg" variant="outline" className="rounded-full w-full sm:w-auto font-bold" onClick={() => router.push('/account/verify-identity')}>View status</Button>
          ) : kyc.data?.status !== 'approved' && (
            <Button size="lg" className="rounded-full w-full sm:w-auto font-bold" onClick={() => router.push('/account/verify-identity')}>
              <BadgeCheck className="h-5 w-5 mr-2" /> {kyc.data?.status === 'rejected' ? 'Retry verification' : 'Verify identity'}
            </Button>
          )}
        </div>
      </section>

      {/* Profile */}
      <section className="bg-muted/30 rounded-3xl p-6 sm:p-8 border border-border/40">
        <h2 className="text-xl font-bold mb-6">Profile details</h2>
        <div className="space-y-8">
          <AvatarUpload
            url={profile.avatarUrl || null}
            name={profile.firstName || me.data.email}
            onChange={(next) => setProfile((prev) => ({ ...prev, avatarUrl: next?.url ?? '' }))}
          />
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="First name"><Input className="h-12 rounded-xl text-base" value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} /></Field>
            <Field label="Last name"><Input className="h-12 rounded-xl text-base" value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} /></Field>
            <Field label="Phone"><Input className="h-12 rounded-xl text-base" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="+1 555 000 1234" /></Field>
            <Field label="Date of birth"><Input className="h-12 rounded-xl text-base" type="date" value={profile.dateOfBirth} onChange={(e) => setProfile({ ...profile, dateOfBirth: e.target.value })} /></Field>
            <Field label="Email"><Input className="h-12 rounded-xl text-base opacity-70" value={me.data.email ?? ''} disabled /></Field>
            <div className="flex items-end gap-4 h-full pt-6">
              <Button size="lg" className="rounded-xl w-full sm:w-auto font-bold" loading={saveProfile.isPending} onClick={() => saveProfile.mutate()}>Save profile</Button>
              {saveProfile.isSuccess && <span className="text-sm font-bold text-success mb-3">Saved ✓</span>}
            </div>
          </div>
        </div>
      </section>

      {/* Saved addresses */}
      <section className="bg-muted/30 rounded-3xl p-6 sm:p-8 border border-border/40">
        <h2 className="flex items-center gap-2 text-xl font-bold mb-6"><MapPin className="h-6 w-6 text-primary" /> Saved addresses</h2>
        <div className="space-y-5">
          {me.data.addresses.map((a) => (
            <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-2xl bg-background p-5 gap-4 border border-border/40 shadow-sm">
              <div className="min-w-0">
                <p className="text-base font-bold flex flex-wrap items-center gap-x-2 gap-y-1">{a.label} {a.isDefault && <Badge tone="success" className="ms-3 text-[10px] uppercase tracking-widest">Default</Badge>}</p>
                <p className="mt-1.5 text-sm font-medium text-muted-foreground">{a.line1}, {a.city} {a.state} {a.zip}</p>
              </div>
              <div className="flex items-center gap-2">
                {!a.isDefault && <Button size="sm" variant="outline" className="rounded-full font-semibold" onClick={() => defaultAddress.mutate(a.id)}>Set default</Button>}
                <Button size="icon" variant="ghost" className="text-destructive rounded-full hover:bg-destructive/10" onClick={async () => { const { ok } = await confirm({ title: `Remove "${a.label}"?`, description: 'This saved address will be deleted.', confirmLabel: 'Remove address', tone: 'destructive' }); if (ok) removeAddress.mutate(a.id); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 mt-4">
            <Input className="h-12 rounded-xl" placeholder="Label" value={addr.label} onChange={(e) => setAddr({ ...addr, label: e.target.value })} />
            <Input className="h-12 rounded-xl" placeholder="Street" value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} />
            <Input className="h-12 rounded-xl" placeholder="City" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
            <Input className="h-12 rounded-xl" placeholder="State" value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })} />
            <Input className="h-12 rounded-xl" placeholder="ZIP" value={addr.zip} onChange={(e) => setAddr({ ...addr, zip: e.target.value })} />
          </div>
          <Button size="lg" className="rounded-xl w-full sm:w-auto font-bold mt-2" disabled={!addr.label || !addr.line1 || !addr.city} loading={addAddress.isPending} onClick={() => addAddress.mutate()}>Add address</Button>
        </div>
      </section>

      {/* Emergency contacts */}
      <section className="bg-muted/30 rounded-3xl p-6 sm:p-8 border border-border/40">
        <h2 className="flex items-center gap-2 text-xl font-bold mb-6"><Phone className="h-6 w-6 text-primary" /> Emergency contacts</h2>
        <div className="space-y-4">
          {me.data.emergencyContacts.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-2xl bg-background p-4 gap-4 border border-border/40 shadow-sm">
              <div className="min-w-0"><p className="text-base font-bold">{c.name}</p><p className="text-sm font-medium text-muted-foreground mt-0.5">{c.phone}{c.relation ? ` · ${c.relation}` : ''}</p></div>
              <Button size="icon" variant="ghost" className="text-destructive rounded-full hover:bg-destructive/10 shrink-0" onClick={async () => { const { ok } = await confirm({ title: `Remove ${c.name}?`, description: 'This emergency contact will no longer be notified during a trip SOS.', confirmLabel: 'Remove contact', tone: 'destructive' }); if (ok) removeContact.mutate(c.id); }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mt-4">
            <Input className="h-12 rounded-xl" placeholder="Name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            <Input className="h-12 rounded-xl" placeholder="Phone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            <Input className="h-12 rounded-xl" placeholder="Relation" value={contact.relation} onChange={(e) => setContact({ ...contact, relation: e.target.value })} />
          </div>
          <Button size="lg" className="rounded-xl w-full sm:w-auto font-bold mt-2" disabled={!contact.name || !contact.phone} loading={addContact.isPending} onClick={() => addContact.mutate()}>Add contact</Button>
        </div>
      </section>

      {/* Two-factor authentication */}
      <section className="bg-muted/30 rounded-3xl p-6 sm:p-8 border border-border/40">
        <h2 className="flex items-center gap-2 text-xl font-bold mb-6"><KeyRound className="h-6 w-6 text-primary" /> Two-factor authentication</h2>
        <div className="space-y-4">
          {mfa.data?.enabled ? (
            <div className="space-y-4">
              <Badge tone="success" className="px-3 py-1 uppercase tracking-widest text-[10px]">Enabled</Badge>
              <p className="text-base font-medium text-muted-foreground">Enter a code from your authenticator app to disable.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input className="h-12 rounded-xl text-lg tracking-widest" value={mfaToken} onChange={(e) => setMfaToken(e.target.value)} placeholder="000000" maxLength={6} />
                <Button size="lg" variant="outline" className="text-destructive font-bold rounded-xl" disabled={mfaToken.length !== 6} loading={disableMfa.isPending} onClick={async () => { const { ok } = await confirm({ title: 'Disable two-factor authentication?', description: 'Your account will be significantly less secure. Anyone with your password can sign in.', confirmLabel: 'Disable 2FA', tone: 'destructive', requireText: 'DISABLE' }); if (ok) disableMfa.mutate(); }}>Disable 2FA</Button>
              </div>
            </div>
          ) : mfaSetup ? (
            <div className="space-y-4">
              <p className="text-base font-medium text-muted-foreground">Add this secret to your authenticator app (Google Authenticator, Authy), then enter a code to confirm.</p>
              <code className="block break-all rounded-xl bg-background p-4 text-base font-mono border border-border/40 shadow-sm">{mfaSetup.secret}</code>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input className="h-12 rounded-xl text-lg tracking-widest" value={mfaToken} onChange={(e) => setMfaToken(e.target.value)} placeholder="000000" maxLength={6} />
                <Button size="lg" className="rounded-xl font-bold" disabled={mfaToken.length !== 6} loading={enableMfa.isPending} onClick={() => enableMfa.mutate()}>Confirm &amp; enable</Button>
              </div>
              {enableMfa.isError && <p className="text-sm font-bold text-destructive">Invalid code — try again.</p>}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <p className="text-base font-medium text-muted-foreground">Protect your account with an authenticator app.</p>
              <Button size="lg" className="rounded-full font-bold w-full sm:w-auto" loading={startMfa.isPending} onClick={() => startMfa.mutate()}>Set up 2FA</Button>
            </div>
          )}
        </div>
      </section>

      {/* Notifications */}
      <section className="bg-muted/30 rounded-3xl p-6 sm:p-8 border border-border/40">
        <h2 className="flex items-center gap-2 text-xl font-bold mb-6"><Bell className="h-6 w-6 text-primary" /> Notifications</h2>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <p className="text-base font-medium text-muted-foreground">Get alerts on this device for booking updates, messages and trip reminders.</p>
            <Button size="lg" variant="outline" className="rounded-full font-bold w-full sm:w-auto" loading={enablingPush} onClick={onEnablePush}>Enable on this device</Button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 border-t border-border/40 pt-6">
            <p className="text-base font-medium text-muted-foreground">Choose channels and topics — push, email, SMS, quiet hours.</p>
            <Button size="lg" variant="outline" className="rounded-full font-bold w-full sm:w-auto" onClick={() => router.push('/account/notifications')}>Manage preferences</Button>
          </div>
        </div>
      </section>

      {/* Payment methods */}
      <section className="bg-muted/30 rounded-3xl p-6 sm:p-8 border border-border/40">
        <h2 className="flex items-center gap-2 text-xl font-bold mb-6"><CreditCard className="h-6 w-6 text-primary" /> Payment methods</h2>
        <div className="space-y-4">
          {cards.data?.map((c) => (
            <div key={c._id} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-2xl bg-background p-5 gap-4 border border-border/40 shadow-sm">
              <div className="min-w-0">
                <p className="text-base font-bold capitalize flex flex-wrap items-center gap-x-2 gap-y-1">{c.brand} •••• {c.last4} {c.isDefault && <Badge tone="success" className="ms-3 text-[10px] uppercase tracking-widest">Default</Badge>}</p>
                <p className="mt-1 text-sm font-medium text-muted-foreground">Expires {c.expMonth}/{c.expYear}</p>
              </div>
              <div className="flex items-center gap-2">
                {!c.isDefault && <Button size="sm" variant="outline" className="rounded-full font-semibold" onClick={() => defaultCard.mutate(c._id)}>Set default</Button>}
                <Button size="icon" variant="ghost" className="text-destructive rounded-full hover:bg-destructive/10" onClick={async () => { const { ok } = await confirm({ title: `Remove card ending ${c.last4}?`, description: 'You will need to re-add it to pay with this card again.', confirmLabel: 'Remove card', tone: 'destructive' }); if (ok) removeCard.mutate(c._id); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
          <div className="mt-6 border-t border-border/40 pt-6">
            <AddCard onSaved={() => qc.invalidateQueries({ queryKey: ['payment-methods'] })} />
          </div>
        </div>
      </section>

      {/* Security / devices */}
      <section className="bg-muted/30 rounded-3xl p-6 sm:p-8 border border-border/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6">
          <h2 className="flex items-center gap-2 text-xl font-bold"><Monitor className="h-6 w-6 text-primary" /> Devices &amp; sessions</h2>
          <Button size="sm" variant="outline" className="rounded-full font-bold w-full sm:w-auto" loading={logoutOthers.isPending} onClick={async () => { const { ok } = await confirm({ title: 'Log out all other devices?', description: 'Every other session will be signed out immediately. This device stays signed in.', confirmLabel: 'Log out others', tone: 'destructive' }); if (ok) logoutOthers.mutate(); }}>Log out other devices</Button>
        </div>
        <div className="space-y-3">
          {sessions.isLoading && <Skeleton className="h-20 w-full rounded-2xl" />}
          {sessions.data?.map((s) => (
            <div key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-2xl bg-background p-5 gap-4 border border-border/40 shadow-sm">
              <div className="min-w-0">
                <p className="text-base font-bold flex flex-wrap items-center gap-x-2 gap-y-1">
                  {shortUa(s.userAgent)} {s.current && <Badge tone="success" className="ms-3 text-[10px] uppercase tracking-widest"><Star className="me-1 h-3 w-3 inline" /> This device</Badge>}
                </p>
                <p className="mt-1 text-sm font-medium text-muted-foreground">{s.ip ?? 'unknown IP'} · since {formatDate(s.createdAt)}</p>
              </div>
              {!s.current && <Button size="sm" variant="ghost" className="text-destructive font-bold rounded-full hover:bg-destructive/10" loading={revoke.isPending} onClick={async () => { const { ok } = await confirm({ title: 'Revoke this session?', description: 'That device will be signed out immediately.', confirmLabel: 'Revoke session', tone: 'destructive' }); if (ok) revoke.mutate(s.id); }}>Revoke</Button>}
            </div>
          ))}
        </div>
      </section>
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
