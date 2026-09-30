import { cn } from '@/lib/utils/cn';

// Amber marks what to do: where to stand, where to aim, and the part that must be in frame.
export const SHOT_ACCENT = '#E3A33B';

const A = SHOT_ACCENT;
const faint = { fill: 'currentColor', fillOpacity: 0.08 };

// Top-down car, nose up, so the driver side (left) is on the left of the card.
function TopCar() {
  return (
    <>
      <rect x={42} y={20} width={36} height={80} rx={12} {...faint} />
      <path d="M47 40q13-6 26 0l-3 9q-10-4-20 0z" fill="currentColor" fillOpacity={0.18} />
      <path d="M49 82q11 4 22 0l-2-7q-9 3-18 0z" fill="currentColor" fillOpacity={0.18} />
      <path d="M48 52v20M72 52v20" strokeOpacity={0.45} />
      <path d="M42 44l-5-2v5zM78 44l5-2v5z" fill="currentColor" />
      <rect x={38} y={28} width={4} height={10} rx={1.5} fill="currentColor" fillOpacity={0.35} stroke="none" />
      <rect x={78} y={28} width={4} height={10} rx={1.5} fill="currentColor" fillOpacity={0.35} stroke="none" />
      <rect x={38} y={80} width={4} height={10} rx={1.5} fill="currentColor" fillOpacity={0.35} stroke="none" />
      <rect x={78} y={80} width={4} height={10} rx={1.5} fill="currentColor" fillOpacity={0.35} stroke="none" />
    </>
  );
}

// Where to stand, and the part of the body that must be in frame, per walk-around shot.
const WALK: Record<string, { dot: [number, number]; edge: string }> = {
  front: { dot: [60, 6], edge: 'M50 20H70' },
  front_left: { dot: [16, 12], edge: 'M42 46V32A12 12 0 0 1 54 20H62' },
  driver_side: { dot: [10, 60], edge: 'M42 32V88' },
  rear_left: { dot: [16, 108], edge: 'M42 74V88A12 12 0 0 0 54 100H62' },
  rear: { dot: [60, 114], edge: 'M50 100H70' },
  rear_right: { dot: [104, 108], edge: 'M58 100H66A12 12 0 0 0 78 88V74' },
  passenger_side: { dot: [110, 60], edge: 'M78 32V88' },
  front_right: { dot: [104, 12], edge: 'M58 20H66A12 12 0 0 1 78 32V46' },
};

// Cone from the camera towards the middle of the car.
function Cone({ dot }: { dot: [number, number] }) {
  const [x, y] = dot;
  const dx = 60 - x;
  const dy = 60 - y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const reach = Math.min(34, len - 14);
  const bx = x + ux * reach;
  const by = y + uy * reach;
  const half = 17;
  const pts = `${x},${y} ${(bx - uy * half).toFixed(1)},${(by + ux * half).toFixed(1)} ${(bx + uy * half).toFixed(1)},${(by - ux * half).toFixed(1)}`;
  return (
    <>
      <polygon points={pts} fill={A} fillOpacity={0.22} stroke="none" />
      <circle cx={x} cy={y} r={4} fill={A} stroke="none" />
      <circle cx={x} cy={y} r={7} stroke={A} strokeOpacity={0.4} strokeWidth={1.2} />
    </>
  );
}

function Walk({ id }: { id: string }) {
  const w = WALK[id];
  return (
    <svg viewBox="0 0 120 120">
      <TopCar />
      <Cone dot={w.dot} />
      <path d={w.edge} stroke={A} strokeWidth={3.2} />
    </svg>
  );
}

