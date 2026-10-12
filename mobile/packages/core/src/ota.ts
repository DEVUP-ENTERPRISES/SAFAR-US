import * as Updates from 'expo-updates';

/** Downloads a JavaScript-only fix in the background; it applies on the next launch, never mid-use. */
export async function checkForOtaUpdate(): Promise<void> {
  if (__DEV__ || !Updates.isEnabled) return;
  try {
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) await Updates.fetchUpdateAsync();
  } catch {
    /* no update server or offline: keep the running version */
  }
}
