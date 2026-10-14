import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  BadgeCheck, Bell, BookOpen, CreditCard, FileText, FileWarning, Gift, Heart, HelpCircle, KeyRound, LifeBuoy, LogOut, Mail, MapPin, Phone, Receipt, Search, ShieldCheck, Sparkles, Trash2, User, Users, Wallet,
} from 'lucide-react-native';
import { Avatar, Badge, Button, Card, MenuRow, MenuSection, Screen, ScreenHeader, Skeleton, Text, useTheme, space, type BadgeTone } from '@catodrive/ui';
import { appInfo, openInAppBrowser, useSignOut, webUrl } from '@catodrive/core';
import { accountApi } from '@catodrive/core/web/features/account/api';
import { usePlatformConfig, usePrograms } from '@catodrive/core/web/features/platform/config';
import { useAuthStore } from '@catodrive/core/web/features/auth/store';
import { ExploreLinks } from '@/features/account/ExploreLinks';

function Legal() {
  const { c } = useTheme();
  const cfg = usePlatformConfig().data;
  return (
    <MenuSection title="Legal">
      <MenuRow icon={<FileText size={20} color={c.mutedForeground} />} label="Terms of Service" onPress={() => void openInAppBrowser(cfg?.legal?.termsUrl || webUrl('/terms'))} />
      <MenuRow icon={<ShieldCheck size={20} color={c.mutedForeground} />} label="Privacy Policy" onPress={() => void openInAppBrowser(cfg?.legal?.privacyUrl || webUrl('/privacy'))} />
      <MenuRow icon={<BookOpen size={20} color={c.mutedForeground} />} label="All policies" onPress={() => void openInAppBrowser(webUrl('/legal'))} />
    </MenuSection>
  );
}

function SignedOut() {
  const { c } = useTheme();
  const router = useRouter();
  return (
    <Screen header={<ScreenHeader title="Account" large />}>
      <Card>
        <Text variant="title">Welcome to CatoDrive</Text>
        <Text tone="muted">Sign in to book cars, see your trips and message hosts.</Text>
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          <Button title="Sign in" onPress={() => router.push('/login')} />
          <Button title="Create an account" variant="outline" onPress={() => router.push('/register')} />
        </View>
      </Card>
      <MenuSection title="Help">
        <MenuRow icon={<HelpCircle size={20} color={c.mutedForeground} />} label="Help centre" onPress={() => router.push('/help')} />
        <MenuRow icon={<Mail size={20} color={c.mutedForeground} />} label="Contact us" onPress={() => router.push('/contact')} />
      </MenuSection>
      <ExploreLinks />
      <Legal />
      <Text variant="caption" tone="muted" center>CatoDrive {appInfo.version}</Text>
    </Screen>
  );
}

const KYC_TONE: Record<string, BadgeTone> = { approved: 'success', rejected: 'destructive' };

