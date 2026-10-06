'use client';

import Link from 'next/link';
import { PauseCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Shown in place of a guest programme the admin has paused. */
export function ProgramPaused({ name }: { name: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <PauseCircle className="h-10 w-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">{name} is paused for now</h1>
      <p className="text-sm text-muted-foreground">We are improving it. Anything you have already earned is safe and will be here when it returns.</p>
      <Link href="/search"><Button variant="outline">Browse cars</Button></Link>
    </div>
  );
}
