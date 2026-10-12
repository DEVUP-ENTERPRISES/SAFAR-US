import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { CheckSquare, FileText, LayoutDashboard, Menu, Users } from 'lucide-react-native';
import { ErrorState, Screen, SkeletonList, fonts, useTheme } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { corporateApi } from '@catodrive/core/web/features/corporate/api';

/** The corporate workspace for admins and managers: four daily tabs, the rest under Menu. */
function CorporateTabs() {
  const { c } = useTheme();
  const router = useRouter();
  const me = useQuery({ queryKey: ['corp-me'], queryFn: () => corporateApi.me(), retry: 2 });
  const role = me.data?.membership.role;
  const allowed = role === 'corp_admin' || role === 'manager';

  useEffect(() => {
    if (me.isSuccess && !allowed) router.replace('/');
  }, [me.isSuccess, allowed, router]);

  if (me.isError) {
    return (
      <Screen contentStyle={{ justifyContent: 'center' }}>
        <ErrorState message="Couldn't load your organization. Check your connection and try again." onRetry={() => void me.refetch()} />
      </Screen>
    );
  }
  if (!allowed) {
    return (
      <Screen>
        <SkeletonList rows={4} />
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
      <Tabs.Screen name="approvals" options={{ title: 'Approvals', tabBarIcon: ({ color }) => <CheckSquare size={22} color={color} /> }} />
      <Tabs.Screen name="members" options={{ title: 'Members', tabBarIcon: ({ color }) => <Users size={22} color={color} /> }} />
      <Tabs.Screen name="invoices" options={{ title: 'Invoices', tabBarIcon: ({ color }) => <FileText size={22} color={color} /> }} />
      <Tabs.Screen name="menu" options={{ title: 'Menu', tabBarIcon: ({ color }) => <Menu size={22} color={color} /> }} />
    </Tabs>
  );
}

export default function CorporateTabsLayout() {
  return (
    <RequireAuth>
      <CorporateTabs />
    </RequireAuth>
  );
}
