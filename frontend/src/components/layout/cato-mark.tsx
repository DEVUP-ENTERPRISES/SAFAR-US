/**
 * The brand mark — a stylised car silhouette. Currency-, theme- and
 * size-neutral: it inherits its colour from the surface it sits on, so the same
 * component works on the coloured navbar tile and the white auth panel.
 *
 * Lives here as the single source of truth. It was previously defined inline in
 * the navbar and imported (but never created) by the auth layout, which broke
 * the production build.
 */
export function CatoMark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M4 17c3-8 13-8 16 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="8" cy="17" r="2.1" fill="currentColor" />
      <circle cx="16" cy="17" r="2.1" fill="currentColor" fillOpacity="0.6" />
    </svg>
  );
}
