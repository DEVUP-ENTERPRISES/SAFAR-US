import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { DISCLOSURES, DISCLOSURES_EFFECTIVE, DISCLOSURES_VERSION } from '@/features/legal/disclosures';

export const metadata: Metadata = {
  title: 'Website disclosures · CatoDrive',
  description: 'How to read the figures, examples, forecasts and service descriptions on the CatoDrive website.',
};

export default function DisclosuresPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6">
      <PageHeader
        title="Website disclosures"
        description={`Version ${DISCLOSURES_VERSION} · Effective ${DISCLOSURES_EFFECTIVE}`}
      />

      <nav aria-label="Disclosures on this page" className="rounded-lg border border-border bg-card p-4">
        <p className="text-label font-semibold">On this page</p>
        <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {DISCLOSURES.map((d, i) => (
            <li key={d.id}>
              <a href={`#${d.id}`} className="text-muted-foreground hover:text-foreground hover:underline">
                {i + 1}. {d.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {DISCLOSURES.map((d, i) => (
        <section key={d.id} id={d.id} className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold">{i + 1}. {d.title}</h2>
          {d.body.map((p) => (
            <p key={p} className="text-sm leading-relaxed text-foreground">{p}</p>
          ))}
        </section>
      ))}

      <p className="border-t border-border pt-6 text-sm text-muted-foreground">
        See also our <Link href="/terms" className="font-semibold text-foreground underline underline-offset-2">Terms</Link>,{' '}
        <Link href="/privacy" className="font-semibold text-foreground underline underline-offset-2">Privacy Policy</Link> and{' '}
        <Link href="/legal" className="font-semibold text-foreground underline underline-offset-2">all legal documents</Link>.
      </p>
    </div>
  );
}
