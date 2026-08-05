'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bell, Smartphone, Mail, MessageSquare, Moon, ShieldCheck } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils/cn';
import { accountApi, type NotificationPrefs, type NotificationCategory } from '@/features/account/api';

const CHANNELS = [
  { key: 'push' as const, icon: Smartphone, label: 'Push', detail: 'On your phone and browser.' },
  { key: 'email' as const, icon: Mail, label: 'Email', detail: 'To your account address.' },
  { key: 'sms' as const, icon: MessageSquare, label: 'SMS', detail: 'Text messages for time-sensitive updates.' },
];

const TOPICS: { key: NotificationCategory; label: string; detail: string }[] = [
  { key: 'trips', label: 'Trips', detail: 'Bookings, pick-up/return, changes, reminders.' },
  { key: 'messages', label: 'Messages', detail: 'When your host or guest messages you.' },
  { key: 'payments', label: 'Payments & payouts', detail: 'Charges, refunds, receipts, earnings.' },
  { key: 'reviews', label: 'Reviews', detail: 'When a review is left or is due.' },
  { key: 'promotions', label: 'Promotions & tips', detail: 'Deals, credits, and product news.' },
];

function NotificationSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const prefs = useQuery({ queryKey: ['notification-prefs'], queryFn: () => accountApi.notificationPrefs() });

  const [draft, setDraft] = useState<NotificationPrefs>({});
  useEffect(() => { if (prefs.data) setDraft(prefs.data); }, [prefs.data]);

  const save = useMutation({
    mutationFn: () => accountApi.updateNotificationPrefs(draft),
    onSuccess: (d) => { qc.setQueryData(['notification-prefs'], d); toast({ title: 'Preferences saved', tone: 'success' }); },
    onError: () => toast({ title: 'Could not save preferences', tone: 'error' }),
  });

  // Opt-out model: a missing value means "on".
  const on = (v?: boolean) => v !== false;
  const setChannel = (k: 'push' | 'email' | 'sms' | 'smsCriticalOnly' | 'quietHours', v: boolean) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const setTopic = (k: NotificationCategory, v: boolean) =>
    setDraft((d) => ({ ...d, categories: { ...d.categories, [k]: v } }));

  if (prefs.isLoading) {
    return <div className="mx-auto max-w-2xl space-y-4 p-6"><Skeleton className="h-40 w-full" /><Skeleton className="h-56 w-full" /></div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <Link href="/account" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to account
      </Link>
      <PageHeader title="Notifications" description="Choose how and about what we reach you. Critical safety and security alerts are always sent." />

      {/* Channels */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Bell className="h-5 w-5 text-primary" /> Channels</CardTitle></CardHeader>
        <CardContent className="divide-y divide-border">
          {CHANNELS.map((c) => (
            <Row key={c.key} icon={<c.icon className="h-5 w-5 text-muted-foreground" />} label={c.label} detail={c.detail}>
              <Toggle checked={on(draft[c.key])} onChange={(v) => setChannel(c.key, v)} label={c.label} />
            </Row>
          ))}
          {/* SMS is billed per message — let cost-conscious users cap it to the essentials. */}
          {on(draft.sms) && (
            <Row icon={<MessageSquare className="h-5 w-5 text-muted-foreground" />} label="Only critical SMS" detail="Skip routine texts; still get urgent ones like security codes.">
              <Toggle checked={draft.smsCriticalOnly === true} onChange={(v) => setChannel('smsCriticalOnly', v)} label="Only critical SMS" />
            </Row>
          )}
        </CardContent>
      </Card>

      {/* Quiet hours */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Moon className="h-5 w-5 text-primary" /> Quiet hours</CardTitle></CardHeader>
        <CardContent>
          <Row icon={<Moon className="h-5 w-5 text-muted-foreground" />} label="Pause non-urgent notifications overnight" detail="Uses your local time zone. Urgent alerts still come through.">
            <Toggle checked={draft.quietHours === true} onChange={(v) => setChannel('quietHours', v)} label="Quiet hours" />
          </Row>
        </CardContent>
      </Card>

      {/* Topics */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Topics</CardTitle></CardHeader>
        <CardContent className="divide-y divide-border">
          {TOPICS.map((t) => (
            <Row key={t.key} label={t.label} detail={t.detail}>
              <Toggle checked={on(draft.categories?.[t.key])} onChange={(v) => setTopic(t.key, v)} label={t.label} />
            </Row>
          ))}
          <Row
            icon={<ShieldCheck className="h-5 w-5 text-success" />}
            label="Security & account"
            detail="Login alerts, verification, and safety notices — always on."
          >
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Always on</span>
          </Row>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button loading={save.isPending} onClick={() => save.mutate()}>Save preferences</Button>
        <span className="text-xs text-muted-foreground">Applies across every channel above.</span>
      </div>
    </div>
  );
}

function Row({ icon, label, detail, children }: { icon?: React.ReactNode; label: string; detail: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="flex items-start gap-3">
        {icon && <span className="mt-0.5">{icon}</span>}
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
      )}
    >
      <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

export default function Page() {
  return (
    <AuthGuard>
      <NotificationSettings />
    </AuthGuard>
  );
}
