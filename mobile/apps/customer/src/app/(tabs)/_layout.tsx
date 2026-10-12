import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CarFront, Heart, House, MessageSquare, Search, User } from 'lucide-react-native';
import { fonts, useTheme } from '@catodrive/ui';
import { useAuthStore } from '@catodrive/core/web/features/auth/store';
import { CompareBar } from '@/features/compare/CompareBar';

/** The website's phone tab bar: six equal tabs, Account becomes Sign in when signed out; the compare tray floats above it. */
export default function TabsLayout() {
  const { c } = useTheme();
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
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
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 56 + insets.bottom }}>
        <CompareBar />
      </View>
    </View>
  );
}
