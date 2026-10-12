import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { palettes, type Palette } from './tokens';

interface Theme {
  c: Palette;
  dark: boolean;
}

const ThemeContext = createContext<Theme>({ c: palettes.light, dark: false });

/** Follows the phone's light/dark setting, like the website follows the browser's. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const dark = useColorScheme() === 'dark';
  const value = useMemo(() => ({ c: dark ? palettes.dark : palettes.light, dark }), [dark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
