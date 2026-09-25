'use client';

import { ErrorState } from '@/components/ui/states';

/** Last line of defence: a screen that fails shows a way forward instead of a blank page. */
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <ErrorState message="Something went wrong on this page. Your data is safe — try again, or refresh if it keeps happening." retry={reset} />
    </div>
  );
}
