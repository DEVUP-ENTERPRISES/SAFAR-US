import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Mail, MessageSquare, Moon, ShieldCheck, Smartphone } from 'lucide-react-native';
import { Button, Card, Divider, Screen, ScreenHeader, Section, Skeleton, Text, useTheme, useToast, space } from '@catodrive/ui';
import { accountApi, type NotificationCategory, type NotificationPrefs } from '../web/features/account/api';
import { NOTIFICATION_CHANNELS, NOTIFICATION_TOPICS } from '../web/features/account/notification-options';
import { enablePush } from '../push';

const ICON = { push: Smartphone, email: Mail, sms: MessageSquare };

function Row({ icon, label, detail, children }: { icon?: React.ReactNode; label: string; detail: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm }}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text variant="label">{label}</Text>
        <Text variant="caption" tone="muted">{detail}</Text>
      </View>
      {children}
    </View>
  );
}

/** Channels, quiet hours and topics, plus turning on push for this phone. Opt-out: a missing value means on. */
export function NotificationSettingsScreen() {
  const { c } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const prefs = useQuery({ queryKey: ['notification-prefs'], queryFn: () => accountApi.notificationPrefs() });
  const [draft, setDraft] = useState<NotificationPrefs>({});
  const [enabling, setEnabling] = useState(false);
  useEffect(() => {
    if (prefs.data) setDraft(prefs.data);
  }, [prefs.data]);

  const save = useMutation({
    meta: { silentError: true },
    mutationFn: () => accountApi.updateNotificationPrefs(draft),
    onSuccess: (d) => {
      qc.setQueryData(['notification-prefs'], d);
      toast({ title: 'Preferences saved', tone: 'success' });
    },
    onError: () => toast({ title: 'Could not save preferences', tone: 'error' }),
  });

  const on = (v?: boolean) => v !== false;
  const sw = (value: boolean, onValueChange: (v: boolean) => void, label: string) => (
    <Switch value={value} onValueChange={onValueChange} accessibilityLabel={label} trackColor={{ true: c.primary, false: c.muted }} thumbColor="#fff" />
  );
  const setTopic = (k: NotificationCategory, v: boolean) => setDraft((d) => ({ ...d, categories: { ...d.categories, [k]: v } }));

  return (
    <Screen header={<ScreenHeader title="Notifications" subtitle="Critical safety and security alerts are always sent." onBack={() => router.back()} />} footer={<Button title="Save preferences" loading={save.isPending} onPress={() => save.mutate()} />}>
      <Card>
        <Row icon={<Bell size={20} color={c.primary} />} label="This phone" detail="Get alerts for booking updates, messages and trip reminders.">
          <Button
            title="Enable"
            size="sm"
            variant="outline"
            full={false}
            loading={enabling}
            onPress={async () => {
              setEnabling(true);
              try {
                const ok = await enablePush();
                toast(ok ? { tone: 'success', title: 'Notifications on', body: 'We’ll alert you about your trips.' } : { tone: 'error', title: 'Notifications not enabled', body: 'Allow notifications for CatoDrive in Settings.' });
              } finally {
                setEnabling(false);
              }
            }}
          />
        </Row>
      </Card>
      {prefs.isPending ? (
        <Skeleton height={260} />
      ) : (
        <>
          <Section title="Channels">
            <Card>
              {NOTIFICATION_CHANNELS.map((ch, i) => {
                const Icon = ICON[ch.key];
                return (
                  <View key={ch.key}>
                    {i > 0 ? <Divider /> : null}
                    <Row icon={<Icon size={20} color={c.mutedForeground} />} label={ch.label} detail={ch.detail}>
                      {sw(on(draft[ch.key]), (v) => setDraft((d) => ({ ...d, [ch.key]: v })), ch.label)}
                    </Row>
                  </View>
                );
              })}
              {on(draft.sms) ? (
                <>
                  <Divider />
                  <Row icon={<MessageSquare size={20} color={c.mutedForeground} />} label="Only critical SMS" detail="Skip routine texts; still get urgent ones like security codes.">
                    {sw(draft.smsCriticalOnly === true, (v) => setDraft((d) => ({ ...d, smsCriticalOnly: v })), 'Only critical SMS')}
                  </Row>
                </>
              ) : null}
            </Card>
          </Section>
          <Section title="Quiet hours">
            <Card>
              <Row icon={<Moon size={20} color={c.mutedForeground} />} label="Pause non-urgent notifications overnight" detail="Uses your local time zone. Urgent alerts still come through.">
                {sw(draft.quietHours === true, (v) => setDraft((d) => ({ ...d, quietHours: v })), 'Quiet hours')}
              </Row>
            </Card>
          </Section>
          <Section title="Topics">
            <Card>
              {NOTIFICATION_TOPICS.map((t, i) => (
                <View key={t.key}>
                  {i > 0 ? <Divider /> : null}
                  <Row label={t.label} detail={t.detail}>{sw(on(draft.categories?.[t.key]), (v) => setTopic(t.key, v), t.label)}</Row>
                </View>
              ))}
              <Divider />
              <Row icon={<ShieldCheck size={20} color={c.mutedForeground} />} label="Security & account" detail="Login alerts, verification, and safety notices - always on.">
                <Text variant="caption" tone="muted">Always on</Text>
              </Row>
            </Card>
          </Section>
          <Text variant="caption" tone="muted" center>Applies across every channel above.</Text>
        </>
      )}
    </Screen>
  );
}
