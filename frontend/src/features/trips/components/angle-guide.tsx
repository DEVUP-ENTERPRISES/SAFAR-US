import { cn } from '@/lib/utils/cn';

const ACCENT = 'hsl(var(--primary))';
const TAIL = '#ef4444';

// Shared paint: body panels, tinted glass with a reflection, tyres and alloys.
const body = { fill: 'currentColor', fillOpacity: 0.1 };
const glass = { fill: 'currentColor', fillOpacity: 0.22 };

function Wheel({ cx, cy, r = 11 }: { cx: number; cy: number; r?: number }) {
  const spokes = [0, 72, 144, 216, 288].map((a) => {
    const rad = (a * Math.PI) / 180;
    return `M${cx} ${cy}L${(cx + Math.sin(rad) * r * 0.62).toFixed(1)} ${(cy - Math.cos(rad) * r * 0.62).toFixed(1)}`;
  });
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="currentColor" fillOpacity={0.35} />
      <circle cx={cx} cy={cy} r={r * 0.66} />
      <path d={spokes.join('')} strokeWidth={1.4} />
      <circle cx={cx} cy={cy} r={r * 0.16} fill="currentColor" />
    </g>
  );
}

const Shadow = ({ cx = 80, rx = 68 }: { cx?: number; rx?: number }) => (
  <ellipse cx={cx} cy={80} rx={rx} ry={4} fill="currentColor" fillOpacity={0.14} stroke="none" />
);

// Side profile of a compact SUV, nose to the left.
const Side = (
  <>
    <Shadow />
    <path d="M62 17h54" strokeWidth={2.2} />
    <path
      {...body}
      d="M14 62V50q0-6 8-8l18-4 14-14q4-4 12-4h46q8 0 14 6l12 12q8 2 10 8v16q0 2-2 2h-10a14 14 0 0 0-28 0H56a14 14 0 0 0-28 0H16q-2 0-2-2z"
    />
    <path {...glass} d="M48 38l10-12q3-3 8-3h18v15zM88 23h20v15H88zM112 23q5 0 9 5l7 10h-16z" />
    <path d="M64 26l-8 10M92 26l-4 8" strokeOpacity={0.45} strokeWidth={1.2} />
    <path d="M86 40v20M110 40v20M40 46h108" strokeOpacity={0.5} strokeWidth={1.2} />
    <path d="M74 45h6M98 45h6" strokeWidth={2} />
    <path d="M50 36l-7-2v5z" fill="currentColor" />
    <path d="M16 46l12-2-2 5-10 1z" fill={ACCENT} stroke={ACCENT} />
    <path d="M147 44l-7-1v5l7 1z" fill={TAIL} stroke={TAIL} />
    <Wheel cx={42} cy={64} />
    <Wheel cx={122} cy={64} />
  </>
);

// Head-on view; lamps decide whether it reads as the front or the back.
function Face({ rear }: { rear?: boolean }) {
  return (
    <>
      <Shadow rx={56} />
      <rect x={34} y={66} width={14} height={11} rx={3} fill="currentColor" fillOpacity={0.35} />
      <rect x={112} y={66} width={14} height={11} rx={3} fill="currentColor" fillOpacity={0.35} />
      <path {...body} d="M30 70V50q0-8 8-10l8-2 8-16q2-4 8-4h36q6 0 8 4l8 16 8 2q8 2 8 10v20z" />
      <path {...glass} d={rear ? 'M58 24h44l6 12H52z' : 'M56 24h48l8 14H48z'} />
      <path d={rear ? 'M64 27l-4 7' : 'M62 27l-6 9'} strokeOpacity={0.45} strokeWidth={1.2} />
      <path d="M44 36l-8-1v6h8zM116 36l8-1v6h-8z" fill="currentColor" />
      {rear ? (
        <>
          <path d="M72 21h16" stroke={TAIL} strokeWidth={2} />
          <path d="M34 44l20 2v6l-20-2zM126 44l-20 2v6l20-2z" fill={TAIL} stroke={TAIL} />
          <path d="M54 49h52" strokeOpacity={0.5} strokeWidth={1.2} />
        </>
      ) : (
        <>
          <path d="M36 46l20 2v5l-18-1zM124 46l-20 2v5l18-1z" fill={ACCENT} stroke={ACCENT} />
          <rect x={62} y={47} width={36} height={12} rx={3} fill="currentColor" fillOpacity={0.25} />
          <path d="M65 51h30M65 55h30" strokeOpacity={0.5} strokeWidth={1} />
        </>
      )}
      <path d="M34 62h92" strokeOpacity={0.5} strokeWidth={1.2} />
      <rect x={70} y={63} width={20} height={6} rx={1.5} fill="currentColor" fillOpacity={0.3} />
    </>
  );
}

