import Link from 'next/link';
import { EmptyState } from '@/components/ui/states';
import { adminPath } from '@/lib/admin-path';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <EmptyState
        title="Page not found"
        description="That page isn’t part of the admin console. It may have moved, or the link may be mistyped."
        action={<Link href={adminPath()} className="inline-flex h-10 items-center rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Go to the dashboard</Link>}
      />
    </div>
  );
}
