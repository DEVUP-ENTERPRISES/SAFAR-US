import { useState } from 'react';
import { Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy, Gift, Share2, Users } from 'lucide-react-native';
import { Button, Card, Screen, ScreenHeader, Skeleton, Text, useTheme, space } from '@catodrive/ui';
import { RequireAuth, webUrl } from '@catodrive/core';
import { referralApi } from '@catodrive/core/web/features/rewards/api';
import { formatMoney } from '@catodrive/core/web/lib/utils/format';
import { ProgramGate } from '@/features/account/ProgramGate';

/** The website's /referral: your code and link, and how many friends joined. */
function Referral() {
  const { c } = useTheme();
  const router = useRouter();
  const { data, isPending } = useQuery({ queryKey: ['referral'], queryFn: () => referralApi.mine() });
  const [copied, setCopied] = useState(false);
  const header = <ScreenHeader title="Refer a friend" onBack={() => router.back()} />;
  if (isPending || !data) return <Screen header={header}><Skeleton height={200} /></Screen>;
  const link = webUrl(`/register?ref=${data.code}`);
  const give = formatMoney({ amount: data.rewardPerReferral.friendGetsCents, currency: 'USD' });
  const get = formatMoney({ amount: data.rewardPerReferral.youGetCents, currency: 'USD' });

  return (
    <Screen header={header}>
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Gift size={36} color={c.primary} />
        <Text variant="display" center>Give {give}, get {get}</Text>
        <Text tone="muted" center>Your friend gets credit on signup. You earn when they take their first trip.</Text>
      </View>
      <Card>
        <Text variant="small" tone="muted">YOUR REFERRAL CODE</Text>
        <Text variant="title" selectable style={{ letterSpacing: 2, marginVertical: space.sm }}>{data.code}</Text>
        <Text variant="caption" tone="muted" selectable>{link}</Text>
        <View style={{ gap: space.sm, marginTop: space.md }}>
          <Button
            title={copied ? 'Copied' : 'Copy link'}
            icon={copied ? <Check size={18} color={c.primaryForeground} /> : <Copy size={18} color={c.primaryForeground} />}
            onPress={async () => {
              await Clipboard.setStringAsync(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          />
          <Button title="Share" variant="outline" icon={<Share2 size={18} color={c.foreground} />} onPress={() => void Share.share({ message: `Get ${give} off your first CatoDrive trip: ${link}` })} />
        </View>
      </Card>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Card style={{ flex: 1 }}>
          <Users size={18} color={c.primary} />
          <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>Friends joined</Text>
          <Text variant="title">{data.referred}</Text>
        </Card>
        <Card style={{ flex: 1 }}>
          <Gift size={18} color={c.primary} />
          <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>Pending (not yet traveled)</Text>
          <Text variant="title">{data.pending}</Text>
        </Card>
      </View>
    </Screen>
  );
}

export default function ReferralScreen() {
  return (
    <RequireAuth>
      <ProgramGate program="referral" name="Refer a friend">
        <Referral />
      </ProgramGate>
    </RequireAuth>
  );
}
