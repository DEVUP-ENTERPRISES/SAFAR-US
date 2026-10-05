'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileText, ChevronRight, Scale, ShieldCheck, ScrollText } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { kbApi } from '@/features/kb/api';

/**
 * Legal documents, served out of the knowledge base.
 * Terms and privacy policies get amended by people who are not engineers,
 * so they live in the KB where an admin can publish a new version.
 */

// Map known slugs/titles to a distinct icon so the list is scannable
function DocIcon({ title }: { title: string }) {
  const t = title.toLowerCase();
  if (t.includes('privacy')) return <ShieldCheck className="h-5 w-5" />;
  if (t.includes('terms')) return <ScrollText className="h-5 w-5" />;
  return <FileText className="h-5 w-5" />;
}

export default function LegalPage() {
  const articles = useQuery({
    queryKey: ['kb-articles', 'legal'],
    queryFn: () => kbApi.list({ category: 'legal' }),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">

      {/* Header */}
      <div className="mb-8">
        <h1 className="display text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          Legal
        </h1>
        <p className="mt-3 text-base text-muted-foreground sm:text-lg">
          Terms, policies, and the agreements that apply when you book or host.
        </p>
      </div>

      {/* Document list */}
      {articles.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : (articles.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Scale className="h-8 w-8" />}
          title="No documents published yet"
          description="Legal documents appear here as soon as they are published. If you need a copy of the terms that applied to a specific booking, contact support and we will send them."
        />
      ) : (
        <div className="space-y-3">
          {articles.data!.map((a) => (
            <Link
              key={a.slug}
              href={`/help/${a.slug}`}
              className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
            >
              {/* Icon */}
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                <DocIcon title={a.title} />
              </span>

              {/* Text */}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground group-hover:text-primary">
                  {a.title}
                </p>
                {a.summary && (
                  <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                    {a.summary}
                  </p>
                )}
                {a.publishedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Updated{' '}
                    {new Date(a.publishedAt).toLocaleDateString('en-US', {
                      dateStyle: 'medium',
                    })}
                  </p>
                )}
              </div>

              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          ))}
        </div>
      )}

      {/* Footer note */}
      <div className="mt-10 rounded-xl border border-border bg-muted/40 px-5 py-4 text-sm text-muted-foreground">
        Questions about any of this?{' '}
        <Link href="/support" className="font-semibold text-primary hover:underline">
          Contact support
        </Link>
        .
      </div>

    </div>
  );
}
