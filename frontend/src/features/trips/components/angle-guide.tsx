import { cn } from '@/lib/utils/cn';

// A side profile facing left; the other views are built from the same few shapes.
const SIDE = (
  <>
    <path d="M8 50V41q2-7 14-9l16-2 12-12q4-3 10-3h22q6 0 10 5l10 10 8 2q4 2 4 8v9z" />
    <path d="M43 30l9-10h18v10zM74 20h14l8 10H74z" />
    <circle cx="30" cy="52" r="8" />
    <circle cx="92" cy="52" r="8" />
  </>
);

const CORNER = (
  <>
    <path d="M10 54V41q2-8 12-10l8-1 12-12q3-3 8-3h34q6 0 10 5l10 10q8 2 8 10v14z" />
    <path d="M30 30v24M34 30l10-11h16v11zM64 19h20l9 11H64z" />
    <rect x="13" y="36" width="12" height="5" rx="2" />
    <ellipse cx="22" cy="55" rx="5" ry="8" />
    <circle cx="94" cy="54" r="8" />
  </>
);

const FACE = (
  <>
    <path d="M18 56V38q2-8 12-10l8-12q2-3 8-3h28q6 0 8 3l8 12q10 2 12 10v18z" />
    <path d="M40 18h40l6 10H34z" />
    <rect x="22" y="56" width="12" height="8" rx="2" />
    <rect x="86" y="56" width="12" height="8" rx="2" />
  </>
);

const ART: Record<string, React.ReactNode> = {
  front: (
    <>
      {FACE}
      <rect x="24" y="36" width="14" height="6" rx="2" />
      <rect x="82" y="36" width="14" height="6" rx="2" />
      <rect x="48" y="38" width="24" height="8" rx="2" />
    </>
  ),
  rear: (
    <>
      {FACE}
      <path d="M22 38h18M80 38h18" strokeWidth="4" />
      <rect x="50" y="42" width="20" height="8" rx="1.5" />
    </>
  ),
  driver_side: SIDE,
  passenger_side: <g transform="translate(120 0) scale(-1 1)">{SIDE}</g>,
  front_left: CORNER,
  rear_left: <g transform="translate(120 0) scale(-1 1)">{CORNER}</g>,
  interior: (
    <>
      <path d="M8 30q52-14 104 0" />
      <circle cx="42" cy="44" r="15" />
      <circle cx="42" cy="44" r="3" />
      <path d="M27 44h12M45 44h12M42 47v12" />
      <path d="M78 64V42q0-6 6-6h12q6 0 6 6v22" />
    </>
  ),
  dashboard: (
    <>
      <path d="M28 54a32 32 0 0 1 64 0" />
      <path d="M60 54l16-18" strokeWidth="3" />
      <path d="M32 44l5 3M88 44l-5 3M60 26v6" />
      <text x="30" y="64" fontSize="8" fill="currentColor" stroke="none">E</text>
      <text x="86" y="64" fontSize="8" fill="currentColor" stroke="none">F</text>
    </>
  ),
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

/** Outline of the shot to take, so people know how to frame it before and while shooting. */
export function AngleGuide({ angle, className }: { angle: string; className?: string }) {
  const art = ART[angle];
  if (!art) return null;
  return (
    <svg
      viewBox="0 0 120 72"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn('pointer-events-none', className)}
    >
      {art}
    </svg>
  );
}
