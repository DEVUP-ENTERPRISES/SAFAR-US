import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Mail, Phone } from 'lucide-react-native';
import { Badge, Card, ErrorState, KeyValue, MenuRow, Screen, ScreenHeader, SkeletonList, Text, space, useTheme, useToast } from '@catodrive/ui';
import { openInAppBrowser, webUrl } from '@catodrive/core';
import { assetPartnerApi } from '@catodrive/core/web/features/asset-partners/api';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { formatMoney } from '@catodrive/core/web/lib/utils/format';
import { PayoutDetailsCard } from '@/features/asset-partners/PayoutDetailsCard';
import { ordinal } from '@/features/asset-partners/tone';
import { AccountMenu } from '@/features/workspace/AccountMenu';

const usd = (amount: number) => formatMoney({ amount, currency: 'USD' });

/** The website's /asset-partners/profile (payout details and programme terms) plus the account menu. */
export default function PartnerProfileScreen() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const dash = useQuery({ queryKey: ['asset-partner-dashboard'], queryFn: () => assetPartnerApi.dashboard() });
  const me = useQuery({ queryKey: ['asset-partner-me'], queryFn: () => assetPartnerApi.me() });
  const [mailingAddress, setMailingAddress] = useState('');
  const [zelleHandle, setZelleHandle] = useState('');
  const [touched, setTouched] = useState(false);

  const saved = me.data?.partner?.payoutDetails;
  if (!touched && saved) {
    if (mailingAddress === '' && saved.mailingAddress) setMailingAddress(saved.mailingAddress);
    if (zelleHandle === '' && saved.zelleHandle) setZelleHandle(saved.zelleHandle);
  }

  const savePayout = useMutation({
    meta: { silentError: true },
    mutationFn: () => assetPartnerApi.setPayoutDetails({ mailingAddress, zelleHandle }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['asset-partner-me'] });
      toast({ tone: 'success', title: 'Payout details saved' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not save' }),
  });

  const terms = me.data?.terms;
  const partner = me.data?.partner;
  const partnerApp = dash.data?.applications[0];
  const icon = (I: typeof Mail) => <I size={20} color={c.mutedForeground} />;

  return (
    <Screen
      header={<ScreenHeader large title="Payout & profile" subtitle="Where your monthly net goes, and the terms it’s calculated on." />}
      onRefresh={() => {
        void me.refetch();
        void dash.refetch();
      }}
      refreshing={me.isRefetching}
    >
      {dash.isPending || me.isPending ? <SkeletonList rows={2} height={160} /> : null}
      {me.isError || dash.isError ? <ErrorState message="We couldn’t load your profile." onRetry={() => { void me.refetch(); void dash.refetch(); }} /> : null}
      {me.isSuccess && dash.isSuccess && !partner ? (
        <Card>
          <Text tone="muted">This opens once your application is approved and you’re enrolled in the programme.</Text>
        </Card>
      ) : null}
      {partner && dash.data ? (
        <>
          <Card>
            <Text variant="heading">Contact on file</Text>
            <View style={{ marginTop: space.xs }}>
              <MenuRow icon={icon(Building2)} label="Name" value={partner.displayName} />
              {partnerApp?.email ? <MenuRow icon={icon(Mail)} label="Email" value={partnerApp.email} /> : null}
              {partnerApp?.phone ? <MenuRow icon={icon(Phone)} label="Phone" value={partnerApp.phone} /> : null}
            </View>
            <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>
              To correct your name, email or phone, update your{' '}
              <Text variant="caption" tone="primary" onPress={() => void openInAppBrowser(webUrl('/account'))}>account settings</Text>.
            </Text>
          </Card>
          {terms ? (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md }}>
                <Text variant="heading" style={{ flex: 1 }}>Programme terms</Text>
                {terms.negotiated ? <Badge label="Negotiated" tone="warning" /> : null}
              </View>
              <View style={{ gap: space.sm }}>
                <KeyValue label="Management fee" value={`${terms.managementFeeBps / 100}%`} />
                <KeyValue label="Fleet insurance" value={`${usd(terms.insuranceMonthlyCents)}/mo per vehicle`} />
                <KeyValue label="Detailing" value={`${usd(terms.detailingMonthlyCents)}/mo per vehicle`} />
                <KeyValue label="Your deductible cap" value={`${usd(terms.deductibleCapCents)} per incident`} />
                <KeyValue label="Approval needed above" value={usd(terms.maintenanceApprovalCents)} />
                <KeyValue label="Paid on" value={`the ${terms.payoutDayOfMonth}${ordinal(terms.payoutDayOfMonth)} of each month`} />
              </View>
            </Card>
          ) : null}
          <PayoutDetailsCard
            method={terms?.payoutMethod}
            mailingAddress={mailingAddress}
            setMailingAddress={(v) => { setTouched(true); setMailingAddress(v); }}
            zelleHandle={zelleHandle}
            setZelleHandle={(v) => { setTouched(true); setZelleHandle(v); }}
            onSave={() => savePayout.mutate()}
            saving={savePayout.isPending}
          />
        </>
      ) : null}
      <AccountMenu current="asset-partner" />
    </Screen>
  );
}
