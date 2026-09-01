'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, ThumbsUp, ThumbsDown, LifeBuoy, MessageSquareText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Markdown } from '@/features/kb/markdown';
import { kbApi } from '@/features/kb/api';

export default function Article({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [voted, setVoted] = useState<null | 'up' | 'down'>(null);

  const article = useQuery({ queryKey: ['kb-article', slug], queryFn: () => kbApi.get(slug), retry: false });
  const vote = useMutation({
    mutationFn: (helpful: boolean) => kbApi.vote(slug, helpful),
    onSuccess: (_d, helpful) => setVoted(helpful ? 'up' : 'down'),
  });

  if (article.isLoading) {
    return <div className="mx-auto max-w-2xl space-y-4 py-6"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (article.isError || !article.data) {
    return (
      <div className="mx-auto max-w-2xl py-6">
        <ErrorState message="We couldn’t find that article." />
        <div className="mt-4"><Link href="/help" className="text-sm font-medium text-primary underline">Back to help centre</Link></div>
      </div>
    );
  }

  const a = article.data;
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <Link href="/help" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Help centre
      </Link>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">{titleCase(a.category)}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{a.title}</h1>
        {a.summary && <p className="mt-2 text-lg text-muted-foreground">{a.summary}</p>}
      </div>

      <article><Markdown source={a.body} /></article>

      {/* Was this helpful? */}
      <Card>
        <CardContent className="py-5">
          {voted ? (
            <p className="text-sm text-muted-foreground">
              {voted === 'up' ? 'Thanks for the feedback!' : 'Thanks — we’ll work on making this clearer.'}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">Was this helpful?</span>
              <Button variant="outline" size="sm" loading={vote.isPending} onClick={() => vote.mutate(true)}>
                <ThumbsUp className="h-4 w-4" /> Yes
              </Button>
              <Button variant="outline" size="sm" loading={vote.isPending} onClick={() => vote.mutate(false)}>
                <ThumbsDown className="h-4 w-4" /> No
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Escalate to a human */}
      <Card className="bg-muted/40">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div className="flex items-center gap-3">
            <LifeBuoy className="h-6 w-6 text-primary" />
            <p className="text-sm font-medium">Didn’t solve it? Our team can help.</p>
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

function titleCase(s: string): string {
  return s.replace(/(^|[-_\s])(\w)/g, (_, sep, c) => (sep ? ' ' : '') + c.toUpperCase()).trim();
}
