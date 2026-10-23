import type { ReactNode } from 'react';
import { BadgeCheck, FileCheck2, ShieldCheck, Wallet } from 'lucide-react';
import { Logo } from '@/components/layout/logo';

const POINTS = [
  { icon: FileCheck2, text: 'Tell us about your company and your licence' },
  { icon: ShieldCheck, text: 'Set up your plans: prices, deductibles, limits, states' },
  { icon: BadgeCheck, text: 'CatoDrive reviews each plan before guests see it' },
  { icon: Wallet, text: 'Premiums build up in your own account and are paid out to your bank' },
];

export default function EntryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid w-full grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-14">
      <section className="hidden rounded-lg bg-gradient-to-br from-primary/15 via-background to-background p-10 lg:block">
        <div className="flex items-center gap-3">
          <Logo className="h-11 w-11" />
          <span className="display text-2xl">CatoDrive</span>
        </div>
        <span className="mt-14 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
          <ShieldCheck className="h-4 w-4" /> Insurance partners
        </span>
        <h1 className="display mt-6 text-5xl leading-[1.05]">Your plans, at our checkout.</h1>
        <ul className="mt-8 space-y-4">
          {POINTS.map((p) => (
            <li key={p.text} className="flex items-start gap-3 text-muted-foreground">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><p.icon className="h-4 w-4" /></span>
              <span className="pt-1">{p.text}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="mx-auto w-full max-w-md">
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <Logo className="h-9 w-9" />
          <span className="display text-xl">CatoDrive</span>
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary">Insurance partners</span>
        </div>
        {children}
      </section>
    </div>
  );
}
