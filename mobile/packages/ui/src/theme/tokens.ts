/** Same palette as the website (frontend/src/styles/globals.css), in hex. */
export const palettes = {
  light: {
    background: '#f8f6f2',
    foreground: '#16130e',
    subtle: '#f1efe9',
    card: '#ffffff',
    primary: '#0e9090',
    primaryForeground: '#ffffff',
    primarySoft: '#e6f4f4',
    secondary: '#f1efe9',
    muted: '#f1eeea',
    mutedForeground: '#6f675d',
    destructive: '#c9372c',
    destructiveForeground: '#ffffff',
    destructiveSoft: '#fbeceb',
    success: '#12875e',
    successSoft: '#e5f4ee',
    warning: '#c06c0c',
    warningSoft: '#fbf0e3',
    border: '#e2ddd4',
    input: '#e2ddd4',
    ink: '#15120f',
    inkForeground: '#f3efe8',
    overlay: 'rgba(21,18,15,0.45)',
  },
  dark: {
    background: '#15120f',
    foreground: '#f3efe8',
    subtle: '#1d1a16',
    card: '#201c18',
    primary: '#34b2b2',
    primaryForeground: '#15120f',
    primarySoft: '#0d2a2b',
    secondary: '#312c26',
    muted: '#2e2924',
    mutedForeground: '#a69d91',
    destructive: '#e6675c',
    destructiveForeground: '#15120f',
    destructiveSoft: '#3a1d1a',
    success: '#36b588',
    successSoft: '#11291f',
    warning: '#f6ae31',
    warningSoft: '#33240c',
    border: '#2d2820',
    input: '#363026',
    ink: '#1d1a16',
    inkForeground: '#f3efe8',
    overlay: 'rgba(0,0,0,0.6)',
  },
} as const;

export type Palette = { [K in keyof (typeof palettes)['light']]: string };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

/** Website --radius is 0.85rem (13.6px); sm/md/lg/xl follow its scale. */
export const radius = { sm: 10, md: 12, lg: 14, xl: 18, pill: 999 } as const;

export const fonts = {
  regular: 'InstrumentSans_400Regular',
  medium: 'InstrumentSans_500Medium',
  semibold: 'InstrumentSans_600SemiBold',
  bold: 'InstrumentSans_700Bold',
  display: 'Archivo_700Bold',
  displayHeavy: 'Archivo_800ExtraBold',
} as const;

export const type = {
  display: { fontFamily: fonts.displayHeavy, fontSize: 30, lineHeight: 34, letterSpacing: -0.9 },
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.5 },
  heading: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 23 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  small: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0.3 },
} as const;

export type TypeVariant = keyof typeof type;

/** Minimum touch target, in dp. */
export const TOUCH = 48;
