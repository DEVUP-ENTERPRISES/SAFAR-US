import type { Metadata } from 'next';
import { SHOT_ACCENT } from '@/features/trips/components/shot-diagram';

export const metadata: Metadata = {
  title: 'Vehicle photo guide',
  description: 'What to photograph at pickup and return, and why each shot matters for damage charges and insurance claims.',
};

const TIPS = [
  { title: 'Good light', body: 'Daylight or a lit lot. Avoid glare and deep shadow. Wet or dirty paint hides scratches.' },
  { title: 'Frame it whole', body: 'Keep every panel edge in the shot. Hold the phone landscape for the car, portrait for gauges.' },
  { title: 'Keep the stamp', body: 'Every photo is stamped with the date, time and place. Never crop or filter, and keep the originals.' },
  { title: 'Before and after', body: 'Repeat the full set at pickup and at return, in similar light and the same spot.' },
  { title: 'Add a video', body: 'A slow walk-around video on your phone is a useful backup. Take every photo before you drive away.' },
];

const SHOTS = [
  {
    title: 'Four corners', shots: 'Shots 2, 4, 6 and 8',
    how: '45° views showing two sides at once: bumper corner, fender, lights, wheel.',
    rental: 'Corners are the most scuffed spots and look fine in flat shots. A missing corner leaves you unable to prove what condition it was in.',
    claim: 'Three-quarter views show how damage wraps around a corner and how deep it goes, and whether it fits the incident being described.',
  },
  {
    title: 'Both sides', shots: 'Shots 3 and 7',
    how: 'Square-on, bumper to bumper, at door-handle height: doors, mirror, sill, both wheels.',
    rental: 'Door dings, long scrapes from tight parking and mirror damage all live here. A straight full-side shot lets anyone locate a mark at the return check.',
    claim: 'Fixes the condition of every door and quarter panel before the loss, which matters most in sideswipes and door impacts.',
  },
  {
    title: 'Front & rear', shots: 'Shots 1 and 5',
    how: 'Whole bumper, both lights and the plate, sharp enough to read.',
    rental: 'Bumpers take most parking scrapes. A dated before-photo is what stops you being billed for a mark that was already there.',
    claim: 'Shows the point of impact and the plate in one frame, tying the damage to this vehicle. Panel gaps and alignment help separate old wear from new damage.',
  },
  {
    title: 'Windshield & glass', shots: 'Shot 9',
    how: 'Whole windshield from outside, then a close-up of any chip or crack. Note side and rear glass.',
    rental: 'Chips and cracks are a common billed item, and many rental waivers exclude glass, tires or roof. Check your agreement.',
    claim: 'A dated photo shows whether a chip existed before the incident, since small chips spread. Glass is often claimed under separate terms.',
  },
  {
    title: 'Roof, hood & trunk lid', shots: 'Shot 10',
    how: 'From higher ground such as a step or stairs. Never stand on the car.',
    rental: 'Low garage clearances and roof cargo leave damage that can’t be seen from the ground and is often billed after return.',
    claim: 'Hail and falling-object claims are decided on these flat panels. Dents show best with light sliding across the surface, so avoid shooting straight into the sun.',
  },
  {
    title: 'Wheels & tires', shots: 'Shot 11, four times',
    how: 'Each wheel face-on: rim edge, sidewall, then tread. Four wheels, four photos.',
    rental: 'Curb rash on rims and sidewall cuts or bulges are billed per wheel, and tires are commonly excluded from waivers.',
    claim: 'Rim and tire condition affects repair estimates and the vehicle’s value in a total-loss settlement.',
  },
  {
    title: 'Low bumpers', shots: 'Shot 12, front and rear',
    how: 'Crouch to bumper height: front lower lip and rear lower edge, plus any scuffed side sill.',
    rental: 'Curb and parking-block scrapes sit on the lower lip, where standing-height photos miss them. They tend to surface only at the return inspection.',
    claim: 'Modern bumpers hold parking sensors and radar. Low scrapes can hide cracked mounts or sensor damage that raises the repair cost.',
  },
  {
    title: 'Seats & dash', shots: 'Shot 13',
    how: 'From the rear seat: both front seats, dash, steering wheel, console and headliner.',
    rental: 'Stains, burns, tears, odor and smoke are billed as cleaning or damage fees, separate from collision cover.',
    claim: 'Records trim level and equipment for valuation, shows airbag deployment and interior damage after a crash, and water lines or mud in flood claims.',
  },
  {
    title: 'Rear seats & trunk', shots: 'Shots 14 and 15',
    how: 'Full rear bench, belts and floor, then the trunk with the lid open: floor, spare, jack.',
    rental: 'Stains, pet hair and missing items such as the spare, jack or cargo cover are typical add-on charges.',
    claim: 'Documents contents and equipment after a theft or break-in, and shows buckled trunk floors from a rear impact that can’t be seen from outside.',
  },
  {
    title: 'Odometer & fuel', shots: 'Shot 16',
    how: 'Ignition on: whole cluster in focus, showing mileage, fuel level and any warning lights.',
    rental: 'Mileage drives mileage charges and limits, and fuel level drives refuel charges. A timestamped photo settles both. Warning lights show faults that pre-date you.',
    claim: 'Mileage is a key input to a total-loss valuation, and lit warning or airbag indicators record the car’s state before repair.',
  },
  {
    title: 'VIN & plate', shots: 'Shot 17',
    how: 'VIN plate at the windshield base (driver side) or the door-jamb label, plus the license plate.',
    rental: 'Confirms the car matches the booking and that your photos belong to this car, not a similar one from the same lot.',
    claim: 'The VIN is how insurers pull the exact model, trim, options and history. Plate and VIN together also guard against duplicate or staged claims.',
  },
  {
    title: 'Damage close-ups', shots: 'Shot 18, per mark',
    how: 'One wide shot showing where it is, then a straight-on close-up with a coin for scale.',
    rental: 'A close-up plus location is the strongest proof a mark was there at pickup. Also point it out to your host at handover.',
    claim: 'Size, depth and location decide the fix: paintless dent repair, repaint or a new panel. A scale reference lets an estimator judge size from a photo.',
  },
];

const ACCIDENT = [
  { title: 'The whole scene', body: 'Wide shots from each direction: road layout, lane markings, signs and signals, weather and lighting.' },
  { title: 'Every vehicle involved', body: 'All sides of each vehicle with plates visible, plus close-ups of the contact points.' },
  { title: 'Marks on the ground', body: 'Skid marks, debris, fluid and broken glass, before traffic clears them away.' },
  { title: 'Paperwork', body: 'The other driver’s license and insurance card, and any police report number, photographed rather than copied by hand.' },
];

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
          <div key={t.title} className="rounded-2xl border border-border bg-card p-4">
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

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
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