const DETAIL: Record<string, React.ReactNode> = {
  windshield: (
    <svg viewBox="0 0 120 80">
      <path d="M20 66V46q0-6 6-8l8-2 10-16q2-4 8-4h16q6 0 8 4l10 16 8 2q6 2 6 8v20z" {...faint} />
      <path d="M40 36l10-15h20l10 15z" fill={A} fillOpacity={0.15} stroke={A} strokeWidth={2.6} />
      <path d="M64 26l2 3 3 1-3 1-2 3-2-3-3-1 3-1z" fill={A} stroke={A} strokeWidth={0.8} />
      <path d="M26 46h14M80 46h14" strokeOpacity={0.5} />
    </svg>
  ),
  roof: (
    <svg viewBox="0 0 120 80">
      <polygon points="60,6 44,34 76,34" fill={A} fillOpacity={0.22} stroke="none" />
      <circle cx={60} cy={6} r={4} fill={A} stroke="none" />
      <path d="M14 66V56q0-4 6-5l14-3 12-12q3-3 8-3h22q6 0 10 4l10 11q10 1 12 7v11z" {...faint} />
      <path d="M44 36h38l8 9" stroke={A} strokeWidth={3} />
      <circle cx={34} cy={66} r={7} fill="currentColor" fillOpacity={0.35} />
      <circle cx={88} cy={66} r={7} fill="currentColor" fillOpacity={0.35} />
    </svg>
  ),
  wheels: (
    <svg viewBox="0 0 120 80">
      <circle cx={60} cy={40} r={30} stroke={A} strokeWidth={5} strokeDasharray="4 3" />
      <circle cx={60} cy={40} r={21} {...faint} />
      <circle cx={60} cy={40} r={21} strokeWidth={2} />
      <path d="M60 40L60 22M60 40L77 34M60 40L71 55M60 40L49 55M60 40L43 34" strokeWidth={2.2} />
      <circle cx={60} cy={40} r={4} fill="currentColor" />
    </svg>
  ),
  low_bumpers: (
    <svg viewBox="0 0 120 80">
      <path d="M16 58V40q0-6 6-8l10-2 8-14q2-4 8-4h24q6 0 8 4l8 14 10 2q6 2 6 8v18z" {...faint} />
      <path d="M28 40l14 2v5l-14-1zM92 40l-14 2v5l14-1z" fill="currentColor" fillOpacity={0.35} />
      <rect x={46} y={44} width={28} height={8} rx={2} fill="currentColor" fillOpacity={0.2} />
      <path d="M18 60q42 8 84 0" stroke={A} strokeWidth={3.4} />
      <rect x={22} y={60} width={12} height={10} rx={2} fill="currentColor" fillOpacity={0.35} stroke="none" />
      <rect x={86} y={60} width={12} height={10} rx={2} fill="currentColor" fillOpacity={0.35} stroke="none" />
    </svg>
  ),
  seats_dash: (
    <svg viewBox="0 0 120 80">
      <path d="M10 20q50-14 100 0v10q-50-12-100 0z" {...faint} />
      <circle cx={38} cy={36} r={11} strokeWidth={2.6} />
      <circle cx={38} cy={36} r={3} fill="currentColor" />
      <rect x={54} y={28} width={14} height={9} rx={2} fill={A} fillOpacity={0.2} stroke={A} />
      <path d="M24 76V58q0-6 6-6h14q6 0 6 6v18" {...faint} />
      <path d="M70 76V58q0-6 6-6h14q6 0 6 6v18" {...faint} />
      <path d="M57 76l3-20" strokeOpacity={0.5} />
    </svg>
  ),
  rear_seats: (
    <svg viewBox="0 0 120 80">
      <rect x={14} y={14} width={92} height={32} rx={8} {...faint} />
      <path d="M44 16v28M76 16v28" strokeOpacity={0.4} />
      <rect x={14} y={46} width={92} height={16} rx={5} {...faint} />
      <circle cx={88} cy={54} r={4} fill={A} stroke="none" />
      <path d="M30 22l6 20M60 22l0 20" stroke={A} strokeOpacity={0.6} strokeWidth={1.6} />
      <path d="M18 70h84" strokeOpacity={0.4} />
    </svg>
  ),
  trunk: (
    <svg viewBox="0 0 120 80">
      <path d="M22 30l14-22h48l14 22" {...faint} />
      <rect x={18} y={30} width={84} height={40} rx={6} {...faint} />
      <rect x={26} y={38} width={68} height={24} rx={3} stroke={A} strokeWidth={2.4} />
      <circle cx={60} cy={50} r={9} strokeWidth={2.2} />
      <circle cx={60} cy={50} r={3} fill="currentColor" />
      <path d="M32 58h12" strokeWidth={2.2} />
    </svg>
  ),
  dashboard: (
    <svg viewBox="0 0 120 80">
      <circle cx={46} cy={10} r={2} fill={A} stroke="none" />
      <circle cx={60} cy={8} r={2} fill={A} stroke="none" />
      <circle cx={74} cy={10} r={2} fill={A} stroke="none" />
      <path d="M8 70V30q0-10 10-10h84q10 0 10 10v40z" {...faint} />
      <circle cx={42} cy={46} r={16} strokeWidth={2} />
      <path d="M42 46l9-9" strokeWidth={2.4} />
      <circle cx={84} cy={46} r={12} strokeWidth={2} />
      <path d="M84 46l-5-7" stroke={A} strokeWidth={2.4} />
      <text x={74} y={62} fontSize={7} fill="currentColor" stroke="none">E</text>
      <text x={91} y={62} fontSize={7} fill="currentColor" stroke="none">F</text>
      <rect x={30} y={60} width={24} height={6} rx={1.5} fill={A} fillOpacity={0.2} stroke={A} />
    </svg>
  ),
  vin_plate: (
    <svg viewBox="0 0 120 80">
      <rect x={14} y={8} width={52} height={22} rx={4} {...faint} />
      <path d="M22 14v10M26 14v10M29 14v10M34 14v10M38 14v10M41 14v10M46 14v10M50 14v10M53 14v10M58 14v10" strokeWidth={1.4} />
      <rect x={40} y={42} width={66} height={30} rx={5} fill={A} fillOpacity={0.14} stroke={A} strokeWidth={2.4} />
      <path d="M50 52v12M55 52v12M60 52v12M66 52v12M71 52v12M76 52v12M82 52v12M88 52v12M94 52v12" stroke={A} strokeWidth={1.6} />
    </svg>
  ),
  damage: (
    <svg viewBox="0 0 120 80">
      <path d="M10 22V10h12M98 10h12v12M110 58v12H98M22 70H10V58" strokeWidth={2} />
      <path d="M30 52l14-12 10 8 14-18 12 10 12-14" stroke={A} strokeWidth={3} />
      <circle cx={88} cy={52} r={8} strokeWidth={2} />
      <circle cx={88} cy={52} r={4} fill="currentColor" fillOpacity={0.3} stroke="none" />
    </svg>
  ),
};

