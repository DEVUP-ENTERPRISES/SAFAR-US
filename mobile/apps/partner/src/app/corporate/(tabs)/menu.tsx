import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Wallet } from 'lucide-react-native';
import { MenuRow, MenuSection, Screen, ScreenHeader, useTheme } from '@catodrive/ui';
import { corporateApi } from '@catodrive/core/web/features/corporate/api';
import { AccountMenu } from '@/features/workspace/AccountMenu';

/** The rest of the website's corporate sidebar, plus the account menu. */
export default function CorporateMenuScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const me = useQuery({ queryKey: ['corp-me'], queryFn: () => corporateApi.me() });
  return (
    <Screen header={<ScreenHeader large title="Menu" subtitle={me.data?.org.name} />}>
      <MenuSection title="Manage">
        <MenuRow icon={<Wallet size={20} color={c.mutedForeground} />} label="Cost centers" onPress={() => router.push('/corporate/cost-centers')} />
        <MenuRow icon={<ShieldCheck size={20} color={c.mutedForeground} />} label="Travel policy" onPress={() => router.push('/corporate/policy')} />
      </MenuSection>
      <AccountMenu current="corporate" />
    </Screen>
  );
}
