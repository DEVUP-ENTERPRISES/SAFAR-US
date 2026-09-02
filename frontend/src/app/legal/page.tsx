'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileText, ChevronRight, Scale } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { kbApi } from '@/features/kb/api';

/**
 * Legal documents, served out of the knowledge base.
 *
 * Terms and privacy policies get amended by people who are not engineers, on
 * timelines that have nothing to do with deploys — so they live in the KB where
 * an admin can publish a new version, and this page lists whatever is currently
 * in the `legal` category. Hardcoding the text here would mean a lawyer's edit
 * requires a release.
 */
export default function LegalPage() {
  const articles = useQuery({
    queryKey: ['kb-articles', 'legal'],
    queryFn: () => kbApi.list({ category: 'legal' }),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <PageHeader
        title="Legal"
        description="Terms, policies, and the agreements that apply when you book or host."
      />

      {articles.isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : (articles.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Scale className="h-8 w-8" />}
          title="No documents published yet"
          description="Legal documents appear here as soon as they are published. If you need a copy of the terms that applied to a specific booking, contact support and we will send them."
        />
      ) : (
        <div className="space-y-3">
          {articles.data!.map((a) => (
            <Link key={a.slug} href={`/help/${a.slug}`} className="block">
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{a.title}</p>
                      {a.summary && <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{a.summary}</p>}
                      {a.publishedAt && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Updated {new Date(a.publishedAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                        </p>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Questions about any of this? <Link href="/support" className="font-medium text-primary hover:underline">Contact support</Link>.
      </p>
    </div>
  );
}
