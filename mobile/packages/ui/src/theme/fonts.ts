import { useFonts } from 'expo-font';
import { InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold, InstrumentSans_700Bold } from '@expo-google-fonts/instrument-sans';
import { Archivo_700Bold, Archivo_800ExtraBold } from '@expo-google-fonts/archivo';

/** Loads the website's fonts once at start-up; true when ready or when loading failed (system font fallback). */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
  });
  return loaded || !!error;
}
