import type { Config } from 'tailwindcss';

/**
 * CATO design system. Tokens are CSS-variable driven (see globals.css) so
 * light/dark is a class swap and the palette is centrally controlled.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Display is its own face now — previously it aliased the body font,
        // which is why headings never felt like headings.
        display: ['var(--font-display)', 'var(--font-sans)', 'ui-sans-serif', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        subtle: 'hsl(var(--subtle))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          soft: 'hsl(var(--primary-soft))',
        },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--success-foreground))' },
        // Both were used across the app but never mapped, so every
        // text-warning / bg-ink rendered as nothing at all.
        warning: { DEFAULT: 'hsl(var(--warning))', foreground: 'hsl(var(--warning-foreground))' },
        ink: { DEFAULT: 'hsl(var(--ink))', foreground: 'hsl(var(--ink-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontSize: {
        // Marketing display scale — fluid, so it reads big on desktop
        // without blowing out on mobile.
        'display-sm': ['clamp(2rem,1.4rem + 2.6vw,2.75rem)', { lineHeight: '1.15', letterSpacing: '-0.03em' }],
        'display': ['clamp(2.5rem,1.6rem + 4vw,4rem)', { lineHeight: '1.1', letterSpacing: '-0.035em' }],
        'display-lg': ['clamp(3rem,1.8rem + 5.5vw,5.25rem)', { lineHeight: '1.05', letterSpacing: '-0.04em' }],
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
        card: '0 2px 8px -2px rgb(0 0 0 / 0.08), 0 6px 20px -4px rgb(0 0 0 / 0.08)',
        lift: '0 10px 30px -8px rgb(0 0 0 / 0.18)',
        // Deep, layered elevation for the hero search widget & modals.
        float: '0 4px 6px -1px rgb(0 0 0 / 0.04), 0 12px 24px -6px rgb(0 0 0 / 0.12), 0 32px 64px -16px rgb(0 0 0 / 0.18)',
        glow: '0 0 0 3px hsl(var(--primary) / 0.15)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        // Used by the auth form panel and the mobile nav drawer, and never
        // defined — so the drawer popped into existence instead of sliding in
        // from the edge it is anchored to, which is the whole affordance.
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        // A gentle forward nudge — used on the step connectors so the journey
        // reads as moving 1 → 2 → 3.
        'nudge-x': {
          '0%,100%': { transform: 'translateX(0)' },
          '50%': { transform: 'translateX(5px)' },
        },
        // A bottom sheet travels its own full height, so it reads as coming up
        // from the edge of the screen. `slide-up` is a 12px content nudge and
        // is far too small to carry a panel.
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        // Subtle content entrance on route change (page transitions).
        'page-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        // A road rushing past under the loading car (background-position sweep).
        road: { to: { backgroundPositionX: '-56px' } },
        // The car gently bobs as it "drives".
        drive: {
          '0%,100%': { transform: 'translateY(0) rotate(0deg)' },
          '50%': { transform: 'translateY(-3px) rotate(-1.5deg)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.5s infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.4s cubic-bezier(0.16,1,0.3,1)',
        'scale-in': 'scale-in 0.2s ease-out',
        'slide-in-right': 'slide-in-right 0.35s cubic-bezier(0.16,1,0.3,1)',
        'nudge-x': 'nudge-x 1.5s ease-in-out infinite',
        'sheet-up': 'sheet-up 0.32s cubic-bezier(0.16,1,0.3,1)',
        'page-in': 'page-in 0.35s cubic-bezier(0.16,1,0.3,1)',
        road: 'road 0.6s linear infinite',
        drive: 'drive 1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
