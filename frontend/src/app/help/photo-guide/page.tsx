import type { Metadata } from 'next';
import { ACCIDENT_SHOTS as ACCIDENT, PHOTO_SHOTS as SHOTS, PHOTO_TIPS as TIPS, SHOT_ACCENT } from '@/features/trips/photo-guide';

export const metadata: Metadata = {
  title: 'Vehicle photo guide',
  description: 'What to photograph at pickup and return, and why each shot matters for damage charges and insurance claims.',
};

export default function PhotoGuidePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-8 sm:px-6">
      <header className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: SHOT_ACCENT }}>Why each shot matters</p>
        <h1 className="display text-3xl leading-tight sm:text-4xl">Vehicle photo guide: what to shoot, and why</h1>
        <p className="max-w-3xl text-base text-muted-foreground">
          Photos taken at pickup, at return and after any incident are the evidence used to settle damage charges and insurance claims.
          Each shot below closes a specific gap, so no panel is left unproven.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {TIPS.map((t) => (
          <div key={t.title} className="rounded-lg border border-border bg-card p-4">
            <p className="font-bold">{t.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.body}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="hidden grid-cols-3 gap-6 border-b border-border pb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground md:grid">
          <span>Shot</span>
          <span>Car rental: why it matters</span>
          <span>Insurance claim: why it matters</span>
        </div>
        {SHOTS.map((s) => (
          <div key={s.title} className="grid gap-3 border-b border-border py-6 md:grid-cols-3 md:gap-6">
            <div>
              <p className="text-lg font-bold">{s.title}</p>
              <p className="text-sm font-semibold" style={{ color: SHOT_ACCENT }}>{s.shots}</p>
              <p className="mt-2 text-sm text-muted-foreground">{s.how}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground md:hidden">Car rental</p>
              <p className="text-sm">{s.rental}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground md:hidden">Insurance claim</p>
              <p className="text-sm">{s.claim}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-border bg-card p-5 sm:p-6">
        <h2 className="text-xl font-bold">If there is an accident, add these before anything moves</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ACCIDENT.map((a) => (
            <div key={a.title} className="border-t-2 pt-3" style={{ borderColor: SHOT_ACCENT }}>
              <p className="font-bold">{a.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          Only when it is safe. Never step into traffic for a photo, and follow local rules on moving vehicles.
        </p>
      </section>
    </div>
  );
}
