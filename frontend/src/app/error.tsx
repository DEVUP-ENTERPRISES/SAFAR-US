'use client';

import { ErrorState } from '@/components/ui/states';

/** Last line of defence: a screen that fails shows a way forward and a reference code, never the raw error. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <ErrorState message="Something went wrong on this page. Your data is safe - try again, or refresh if it keeps happening." retry={reset} />
      <p className="mt-3 break-words text-center font-mono text-[11px] text-muted-foreground">
        {/* Only a reference code: the error itself goes to the console and logs, never onto the screen. */}
        {error.digest ? `Reference ${error.digest}` : ''}
      </p>
    </div>
  );
}
