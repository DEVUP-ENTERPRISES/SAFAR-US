'use client';

import { useEffect, useState, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, History, RotateCcw, Car } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { TabBar, useTabParam } from '@/features/admin/components/page-tabs';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ApiError } from '@/lib/api/types';
import { adminApi, type PlatformConfig } from '@/features/admin/api';
import { FeesTab } from './fees-tab';
import { PayoutsTab } from './payouts-tab';
import { RulesTab } from './rules-tab';
import { ChecksTab } from './checks-tab';
import { SafetyTab } from './safety-tab';

const TABS = [
  { key: 'fees', label: 'Fees & charges', about: 'What guests pay: the service fee, deposit, cancellations, charges after a trip and protection plans.' },
  { key: 'payouts', label: 'Payouts & rewards', about: 'When hosts are paid, and what guests earn in rewards.' },
  { key: 'rules', label: 'Booking & trip rules', about: 'How long each booking step may wait, trip photos, handovers, extensions and swaps.' },
  { key: 'checks', label: 'Guest checks', about: 'Who can book: age and licence rules, and when identity and driving checks run.' },
  { key: 'safety', label: 'Safety & app', about: 'Limits that stop abuse, and the mobile app versions guests and hosts must run.' },
  { key: 'history', label: 'History', about: 'Every saved change, with the option to roll back to an earlier version.' },
];

export default function AdminEconomicsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
      <Economics />
    </Suspense>
  );
}

function Economics() {
  const [tab, setTab] = useTabParam(TABS.map((t) => t.key));
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data, isLoading } = useQuery({ queryKey: ['platform-config'], queryFn: () => adminApi.config() });

  const [draft, setDraft] = useState<PlatformConfig | null>(null);
  useEffect(() => { if (data) setDraft(structuredClone(data)); }, [data]);

  const save = useMutation({
    mutationFn: (patch: Partial<PlatformConfig>) => adminApi.saveConfig(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-config'] });
      qc.invalidateQueries({ queryKey: ['commission-preview'] });
      qc.invalidateQueries({ queryKey: ['config-versions'] });
    },
  });

  const versions = useQuery({ queryKey: ['config-versions'], queryFn: () => adminApi.configVersions(20) });
  const rollback = useMutation({
    mutationFn: ({ toVersion, reason }: { toVersion: number; reason?: string }) =>
      adminApi.rollbackConfig(toVersion, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-config'] });
      qc.invalidateQueries({ queryKey: ['config-versions'] });
    },
  });

  if (isLoading || !draft || !data) return <Skeleton className="h-96 w-full rounded-lg" />;

  const dirty = JSON.stringify(draft) !== JSON.stringify(data);

  const commit = async () => {
    const { ok } = await confirm({
      title: 'Apply new platform economics?',
      description:
        'These rates take effect on the very next quote — no deploy, no restart. Bookings already priced keep their original rate.',
      confirmLabel: 'Apply live',
      tone: 'destructive',
      requireText: 'APPLY',
    });
    if (ok) {
      save.mutate({
        serviceFee: draft.serviceFee,
        payout: draft.payout,
        incidentals: draft.incidentals,
        rewards: draft.rewards,
        protection: draft.protection,
        legal: { ...draft.legal, cancellationUrl: draft.legal.cancellationUrl?.trim() || undefined },
        verification: draft.verification,
        contactVerification: draft.contactVerification,
        checkout: draft.checkout,
        deposit: draft.deposit,
        booking: draft.booking,
        ...(draft.trust ? { trust: { perks: draft.trust.perks } } : {}),
        ...(draft.cancellation ? { cancellation: draft.cancellation } : {}),
        ...(draft.noShow ? { noShow: draft.noShow } : {}),
        ...(draft.rebookingProtection ? { rebookingProtection: draft.rebookingProtection } : {}),
        tracking: draft.tracking,
        ...(draft.tripDocuments ? { tripDocuments: draft.tripDocuments } : {}),
        ...(draft.identityViewing ? { identityViewing: draft.identityViewing } : {}),
        inspection: draft.inspection,
        extension: draft.extension,
        ...(draft.tripChanges ? { tripChanges: draft.tripChanges } : {}),
        handover: draft.handover,
        security: draft.security,
        ...(draft.programs ? { programs: draft.programs } : {}),
        ...(draft.appRelease ? { appRelease: draft.appRelease } : {}),
      });
    }
  };

  const set = (fn: (d: PlatformConfig) => void) => {
    const next = structuredClone(draft);
    fn(next);
    setDraft(next);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Money in"
        title="Platform economics"
        description="The rates and rules the marketplace runs on, grouped by topic. Changes apply on the next quote and are recorded in History."
      />

      <div className="sticky top-14 z-20 -mx-4 space-y-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabBar tabs={TABS} active={tab} onChange={setTab} className="lg:flex-1" />
          <div className="flex items-center justify-between gap-3 lg:justify-end">
            <span className={dirty ? 'text-xs font-medium text-warning' : 'text-xs text-muted-foreground'}>{dirty ? 'Unsaved changes on this page' : 'Everything saved'}</span>
            <Button disabled={!dirty} loading={save.isPending} onClick={commit}>
              <Save className="h-4 w-4" /> Apply changes
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{TABS.find((t) => t.key === tab)?.about}</p>
      </div>

      {save.isError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {save.error instanceof ApiError ? save.error.message : 'Could not save.'}
        </p>
      )}
      {save.isSuccess && !dirty && (
        <p className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">
          Applied — live on the next quote ✓
        </p>
      )}

      {tab === 'fees' && <FeesTab draft={draft} set={set} />}

      {tab === 'safety' && <SafetyTab draft={draft} set={set} />}

      {tab === 'checks' && <ChecksTab draft={draft} set={set} />}

      {tab === 'rules' && <RulesTab draft={draft} set={set} />}

      {tab === 'payouts' && <PayoutsTab draft={draft} set={set} />}

      {tab === 'history' && (
        <>
      {/* Config history & rollback */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary" /> Change history</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Every publish is versioned. Roll back to any earlier version — the rollback is itself recorded as a new
            version, so history is never rewritten.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {versions.isLoading && <Skeleton className="h-24 w-full rounded-lg" />}
          {versions.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No versions yet — your next save creates version 1.</p>
          )}
          {versions.data?.map((v) => {
            const isCurrent = v.version === data.configVersion;
            return (
              <div key={v._id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 p-3">
                <span className="numeric flex h-9 min-w-9 items-center justify-center rounded-lg bg-muted px-2 text-sm font-bold">
                  v{v.version}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {v.reason || (v.restoredFromVersion ? `Rolled back to v${v.restoredFromVersion}` : v.changedKeys.join(', ') || 'Update')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(v.publishedAt || v.createdAt).toLocaleString()} · {v.actorId.slice(0, 8)}
                  </p>
                </div>
                {isCurrent ? (
                  <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Current</span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={rollback.isPending && rollback.variables?.toVersion === v.version}
                    onClick={async () => {
                      const { ok } = await confirm({
                        title: `Roll back to version ${v.version}?`,
                        description: 'The marketplace will price on these older economics from the next quote. This is recorded as a new version.',
                        confirmLabel: 'Roll back',
                        tone: 'destructive',
                        requireText: 'ROLLBACK',
                      });
                      if (ok) rollback.mutate({ toVersion: v.version, reason: `Rollback to v${v.version}` });
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Roll back
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
