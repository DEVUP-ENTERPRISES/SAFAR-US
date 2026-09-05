'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Textarea } from '@/components/ui/textarea';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { formatDate } from '@/lib/utils/format';
import { adminApi, type KbArticle } from '@/features/admin/api';

export default function AdminKbPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ title: '', summary: '', category: 'general', body: '' });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-kb'] });
    qc.invalidateQueries({ queryKey: ['admin-kb-stats'] });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['admin-kb', status],
    queryFn: () => adminApi.kbArticles({ status: status || undefined }),
  });
  const stats = useQuery({ queryKey: ['admin-kb-stats'], queryFn: () => adminApi.kbStats() });

  const create = useMutation({
    mutationFn: () => adminApi.createKbArticle(draft),
    onSuccess: () => {
      setComposing(false);
      setDraft({ title: '', summary: '', category: 'general', body: '' });
      toast({ tone: 'success', title: 'Draft created' });
      refresh();
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof Error ? e.message : 'Could not create the article' }),
  });
  const publish = useMutation({ mutationFn: (id: string) => adminApi.publishKbArticle(id), onSuccess: refresh });
  const unpublish = useMutation({ mutationFn: (id: string) => adminApi.unpublishKbArticle(id), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => adminApi.deleteKbArticle(id), onSuccess: refresh });

  const columns: Column<KbArticle>[] = [
    {
      header: 'Article',
      cell: (a) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{a.title}</p>
          <p className="truncate text-xs text-muted-foreground">/{a.slug}</p>
        </div>
      ),
    },
    { header: 'Category', cell: (a) => <span className="capitalize">{a.category}</span> },
    {
      header: 'Status',
      cell: (a) => <Badge tone={a.status === 'published' ? 'success' : 'muted'}>{a.status}</Badge>,
    },
    { header: 'Views', cell: (a) => a.views.toLocaleString() },
    {
      header: 'Helpful',
      cell: (a) =>
        a.helpful + a.notHelpful === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={a.notHelpful > a.helpful ? 'text-destructive' : ''}>
            {a.helpful}↑ {a.notHelpful}↓
          </span>
        ),
    },
    { header: 'Updated', cell: (a) => formatDate(a.updatedAt) },
    {
      header: '',
      cell: (a) => (
        <div className="flex justify-end gap-2">
          {a.status === 'published' ? (
            <Button size="sm" variant="outline" onClick={() => unpublish.mutate(a._id)}>Unpublish</Button>
          ) : (
            <Button size="sm" onClick={() => publish.mutate(a._id)}>Publish</Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const { ok } = await confirm({
                title: 'Delete this article?',
                description: 'It will stop appearing in the help centre immediately.',
                confirmLabel: 'Delete',
                tone: 'destructive',
              });
              if (ok) remove.mutate(a._id);
            }}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-display-sm">Knowledge base</h1>
        <Button onClick={() => setComposing((v) => !v)}>{composing ? 'Cancel' : 'New article'}</Button>
      </div>

      {/* Health — what's live, what's read, and what readers dislike. */}
      {stats.data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Published" value={stats.data.published} />
          <Stat label="Drafts" value={stats.data.draft} />
          <Stat label="Total reads" value={stats.data.totalViews.toLocaleString()} />
        </div>
      )}

      {stats.data?.needsAttention?.length ? (
        <Card className="border-warning/40">
          <CardContent className="py-4">
            <p className="font-semibold">Readers say these aren’t helping</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {stats.data.needsAttention.map((a) => (
                <li key={a.slug}>
                  {a.title} — {a.helpful}↑ {a.notHelpful}↓ over {a.views} reads
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {composing && (
        <Card>
          <CardContent className="space-y-4 py-5">
            <Field label="Title"><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="How do I add a second driver?" /></Field>
            <Field label="Summary"><Input value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} placeholder="One line shown in search results" /></Field>
            <Field label="Category"><Input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="trips" /></Field>
            <Field label="Body (Markdown)">
              <Textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={10}
                className="w-full rounded-lg border border-border bg-background p-3 text-sm"
                placeholder={'Open your trip and tap **Add driver**.\n\n- They must verify their licence\n- Both drivers are covered'}
              />
            </Field>
            <Button
              loading={create.isPending}
              disabled={draft.title.trim().length < 3 || draft.body.trim().length < 10}
              onClick={() => create.mutate()}
            >
              Save as draft
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {[
          { v: '', l: 'All' },
          { v: 'published', l: 'Published' },
          { v: 'draft', l: 'Drafts' },
        ].map((f) => (
          <Chip key={f.v} active={status === f.v} onClick={() => setStatus(f.v)}>{f.l}</Chip>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={data ?? []}
        isLoading={isLoading}
        emptyTitle="No articles yet"
        emptyDescription="Write the first one — a good article is what stops a ticket being filed."
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
