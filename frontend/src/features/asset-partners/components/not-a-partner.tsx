'use client';

import Link from 'next/link';
import { ArrowRight, Car } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/** Shared shape for every portal page when the caller isn't enrolled yet. */
export function NotAPartner() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Car className="h-7 w-7" />
        </span>
        <div>
          <p className="display text-xl">You’re not an Asset Partner yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            This part of the portal opens once your application is approved and you’re enrolled in
            the programme.
          </p>
        </div>
        <Link href="/asset-partners/apply">
          <Button className="rounded-xl">
            Apply to become a partner <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
