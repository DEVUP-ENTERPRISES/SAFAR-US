import type { ReactNode } from 'react';
import { Handshake } from 'lucide-react';
import { Logo } from '@/components/layout/logo';

export default function EntryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[80vh] w-full items-center gap-10 lg:grid-cols-2">
      <section className="hidden rounded-3xl bg-gradient-to-br from-primary/15 via-background to-background p-10 lg:block">
        <div className="flex items-center gap-3">
          <Logo className="h-11 w-11" />
          <span className="display text-2xl">CatoDrive</span>
        </div>
        <span className="mt-16 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
          <Handshake className="h-4 w-4" /> Asset Partner portal
        </span>
        <h1 className="display mt-6 text-5xl leading-[1.05]">Your car, run by us.</h1>
        <p className="mt-4 max-w-md text-lg text-muted-foreground">See your vehicles, monthly statements, maintenance and documents in one place.</p>
      </section>
      <section className="mx-auto w-full max-w-md">{children}</section>
    </div>
  );
}
