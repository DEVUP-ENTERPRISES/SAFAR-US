import { Tabs } from 'expo-router';
import { CarFront, Heart, House, MessageSquare, Search, User } from 'lucide-react-native';
import { fonts, useTheme } from '@catodrive/ui';
import { useAuthStore } from '@catodrive/core/web/features/auth/store';

/** The website's phone tab bar: six equal tabs, Account becomes Sign in when signed out. */
export default function TabsLayout() {
  const { c } = useTheme();
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
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
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <House size={22} color={color} /> }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: ({ color }) => <Search size={22} color={color} /> }} />
      <Tabs.Screen name="wishlist" options={{ title: 'Saved', tabBarIcon: ({ color }) => <Heart size={22} color={color} /> }} />
      <Tabs.Screen name="bookings" options={{ title: 'Trips', tabBarIcon: ({ color }) => <CarFront size={22} color={color} /> }} />
      <Tabs.Screen name="messages" options={{ title: 'Inbox', tabBarIcon: ({ color }) => <MessageSquare size={22} color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: signedIn ? 'Account' : 'Sign in', tabBarIcon: ({ color }) => <User size={22} color={color} /> }} />
    </Tabs>
  );
}
