import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { CarFront, LayoutDashboard, Menu, MessageSquare, Route, Wallet } from 'lucide-react-native';
import { ErrorState, Screen, SkeletonList, fonts, useTheme } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { isNotAHost, useHostMe } from '@catodrive/core/web/features/host/hooks';
import { useIsAssetPartner } from '@catodrive/core/web/features/asset-partners/hooks';

/** The host workspace: five daily tabs, everything else under Menu. Partners and non-hosts are sent back to the start. */
function HostTabs() {
  const { c } = useTheme();
  const router = useRouter();
  const host = useHostMe();
  const isAssetPartner = useIsAssetPartner();
  const notAHost = isNotAHost(host.error);

  useEffect(() => {
    if (isAssetPartner) router.replace('/asset-partners/dashboard');
    else if (notAHost) router.replace('/');
  }, [isAssetPartner, notAHost, router]);

  if (isAssetPartner !== false || host.isPending || notAHost) {
    return (
      <Screen>
        <SkeletonList rows={4} />
      </Screen>
    );
  }
  if (host.isError) {
    return (
      <Screen contentStyle={{ justifyContent: 'center' }}>
        <ErrorState message="Couldn't load your host profile. Check your connection and try again." onRetry={() => void host.refetch()} />
      </Screen>
    );
  }
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.mutedForeground,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 10 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <LayoutDashboard size={22} color={color} /> }} />
      <Tabs.Screen name="trips" options={{ title: 'Trips', tabBarIcon: ({ color }) => <Route size={22} color={color} /> }} />
      <Tabs.Screen name="inbox" options={{ title: 'Inbox', tabBarIcon: ({ color }) => <MessageSquare size={22} color={color} /> }} />
      <Tabs.Screen name="listings" options={{ title: 'Listings', tabBarIcon: ({ color }) => <CarFront size={22} color={color} /> }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings', tabBarIcon: ({ color }) => <Wallet size={22} color={color} /> }} />
      <Tabs.Screen name="menu" options={{ title: 'Menu', tabBarIcon: ({ color }) => <Menu size={22} color={color} /> }} />
    </Tabs>
  );
}

export default function HostTabsLayout() {
  return (
    <RequireAuth>
      <HostTabs />
    </RequireAuth>
  );
}
