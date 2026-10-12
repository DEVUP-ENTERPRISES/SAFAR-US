import { useRouter } from 'expo-router';
import { BarChart3, Building2, ClipboardList, Receipt, User, Users } from 'lucide-react-native';
import { MenuRow, MenuSection, Screen, ScreenHeader, useTheme } from '@catodrive/ui';
import { useHostMe } from '@catodrive/core/web/features/host/hooks';
import { AccountMenu } from '@/features/workspace/AccountMenu';

/** Everything in the website's host sidebar that isn't a tab, plus the account menu. */
export default function HostMenuScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const host = useHostMe();
  const icon = (I: typeof User) => <I size={20} color={c.mutedForeground} />;
  return (
    <Screen header={<ScreenHeader large title="Menu" subtitle={host.data?.displayName} />}>
      <MenuSection title="Manage">
        <MenuRow icon={icon(Building2)} label="Fleet" onPress={() => router.push('/host/fleet')} />
        <MenuRow icon={icon(ClipboardList)} label="Operations" onPress={() => router.push('/host/operations')} />
        <MenuRow icon={icon(Users)} label="Captains" onPress={() => router.push('/host/team')} />
        <MenuRow icon={icon(Receipt)} label="Toll accounts" onPress={() => router.push('/host/tolls')} />
      </MenuSection>
      <MenuSection title="Money">
        <MenuRow icon={icon(BarChart3)} label="Performance" onPress={() => router.push('/host/performance')} />
      </MenuSection>
      <MenuSection title="Host">
        <MenuRow icon={icon(User)} label="Host profile" onPress={() => router.push('/host/profile')} />
      </MenuSection>
      <AccountMenu current="host" />
    </Screen>
  );
}
