import sharedConfig from '../frontend/tailwind.config';
import type { Config } from 'tailwindcss';

/**
 * Reuses the public app's entire design system (tokens, fonts, shadows) and
 * only widens the content globs, so Tailwind keeps classes used by the shared
 * component library that this app pulls in from ../frontend/src.
 */
const config: Config = {
  ...sharedConfig,
  content: ['./src/**/*.{ts,tsx}', '../frontend/src/**/*.{ts,tsx}'],
};

export default config;
