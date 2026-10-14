import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, Store } from 'lucide-react-native';
import { Button, Card, Input, RadioCard, Screen, Text, space, useTheme } from '@catodrive/ui';
import { openInAppBrowser, useSignOut, webUrl } from '@catodrive/core';
import { useOnboardHost } from '@catodrive/core/web/features/host/hooks';
import { corporateApi } from '@catodrive/core/web/features/corporate/api';
import { config } from '@catodrive/core/web/lib/config';

type Path = 'host' | 'corporate';

const HOST_POINTS = [
  'You set the price - or let Smart Price do it for you',
  'Cash out instantly, or on the standard payout schedule',
  'Every guest is verified before they can book',
];

/** An account with no workspace yet: the website's host sign-up and organisation set-up, in one place. */
export function GetStarted() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const { signOut, pending } = useSignOut('/login');
  const [path, setPath] = useState<Path>('host');
  const [displayName, setDisplayName] = useState('');
  const [org, setOrg] = useState({ name: '', billingEmail: '', domain: '' });
  const onboard = useOnboardHost();
  // The API answers "no organisation" with null; only that answer may offer set-up, never a failed request.
  const corp = useQuery({ queryKey: ['corporate-me'], queryFn: () => corporateApi.me(), retry: 2 });
  const createOrg = useMutation({
    mutationFn: () => corporateApi.createOrg(org.name.trim(), org.billingEmail.trim(), org.domain.trim() || undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['corporate-me'] });
      void qc.invalidateQueries({ queryKey: ['corp-me'] });
    },
  });
  const canCreateOrg = corp.isSuccess && corp.data === null;

  return (
    <Screen>
      <View style={{ gap: space.sm, marginTop: space.lg }}>
        <Text variant="small" tone="primary" style={{ letterSpacing: 2 }}>{`WELCOME TO ${config.appName.toUpperCase()}`}</Text>
        <Text variant="title">How will you use the app?</Text>
        <Text tone="muted">This account has no workspace yet. Pick one to set up - it takes about a minute.</Text>
      </View>

      <RadioCard selected={path === 'host'} onPress={() => setPath('host')} title="Host my car" detail="List in minutes, set your own price and keep control of your calendar." />
      <RadioCard selected={path === 'corporate'} onPress={() => setPath('corporate')} title="Company account" detail="Manage employees, budgets, policies and invoices." />

      {path === 'host' ? (
        <Card>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <Store size={20} color={c.primary} />
            <Text variant="heading">{`Become a ${config.appName} host`}</Text>
          </View>
          <View style={{ gap: space.sm, marginTop: space.md }}>
            {HOST_POINTS.map((p) => (
              <View key={p} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
                <Check size={16} color={c.primary} />
                <Text variant="caption" style={{ flex: 1 }}>{p}</Text>
              </View>
            ))}
          </View>
          <View style={{ gap: space.md, marginTop: space.lg }}>
            <Input label="Display name" hint="Shown to guests on your listings." value={displayName} onChangeText={setDisplayName} autoCapitalize="words" />
            <Button title="Start hosting" disabled={!displayName.trim()} loading={onboard.isPending} onPress={() => onboard.mutate(displayName.trim())} />
            <Text variant="caption" tone="muted" center>Free to list. You only pay when you earn.</Text>
          </View>
        </Card>
      ) : (
        <Card>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <Building2 size={20} color={c.primary} />
            <Text variant="heading">Set up your organization</Text>
          </View>
          {canCreateOrg ? (
            <View style={{ gap: space.md, marginTop: space.md }}>
              <Text variant="caption" tone="muted">Create your company workspace to manage employees, budgets, policies and invoices.</Text>
              <Input label="Company name" value={org.name} onChangeText={(name) => setOrg({ ...org, name })} />
              <Input label="Billing email" value={org.billingEmail} onChangeText={(billingEmail) => setOrg({ ...org, billingEmail })} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
              <Input label="Email domain (optional)" hint="e.g. acme.com" value={org.domain} onChangeText={(domain) => setOrg({ ...org, domain })} autoCapitalize="none" />
              <Button title="Create organization" disabled={!org.name.trim() || !org.billingEmail.trim()} loading={createOrg.isPending} onPress={() => createOrg.mutate()} />
            </View>
          ) : corp.isError ? (
            <View style={{ gap: space.md, marginTop: space.md }}>
              <Text variant="caption" tone="muted">Couldn&apos;t check whether you already belong to an organization. Check your connection and try again.</Text>
              <Button title="Try again" variant="outline" loading={corp.isFetching} onPress={() => void corp.refetch()} />
            </View>
          ) : (
            <Text variant="caption" tone="muted" style={{ marginTop: space.md }}>
              {corp.isPending ? 'Checking your account…' : 'You already belong to an organization. Ask its admin to make you a manager to use it here.'}
            </Text>
          )}
        </Card>
      )}

      <Button title="Become an Asset Partner instead" variant="ghost" onPress={() => void openInAppBrowser(webUrl('/asset-partners'))} />
      <Button title="Sign out" variant="ghost" loading={pending} onPress={() => void signOut()} />
    </Screen>
  );
}
