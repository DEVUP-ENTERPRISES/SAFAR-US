import Link from 'next/link';
import { EmptyState } from '@/components/ui/states';

/** The operations panel never forwards to the guest or host sites; an unknown address stays here. */
export default function NotFoundHere() {
  return (
    <div className="mx-auto max-w-lg py-16">
      <EmptyState
        title="Page not found"
        description="That page isn’t part of the operations panel."
        action={<Link href="/ops" className="inline-flex h-10 items-center rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Go to operations</Link>}
      />
    </div>
  );
}
