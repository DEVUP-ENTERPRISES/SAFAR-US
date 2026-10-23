import type { ReactNode } from 'react';
import { BadgeCheck, ClipboardList, FileSignature, Handshake, LayoutDashboard } from 'lucide-react';
import { Logo } from '@/components/layout/logo';

const STEPS = [
  { icon: ClipboardList, text: 'Create your account and tell us about your car' },
  { icon: BadgeCheck, text: 'CatoDrive reviews it and inspects the car' },
  { icon: FileSignature, text: 'Sign your partner agreement online' },
  { icon: LayoutDashboard, text: 'Track your car, earnings and payouts here' },
];

export default function EntryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[80vh] w-full grid-cols-1 items-center gap-10 lg:grid-cols-2">
      <section className="hidden rounded-lg bg-gradient-to-br from-primary/15 via-background to-background p-10 lg:block">
        <div className="flex items-center gap-3">
          <Logo className="h-11 w-11" />
          <span className="display text-2xl">CatoDrive</span>
        </div>
        <span className="mt-14 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
          <Handshake className="h-4 w-4" /> Asset Partner portal
        </span>
        <h1 className="display mt-6 text-5xl leading-[1.05]">Your car, run by us.</h1>
        <ol className="mt-8 space-y-4">
          {STEPS.map((s, i) => (
            <li key={s.text} className="flex items-start gap-3 text-muted-foreground">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><s.icon className="h-4 w-4" /></span>
              <span className="pt-1"><span className="font-semibold text-foreground">{i + 1}.</span> {s.text}</span>
            </li>
          ))}
        </ol>
      </section>
      <section className="mx-auto w-full max-w-md">
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <Logo className="h-9 w-9" />
          <span className="display text-xl">CatoDrive</span>
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary">Partners</span>
        </div>
        {children}
      </section>
    </div>
  );
}