/** The website's account menu and /account settings, as one phone menu. */
function SignedIn() {
  const { c } = useTheme();
  const router = useRouter();
  const programs = usePrograms();
  const { signOut, pending } = useSignOut('/');
  const me = useQuery({ queryKey: ['me'], queryFn: () => accountApi.me() });
  const kyc = useQuery({ queryKey: ['kyc-status'], queryFn: () => accountApi.kycStatus() });
  const icon = (I: React.ComponentType<{ size?: number; color?: string }>) => <I size={20} color={c.mutedForeground} />;
  const m = me.data;
  const name = [m?.firstName, m?.lastName].filter(Boolean).join(' ');

  return (
    <Screen header={<ScreenHeader title="Account" large />} onRefresh={() => void Promise.all([me.refetch(), kyc.refetch()])} refreshing={me.isRefetching}>
      {m ? (
        <Card onPress={() => router.push('/account/profile')} accessibilityLabel="Edit your profile">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Avatar uri={m.avatarUrl} name={name || m.email} size={60} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="heading">{name || 'Your profile'}</Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>{m.email}</Text>
              {kyc.data ? <Badge label={`ID ${kyc.data.status}`} tone={KYC_TONE[kyc.data.status] ?? 'warning'} /> : null}
            </View>
          </View>
        </Card>
      ) : (
        <Skeleton height={88} />
      )}

      {kyc.data && kyc.data.status !== 'approved' ? (
        <Card>
          <Text variant="label">Identity verification</Text>
          {kyc.data.reason ? <Text variant="caption" tone="destructive">{kyc.data.reason}</Text> : null}
          <Text variant="caption" tone="muted">Driver license + selfie verification for booking trust.</Text>
          <Button
            title={kyc.data.status === 'pending' ? 'View status' : kyc.data.status === 'rejected' ? 'Retry verification' : 'Verify identity'}
            variant={kyc.data.status === 'pending' ? 'outline' : 'primary'}
            icon={<BadgeCheck size={18} color={kyc.data.status === 'pending' ? c.foreground : c.primaryForeground} />}
            style={{ marginTop: space.md }}
            onPress={() => router.push('/account/verify-identity')}
          />
        </Card>
      ) : null}

      <MenuSection title="Your account">
        <MenuRow icon={icon(User)} label="Profile details" onPress={() => router.push('/account/profile')} />
        <MenuRow icon={icon(MapPin)} label="Saved addresses" value={m ? String(m.addresses.length) : undefined} onPress={() => router.push('/account/addresses')} />
        <MenuRow icon={icon(Phone)} label="Emergency contacts" value={m ? String(m.emergencyContacts.length) : undefined} onPress={() => router.push('/account/contacts')} />
        <MenuRow icon={icon(BadgeCheck)} label="Identity verification" value={kyc.data?.status} onPress={() => router.push('/account/verify-identity')} />
        <MenuRow icon={icon(CreditCard)} label="Payment methods" onPress={() => router.push('/account/payments')} />
        <MenuRow icon={icon(KeyRound)} label="Security and devices" onPress={() => router.push('/account/security')} />
        <MenuRow icon={icon(Bell)} label="Notifications" onPress={() => router.push('/account/notifications')} />
      </MenuSection>

      <MenuSection title="Trips and money">
        <MenuRow icon={icon(Wallet)} label="Wallet" onPress={() => router.push('/wallet')} />
        <MenuRow icon={icon(FileWarning)} label="Tickets & tolls" onPress={() => router.push('/citations')} />
        <MenuRow icon={icon(Receipt)} label="Claims" onPress={() => router.push('/claims')} />
        <MenuRow icon={icon(Heart)} label="Saved cars" onPress={() => router.navigate('/wishlist')} />
        <MenuRow icon={icon(Search)} label="Saved searches" onPress={() => router.push('/saved-searches')} />
        {programs.membership ? <MenuRow icon={icon(Sparkles)} label="Membership" onPress={() => router.push('/membership')} /> : null}
        {programs.rewards ? <MenuRow icon={icon(Gift)} label="Rewards" onPress={() => router.push('/rewards')} /> : null}
        {programs.referral ? <MenuRow icon={icon(Users)} label="Refer a friend" onPress={() => router.push('/referral')} /> : null}
      </MenuSection>

      <MenuSection title="Help">
        <MenuRow icon={icon(HelpCircle)} label="Help centre" onPress={() => router.push('/help')} />
        <MenuRow icon={icon(LifeBuoy)} label="Support" onPress={() => router.push('/support')} />
        <MenuRow icon={icon(Mail)} label="Contact us" onPress={() => router.push('/contact')} />
      </MenuSection>

      <ExploreLinks />

      <Legal />

      <MenuSection>
        <MenuRow icon={<LogOut size={20} color={c.foreground} />} label={pending ? 'Signing out…' : 'Sign out'} onPress={() => void signOut()} />
        <MenuRow icon={<Trash2 size={20} color={c.destructive} />} label="Delete account" destructive onPress={() => router.push('/account/delete')} />
      </MenuSection>
      <Text variant="caption" tone="muted" center>CatoDrive {appInfo.version}</Text>
    </Screen>
  );
}

export default function AccountTab() {
  const status = useAuthStore((s) => s.status);
  if (status === 'unauthenticated') return <SignedOut />;
  if (status === 'loading') {
    return (
      <Screen header={<ScreenHeader title="Account" large />}>
        <Skeleton height={88} />
        <Skeleton height={300} />
      </Screen>
    );
  }
  return <SignedIn />;
}
