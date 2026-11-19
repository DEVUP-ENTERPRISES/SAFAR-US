'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { legalApi, useDisclosures, type DisclosureDoc } from '@/features/legal/api';

const longDate = (d: string) => {
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

function Disclosures() {
  const params = useSearchParams();
  const asked = Number(params.get('version'));
  const old = useQuery({ queryKey: ['website-disclosures', asked], queryFn: () => legalApi.version(asked), enabled: Number.isInteger(asked) && asked > 0, retry: false });
  const current = useDisclosures();
  const versions = useQuery({ queryKey: ['website-disclosure-versions'], queryFn: legalApi.versions, staleTime: 5 * 60_000 });

  if (asked > 0 && old.isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;
  if (asked > 0 && old.isError) return <ErrorState message="We couldn’t find that version." />;
  const doc: DisclosureDoc = old.data ?? current;
  const isOld = !!old.data && old.data.version !== versions.data?.[0]?.version;

  return (
    <div className="space-y-8">
      <PageHeader title="Website disclosures" description={`Version ${doc.version} · Effective ${longDate(doc.effectiveAt)}`} />
      {isOld && (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          This is an earlier version. <Link href="/legal/disclosures" className="font-semibold underline underline-offset-2">See the current version</Link>.
        </p>
      )}

      <nav aria-label="Disclosures on this page" className="rounded-lg border border-border bg-card p-4">
        <p className="text-label font-semibold">On this page</p>
        <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {doc.sections.map((d, i) => (
            <li key={d.id}>
              <a href={`#${d.id}`} className="text-muted-foreground hover:text-foreground hover:underline">{i + 1}. {d.title}</a>
            </li>
          ))}
        </ol>
      </nav>

      {doc.sections.map((d, i) => (
        <section key={d.id} id={d.id} className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold">{i + 1}. {d.title}</h2>
          {d.body.map((p) => <p key={p} className="text-sm leading-relaxed text-foreground">{p}</p>)}
        </section>
      ))}

      {(versions.data?.length ?? 0) > 1 && (
        <section aria-labelledby="versions" className="space-y-2 border-t border-border pt-6">
          <h2 id="versions" className="text-base font-semibold">Version history</h2>
          <ul className="space-y-1 text-sm">
            {versions.data!.map((v) => (
              <li key={v.version} className="flex flex-wrap gap-x-2">
                <Link href={`/legal/disclosures?version=${v.version}`} className="font-semibold text-foreground underline underline-offset-2">Version {v.version}</Link>
                <span className="text-muted-foreground">{longDate(v.effectiveAt)} · {v.changeNote}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="border-t border-border pt-6 text-sm text-muted-foreground">
        Questions about something on our website? <Link href="/contact?interest=website_info" className="font-semibold text-foreground underline underline-offset-2">Ask us</Link>. See also our{' '}
        <Link href="/terms" className="font-semibold text-foreground underline underline-offset-2">Terms</Link>,{' '}
        <Link href="/privacy" className="font-semibold text-foreground underline underline-offset-2">Privacy Policy</Link> and{' '}
        <Link href="/legal" className="font-semibold text-foreground underline underline-offset-2">all legal documents</Link>.
      </p>
    </div>
  );
}

export default function DisclosuresPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
        <Disclosures />
      </Suspense>
    </div>
  );
}