/** The card illustration for one shot of the photo guide. */
export function ShotDiagram({ angle, className }: { angle: string; className?: string }) {
  const art = WALK[angle] ? <Walk id={angle} /> : DETAIL[angle];
  if (!art) return null;
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none block [&>svg]:h-full [&>svg]:w-full [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round] [&>svg]:[stroke-width:1.6]',
        className,
      )}
    >
      {art}
    </span>
  );
}

/** Legend for the dot, cone and bold edge used in the walk-around cards. */
export function ShotLegend({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-1.5 rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground', className)}>
      <p className="flex items-center gap-2.5">
        <svg viewBox="0 0 30 14" className="h-3.5 w-8 shrink-0" aria-hidden>
          <polygon points="4,7 28,1 28,13" fill={A} fillOpacity={0.3} />
          <circle cx={4} cy={7} r={3.5} fill={A} />
        </svg>
        Dot and cone: where to stand and where to aim.
      </p>
      <p className="flex items-center gap-2.5">
        <svg viewBox="0 0 30 14" className="h-3.5 w-8 shrink-0" aria-hidden>
          <path d="M3 12V8a6 6 0 0 1 6-6h18" fill="none" stroke={A} strokeWidth={3} strokeLinecap="round" />
        </svg>
        Bold edge: the part of the car that must be in frame.
      </p>
    </div>
  );
}