// Three-quarter view from the front-left corner; mirrored and re-lit for the rear-left.
function Corner({ rear }: { rear?: boolean }) {
  const lamp = rear ? TAIL : ACCENT;
  return (
    <>
      <Shadow cx={84} rx={70} />
      <ellipse cx={22} cy={68} rx={4} ry={7} fill="currentColor" fillOpacity={0.35} />
      <path
        {...body}
        d="M40 64V42l14-16q4-4 10-4h54q6 0 12 6l12 12q6 2 6 8v14q0 2-2 2h-7a13 13 0 0 0-26 0H75a13 13 0 0 0-26 0z"
      />
      <path {...body} d="M40 64V42l-12-2q-12 2-14 10v16q0 2 4 2z" />
      <path {...body} d="M44 24q8-3 20-2l-10 4z" />
      <path {...glass} d="M28 40l16-16 10 2-14 16z" />
      <path {...glass} d="M52 38l10-12h22v12zM88 26h20v12H88zM112 26q6 0 10 4l8 8h-18z" />
      <path d="M36 30l-6 7" strokeOpacity={0.45} strokeWidth={1.2} />
      <path d="M86 40v20M110 40v20M44 46h104" strokeOpacity={0.5} strokeWidth={1.2} />
      <path d="M50 38l-7-2v5z" fill="currentColor" />
      <path d="M16 48l14-2v5l-13 2z" fill={lamp} stroke={lamp} />
      <path d={rear ? 'M20 57l14-2' : 'M18 56l18-2v6l-18 2z'} {...(rear ? { strokeOpacity: 0.5 } : { fill: 'currentColor', fillOpacity: 0.25 })} />
      <Wheel cx={62} cy={64} r={10} />
      <Wheel cx={126} cy={64} r={10} />
    </>
  );
}

const Interior = (
  <>
    <path d="M8 20q72-18 144 0" strokeOpacity={0.5} />
    <path {...body} d="M8 42q72-16 144 0v8q-72-14-144 0z" />
    <rect x={72} y={34} width={20} height={12} rx={2} {...glass} />
    <circle cx={48} cy={58} r={17} strokeWidth={3} />
    <circle cx={48} cy={58} r={5} fill="currentColor" fillOpacity={0.4} />
    <path d="M31 58h12M53 58h12M48 63v12" strokeWidth={2.5} />
    <path {...body} d="M112 88V60q0-8 8-8h12q8 0 8 8v28" />
    <rect x={118} y={40} width={16} height={9} rx={3} {...body} />
    <path d="M100 88l6-22h4" strokeOpacity={0.5} strokeWidth={1.4} />
  </>
);

const Dashboard = (
  <>
    <path {...body} d="M12 76V40q0-14 14-14h108q14 0 14 14v36z" />
    <path d="M36 62a24 24 0 1 1 48 0" strokeWidth={2} />
    <path d="M40 48l4 3M60 38v5M80 48l-4 3M38 60h5M82 60h-5" strokeOpacity={0.6} strokeWidth={1.4} />
    <path d="M60 62l12-14" strokeWidth={2.5} />
    <circle cx={60} cy={62} r={3} fill="currentColor" />
    <rect x={46} y={66} width={28} height={8} rx={1.5} fill={ACCENT} fillOpacity={0.2} stroke={ACCENT} />
    <text x={60} y={72.5} fontSize={6} textAnchor="middle" fill={ACCENT} stroke="none" fontFamily="ui-monospace, monospace">045218 mi</text>
    <path d="M104 62a14 14 0 0 1 28 0" stroke={ACCENT} strokeWidth={2.5} />
    <path d="M118 62l7-9" stroke={ACCENT} strokeWidth={2} />
    <circle cx={118} cy={62} r={2} fill={ACCENT} stroke="none" />
    <text x={102} y={71} fontSize={6} fill="currentColor" stroke="none">E</text>
    <text x={131} y={71} fontSize={6} fill="currentColor" stroke="none">F</text>
    <path d="M114 36h6v10h-6zM120 38l3 2v5" fill="none" stroke={ACCENT} strokeWidth={1.4} />
  </>
);

const ART: Record<string, React.ReactNode> = {
  front: <Face />,
  rear: <Face rear />,
  driver_side: Side,
  passenger_side: <g transform="translate(160 0) scale(-1 1)">{Side}</g>,
  front_left: <Corner />,
  rear_left: (
    <g transform="translate(160 0) scale(-1 1)">
      <Corner rear />
    </g>
  ),
  interior: Interior,
  dashboard: Dashboard,
};

/** How to frame each angle, in a few words. */
export const ANGLE_TIPS: Record<string, string> = {
  front: 'Stand back so the whole front and the number plate fit.',
  front_left: 'From the front-left corner: the front and driver side together.',
  driver_side: 'Stand level with the car and fit both wheels in the frame.',
  rear_left: 'From the rear-left corner: the back and side together.',
  rear: 'The whole rear and the number plate, straight on.',
  passenger_side: 'Stand level with the car and fit both wheels in the frame.',
  interior: 'From the open driver door: seats, floor and dashboard.',
  dashboard: 'Engine on, so the mileage and fuel level are readable.',
};

/** Illustration of the shot to take, so people know how to frame it before and while shooting. */
export function AngleGuide({ angle, className }: { angle: string; className?: string }) {
  const art = ART[angle];
  if (!art) return null;
  return (
    <svg
      viewBox="0 0 160 90"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn('pointer-events-none', className)}
    >
      {art}
    </svg>
  );
}

/** Viewfinder corners around the guide in the live camera. */
export function FrameCorners({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 60" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" aria-hidden className={cn('pointer-events-none', className)} preserveAspectRatio="none">
      <path d="M2 12V2h10M88 2h10v10M98 48v10H88M12 58H2V48" />
    </svg>
  );
}
