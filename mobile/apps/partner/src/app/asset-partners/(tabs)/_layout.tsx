import { Tabs } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Car, FolderLock, LayoutDashboard, User, Wallet, Wrench } from 'lucide-react-native';
import { fonts, useTheme } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { assetPartnerApi } from '@catodrive/core/web/features/asset-partners/api';

/** The website's Asset Partner phone bar: six tabs, Repairs badged with what waits on the partner. */
export default function AssetPartnerTabs() {
  const { c } = useTheme();
  const pending = useQuery({ queryKey: ['asset-partner-maintenance', 'pending'], queryFn: () => assetPartnerApi.maintenance('pending'), retry: false });
  const waiting = pending.data?.length ?? 0;
  return (
    <RequireAuth>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: c.primary,
          tabBarInactiveTintColor: c.mutedForeground,
          tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
          tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 10 },
        }}
      >
        <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <LayoutDashboard size={22} color={color} /> }} />
        <Tabs.Screen name="vehicles" options={{ title: 'Vehicles', tabBarIcon: ({ color }) => <Car size={22} color={color} /> }} />
        <Tabs.Screen name="statements" options={{ title: 'Earnings', tabBarIcon: ({ color }) => <Wallet size={22} color={color} /> }} />
        <Tabs.Screen
          name="maintenance"
          options={{ title: 'Repairs', tabBarBadge: waiting > 0 ? waiting : undefined, tabBarIcon: ({ color }) => <Wrench size={22} color={color} /> }}
        />
        <Tabs.Screen name="documents" options={{ title: 'Docs', tabBarIcon: ({ color }) => <FolderLock size={22} color={color} /> }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <User size={22} color={color} /> }} />
      </Tabs>
    </RequireAuth>
  );
}
