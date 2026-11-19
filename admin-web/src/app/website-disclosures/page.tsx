'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { websiteComplianceApi, type DisclosureSection } from '@/features/admin/website-compliance-api';
import { ApiError } from '@/lib/api/types';
import { formatDate } from '@/lib/utils/format';

export default function WebsiteDisclosuresPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['admin-website-disclosures'], queryFn: websiteComplianceApi.disclosures });
  const [sections, setSections] = useState<DisclosureSection[] | null>(null);
  const [changeNote, setChangeNote] = useState('');
  useEffect(() => { if (q.data?.current) setSections(q.data.current.sections); }, [q.data]);

  const publish = useMutation({
    meta: { silentError: true },
    mutationFn: () => websiteComplianceApi.publishDisclosures({ sections: sections!.map((s) => ({ ...s, body: s.body.map((p) => p.trim()).filter(Boolean) })), changeNote: changeNote.trim() }),
    onSuccess: (v) => {
      setChangeNote('');
      void qc.invalidateQueries({ queryKey: ['admin-website-disclosures'] });
      toast({ tone: 'success', title: v.version === q.data?.current?.version ? 'No changes to publish' : `Version ${v.version} published` });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? (e.status === 403 ? 'Only an admin can publish disclosures.' : e.message) : 'That didn’t go through. Try again.' }),
  });

  if (q.isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;
  if (q.isError) return <ErrorState message="We couldn’t load the disclosures." retry={() => void q.refetch()} />;
  if (!q.data?.current || !sections) return <EmptyState title="No disclosures published yet" description="Version 1 is published automatically when the server starts." />;

  const set = (i: number, patch: Partial<DisclosureSection>) => setSections(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const invalid = sections.some((s) => s.title.trim().length < 2 || s.note.trim().length < 5 || !s.body.some((p) => p.trim().length >= 2));
  const changed = JSON.stringify(sections) !== JSON.stringify(q.data.current.sections);

  const onPublish = async () => {
    const { ok } = await confirm({ title: 'Publish a new version?', description: 'It replaces the current disclosures on the website. Earlier versions stay viewable in the version history. Get legal approval first.', confirmLabel: 'Publish' });
    if (ok) publish.mutate();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Control"
        title="Website disclosures"
        description={`Version ${q.data.current.version}, effective ${formatDate(q.data.current.effectiveAt)}. Each section's short note shows beside the claims it covers; the full text is on /legal/disclosures.`}
      />

      {sections.map((s, i) => (
        <Card key={s.id}>
          <CardHeader><CardTitle className="text-base">{i + 1}. {s.title}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Title" htmlFor={`t-${s.id}`}><Input id={`t-${s.id}`} maxLength={120} value={s.title} onChange={(e) => set(i, { title: e.target.value })} /></Field>
            <Field label="Short note beside claims" htmlFor={`n-${s.id}`} hint={`${s.note.length}/400`}><Textarea id={`n-${s.id}`} rows={2} maxLength={400} value={s.note} onChange={(e) => set(i, { note: e.target.value })} /></Field>
            <Field label="Full text" htmlFor={`b-${s.id}`} hint="One paragraph per line."><Textarea id={`b-${s.id}`} rows={Math.min(14, s.body.length * 2 + 2)} value={s.body.join('\n')} onChange={(e) => set(i, { body: e.target.value.split('\n') })} /></Field>
          </CardContent>
        </Card>
      ))}

      <Card className="border-primary/30">
        <CardContent className="space-y-3 py-5">
          <Field label="What changed" htmlFor="change-note" hint="Shown in the public version history."><Input id="change-note" maxLength={500} placeholder="e.g. Airport section updated after the DFW permit" value={changeNote} onChange={(e) => setChangeNote(e.target.value)} /></Field>
          {invalid && <p role="alert" className="text-sm text-destructive">Every section needs a title, a short note and some text.</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" disabled={!changed} onClick={() => setSections(q.data!.current!.sections)}>Discard changes</Button>
            <Button disabled={!changed || invalid || changeNote.trim().length < 5} loading={publish.isPending} onClick={() => void onPublish()}>Publish new version</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Version history</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {q.data.versions.map((v) => (
              <li key={v.version}><span className="font-semibold">Version {v.version}</span> <span className="text-muted-foreground">· {formatDate(v.effectiveAt)} · {v.changeNote}</span></li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
