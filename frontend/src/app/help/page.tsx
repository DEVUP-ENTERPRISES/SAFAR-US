'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search, ChevronRight, LifeBuoy, MessageSquareText, FileText } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/utils/cn';
import { kbApi } from '@/features/kb/api';

export default function HelpCentre() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const categories = useQuery({
    queryKey: ['kb-categories'],
    queryFn: () => kbApi.categories(),
  });
  const articles = useQuery({
    queryKey: ['kb-articles', q, category],
    queryFn: () => kbApi.list({ q: q.trim() || undefined, category: category ?? undefined }),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">

      {/* Header */}
      <div className="mb-8">
        <h1 className="display text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          Help centre
        </h1>
        <p className="mt-3 text-base text-muted-foreground sm:text-lg">
          Answers to the most common questions — search or browse by topic.
        </p>
      </div>

      {/* Search bar */}
      <div className="relative mb-6">
        <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search help articles…"
          aria-label="Search help articles"
          className="h-13 w-full rounded-2xl border border-border bg-card ps-12 pe-4 text-base shadow-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Category chips */}
      {(categories.data?.length ?? 0) > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Chip active={category === null} onClick={() => setCategory(null)}>All</Chip>
          {categories.data!.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {titleCase(c)}
            </Chip>
          ))}
        </div>
      )}

      {/* Results */}
      {articles.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : (articles.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title={q ? 'No articles match your search' : 'No articles yet'}
          description={
            q
              ? 'Try different words, or reach out to support below.'
              : 'Check back soon.'
          }
        />
      ) : (
        <div className="space-y-3">
          {articles.data!.map((a) => (
            <Link
              key={a.slug}
              href={`/help/${a.slug}`}
              className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md sm:p-5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                <FileText className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground group-hover:text-primary">
                  {a.title}
                </p>
                {a.summary && (
                  <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                    {a.summary}
                  </p>
                )}
                <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">
                  {titleCase(a.category)}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          ))}
        </div>
      )}

      {/* Support callout */}
      <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-border bg-muted/40 p-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LifeBuoy className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-foreground">Still need a hand?</p>
            <p className="text-sm text-muted-foreground">Our support team is here to help.</p>
          </div>
        </div>
        <Link
          href="/support"
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <MessageSquareText className="h-4 w-4" /> Contact support
        </Link>
      </div>

    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card hover:border-primary/40 hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function titleCase(s: string): string {
  return s
    .replace(/(^|[-_\s])(\w)/g, (_, sep, c) => (sep ? ' ' : '') + c.toUpperCase())
    .trim();
}
