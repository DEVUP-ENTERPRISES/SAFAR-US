import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT } from '@/features/contact/content';

export const metadata: Metadata = {
  title: 'Delete your CatoDrive account',
  description: 'How to delete your CatoDrive account and what happens to your data.',
};

/** The public deletion page the app stores link to: how to delete, what is removed, what the law makes us keep. */
export default function DeleteAccountInfoPage() {
  return (
    <div className="container max-w-2xl space-y-8 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Delete your CatoDrive account</h1>
        <p className="text-muted-foreground">
          This applies to the CatoDrive app, the CatoDrive Partner app and catodrive.com - it is one account.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">In the app</h2>
        <ol className="list-decimal space-y-1 ps-5 text-sm">
          <li>Open the CatoDrive or CatoDrive Partner app and sign in.</li>
          <li>Go to Account (or Menu in the Partner app) and tap <strong>Delete account</strong>.</li>
          <li>Confirm with your password, or with a code we send you if you signed up without one.</li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">On the website</h2>
        <p className="text-sm">
          <Link href="/account/delete" className="font-medium text-primary hover:underline">Sign in and delete your account</Link>. You will confirm it is you the same way.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Can’t sign in?</h2>
        <p className="text-sm">
          Email <a href={`mailto:${CONTACT.email}?subject=Delete%20my%20account`} className="font-medium text-primary hover:underline">{CONTACT.email}</a> from
          the address on your account. We confirm it is you before
          deleting anything.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What is deleted</h2>
        <p className="text-sm">
          Your profile, saved cars and searches, messages, uploaded documents and photos, and your sign-in. Your account
          stops working straight away.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What we have to keep</h2>
        <p className="text-sm">
          Records the law requires - payments, receipts, tax and records tied to an insurance claim or a legal dispute - are
          kept without your name attached, for as long as the law requires.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">When deletion has to wait</h2>
        <p className="text-sm">
          While a trip is in progress, a dispute or claim is open, a security deposit is still held, or a legal hold applies,
          the account cannot be deleted yet. You will see exactly what is outstanding, and can delete as soon as it is settled.
        </p>
      </section>

      <p className="text-sm text-muted-foreground">
        More on how we handle data: <Link href="/privacy" className="font-medium text-primary hover:underline">Privacy Policy</Link>.
      </p>
    </div>
  );
}
