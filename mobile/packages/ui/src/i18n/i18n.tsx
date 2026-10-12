import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { getLocales } from 'expo-localization';

type Dictionary = Record<string, string>;

/** Translations by language. English lives in the screens as the fallback text, so only other languages are listed here. */
const dictionaries: Record<string, Dictionary> = {};

interface I18n {
  locale: string;
  t: (key: string, fallback: string, vars?: Record<string, string | number>) => string;
}

const fill = (text: string, vars?: Record<string, string | number>) =>
  vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : text;

const I18nContext = createContext<I18n>({ locale: 'en', t: (_k, f, v) => fill(f, v) });

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = getLocales()[0]?.languageCode ?? 'en';
  const value = useMemo<I18n>(() => {
    const dict = dictionaries[locale] ?? {};
    return { locale, t: (key, fallback, vars) => fill(dict[key] ?? fallback, vars) };
  }, [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
