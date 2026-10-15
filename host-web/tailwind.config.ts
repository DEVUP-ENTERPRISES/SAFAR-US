import sharedConfig from '../frontend/tailwind.config';
import type { Config } from 'tailwindcss';

/** The guest site's design system, with content globs widened to the shared component library. */
const config: Config = {
  ...sharedConfig,
  content: ['./src/**/*.{ts,tsx}', '../frontend/src/**/*.{ts,tsx}'],
};

export default config;
