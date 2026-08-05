'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search, ChevronRight, LifeBuoy, MessageSquareText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils/cn';
import { kbApi } from '@/features/kb/api';

export default function HelpCentre() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const categories = useQuery({ queryKey: ['kb-categories'], queryFn: () => kbApi.categories() });
  const articles = useQuery({
    queryKey: ['kb-articles', q, category],
    queryFn: () => kbApi.list({ q: q.trim() || undefined, category: category ?? undefined }),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader title="Help centre" description="Answers to the most common questions — search or browse by topic." />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search help articles…"
          className="h-12 pl-11 text-base"
          aria-label="Search help articles"
        />
      </div>

      {/* Category filter */}
      {(categories.data?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2">
          <Chip active={category === null} onClick={() => setCategory(null)}>All</Chip>
          {categories.data!.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>{titleCase(c)}</Chip>
          ))}
        </div>
      )}

      {/* Results */}
      {articles.isLoading ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : (articles.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title={q ? 'No articles match your search' : 'No articles yet'}
          description={q ? 'Try different words, or reach out to support below.' : 'Check back soon.'}
        />
      ) : (
        <div className="space-y-3">
          {articles.data!.map((a) => (
            <Link key={a.slug} href={`/help/${a.slug}`} className="block">
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{a.title}</p>
                    {a.summary && <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{a.summary}</p>}
                    <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{titleCase(a.category)}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Still stuck → open a ticket */}
      <Card className="bg-muted/40">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div className="flex items-center gap-3">
            <LifeBuoy className="h-6 w-6 text-primary" />
            <div>
              <p className="font-semibold">Still need a hand?</p>
              <p className="text-sm text-muted-foreground">Our support team is here to help.</p>
            </div>
          </div>
          <Link
            href="/support"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <MessageSquareText className="h-4 w-4" /> Contact support
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function titleCase(s: string): string {
  return s.replace(/(^|[-_\s])(\w)/g, (_, sep, c) => (sep ? ' ' : '') + c.toUpperCase()).trim();
}
