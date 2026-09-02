'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSearch, Sparkles, HelpCircle, CheckCircle2, AlertCircle, FileWarning } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { aiApi } from '@/features/ai/api';

/**
 * The claim case file, for the adjuster.
 *
 * Built on demand rather than on page load: it costs money per claim, and most
 * claims an agent opens are glanced at and closed. The button is the consent.
 *
 * The brief separates what the evidence settles from what it does not, and ends
 * with the questions to go and ask. It never names a liable party and never
 * proposes an amount — those are the adjuster's, and a model that volunteered
 * them would be quietly making the decision.
 */
export function CaseFilePanel({ claimId }: { claimId: string }) {
  const [asked, setAsked] = useState(false);

  const enabled = useQuery({ queryKey: ['ai-status'], queryFn: () => aiApi.status(), staleTime: 300_000 });
  const q = useQuery({
    queryKey: ['case-file', claimId],
    queryFn: () => aiApi.caseFile(claimId),
    enabled: asked,
    retry: false,
    staleTime: Infinity, // Re-reading a claim should not re-bill it.
  });

  if (!enabled.data?.enabled) return null;

  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-semibold">
              <FileSearch className="h-5 w-5 text-primary" /> Case file
              <Badge tone="muted"><Sparkles className="me-1 inline h-3 w-3" />AI</Badge>
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Booking, trip, messages, photos and citations, assembled into a brief.
            </p>
          </div>
          {!asked && <Button size="sm" onClick={() => setAsked(true)}>Build case file</Button>}
        </div>

        {q.isLoading && <div className="mt-4 space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-16 w-full" /></div>}
        {q.isError && <p className="mt-4 text-sm text-destructive">Could not build the case file.</p>}

        {q.data && (
          <div className="mt-4 space-y-5">
            <p className="text-sm leading-relaxed">{q.data.file.summary}</p>

            {q.data.file.timeline.length > 0 && (
              <Section title="What happened">
                <ol className="space-y-1.5">
                  {q.data.file.timeline.map((t, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="numeric shrink-0 text-muted-foreground">
                        {t.at ? new Date(t.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                      </span>
                      <span>{t.what}</span>
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {q.data.file.established.length > 0 && (
                <Section title="Settled by the evidence" icon={CheckCircle2} tone="success">
                  <Bullets items={q.data.file.established} />
                </Section>
              )}
              {q.data.file.disputed.length > 0 && (
                <Section title="Contested" icon={AlertCircle} tone="warning">
                  <Bullets items={q.data.file.disputed} />
                </Section>
              )}
            </div>

            {q.data.file.openQuestions.length > 0 && (
              <Section title="Ask before deciding" icon={HelpCircle}>
                <ul className="space-y-1.5">
                  {q.data.file.openQuestions.map((o, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-2 text-sm">
                      <Badge tone="muted">{o.askWho}</Badge>
                      <span className="min-w-0">{o.question}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {q.data.file.evidenceGaps.length > 0 && (
              <Section title="Missing evidence" icon={FileWarning}>
                <Bullets items={q.data.file.evidenceGaps} />
              </Section>
            )}

            <p className="border-t border-border pt-3 text-xs text-muted-foreground">
              A summary of the record, not a decision. Liability and any amount remain yours.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Section({
  title, icon: Icon, tone, children,
}: {
  title: string;
  icon?: typeof HelpCircle;
  tone?: 'success' | 'warning';
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {Icon && (
          <Icon
            className={
              tone === 'success' ? 'h-3.5 w-3.5 text-success'
                : tone === 'warning' ? 'h-3.5 w-3.5 text-warning'
                  : 'h-3.5 w-3.5'
            }
          />
        )}
        {title}
      </p>
      {children}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-muted-foreground">·</span>
          <span className="min-w-0">{t}</span>
        </li>
      ))}
    </ul>
  );
}
