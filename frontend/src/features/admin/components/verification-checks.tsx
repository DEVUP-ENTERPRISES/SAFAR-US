'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { formatDate } from '@/lib/utils/format';
import { adminApi } from '@/features/admin/api';

const LABEL: Record<string, string> = {
  identity: 'Identity',
  mvr: 'Driving record (MVR)',
  background: 'Background check',
  insurance: 'Insurance',
};

/** A guest's standing on every configured check, with a manual result entry for checks no provider runs yet. */
export function VerificationChecks({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const status = useQuery({ queryKey: ['admin-verification', userId], queryFn: () => adminApi.verificationStatus(userId) });
  const record = useMutation({
    mutationFn: (v: { type: string; result: 'passed' | 'failed'; notes?: string }) =>
      adminApi.recordVerification(userId, v.type, v.result, v.notes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-verification', userId] }),
  });

  if (status.isLoading) return <Skeleton className="h-24 w-full rounded-xl" />;

  const enter = async (type: string, result: 'passed' | 'failed') => {
    const { ok, reason } = await confirm({
      title: `Record ${LABEL[type] ?? type} as ${result}?`,
      description:
        result === 'passed'
          ? 'Any booking waiting on this check is released straight away.'
          : 'The guest stays blocked until a passing result is recorded.',
      confirmLabel: result === 'passed' ? 'Record as passed' : 'Record as failed',
      tone: result === 'passed' ? undefined : 'destructive',
      reason: { label: 'Note (who ran it, reference)', placeholder: 'e.g. Ran MVR manually, ref 1234', required: true },
    });
    if (ok) record.mutate({ type, result, notes: reason });
  };

  return (
    <div className="space-y-2 rounded-xl border border-border p-4">
      <p className="font-semibold">Verification checks</p>
      {status.data?.map((s) => (
        <div key={s.type} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2 first:border-0 first:pt-0">
          <div>
            <p className="text-sm font-medium">{LABEL[s.type] ?? s.type}</p>
            <p className="text-xs text-muted-foreground">
              {s.required ? 'Required' : 'Not required'} · provider {s.policy.provider}
              {s.validUntil ? ` · valid until ${formatDate(s.validUntil)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={s.hasValid ? 'success' : s.required ? 'warning' : 'muted'}>{s.hasValid ? 'Valid' : s.required ? 'Missing' : 'None'}</Badge>
            {s.type !== 'identity' && (
              <>
                <Button size="sm" loading={record.isPending} onClick={() => enter(s.type, 'passed')}>Mark passed</Button>
                <Button size="sm" variant="outline" className="text-destructive" loading={record.isPending} onClick={() => enter(s.type, 'failed')}>Mark failed</Button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
