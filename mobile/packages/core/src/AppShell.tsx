import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider, ThemeProvider, ToastProvider, useAppFonts, useTheme, useToast } from '@catodrive/ui';
import { hydrateTokens } from './web/lib/api/token-store';
import { createQueryClient } from './query-client';
import { installGlobalErrorHandlers, setErrorNotifier } from './errors';
import { setLinkNotifier } from './links';
import { UpdateGate } from './UpdateGate';
import { SessionBootstrap } from './SessionBootstrap';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
installGlobalErrorHandlers();

function QueryLayer({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [client] = useState(() => createQueryClient((message) => toast({ tone: 'error', title: "That didn't go through", body: message })));
  useEffect(() => {
    setErrorNotifier((message) => toast({ tone: 'error', title: message }));
    setLinkNotifier((message) => toast({ tone: 'error', title: message }));
  }, [toast]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function ThemedStatusBar() {
  const { dark } = useTheme();
  return <StatusBar style={dark ? 'light' : 'dark'} />;
}

/**
 * Every app's root: GestureHandler > SafeArea > Theme > I18n > Toast > Query >
 * UpdateGate > session bootstrap > routes. The splash stays up until fonts and
 * saved tokens are loaded, so the first frame is already signed in or out.
 */
export function AppShell({ children, resolveLink }: { children: ReactNode; resolveLink: (link: string | undefined | null) => string }) {
  const fontsReady = useAppFonts();
  const [tokensReady, setTokensReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    void hydrateTokens().finally(() => setTokensReady(true));
  }, []);
  useEffect(() => {
    if (fontsReady && tokensReady) void SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsReady, tokensReady]);

  const openLink = useCallback((deepLink: string | undefined) => router.push(resolveLink(deepLink) as never), [router, resolveLink]);

  if (!fontsReady || !tokensReady) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ThemedStatusBar />
          <I18nProvider>
            <ToastProvider>
              <QueryLayer>
                <UpdateGate>
                  <SessionBootstrap openLink={openLink}>{children}</SessionBootstrap>
                </UpdateGate>
              </QueryLayer>
            </ToastProvider>
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
