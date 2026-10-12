import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Screen, ScreenHeader, Section, Text, space, useTheme } from '@catodrive/ui';
import { ACCIDENT_SHOTS, PHOTO_SHOTS, PHOTO_TIPS, SHOT_ACCENT } from '../web/features/trips/photo-guide';

/** The website's /help/photo-guide: what to photograph at pickup and return, and why each shot matters. */
export function PhotoGuideScreen() {
  const { c } = useTheme();
  const router = useRouter();
  return (
    <Screen header={<ScreenHeader title="Vehicle photo guide" onBack={() => (router.canGoBack() ? router.back() : router.replace('/help'))} />}>
      <View style={{ gap: space.sm }}>
        <Text variant="small" style={{ color: SHOT_ACCENT }}>WHY EACH SHOT MATTERS</Text>
        <Text variant="title">What to shoot, and why</Text>
        <Text tone="muted">
          Photos taken at pickup, at return and after any incident are the evidence used to settle damage charges and insurance claims. Each shot below closes a specific gap, so no panel is left unproven.
        </Text>
      </View>
      {PHOTO_TIPS.map((t) => (
        <Card key={t.title}>
          <Text variant="label">{t.title}</Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>{t.body}</Text>
        </Card>
      ))}
      <Section title="Shot by shot">
        {PHOTO_SHOTS.map((s) => (
          <Card key={s.title}>
            <Text variant="heading">{s.title}</Text>
            <Text variant="caption" style={{ color: SHOT_ACCENT, fontWeight: '600' }}>{s.shots}</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: space.xs }}>{s.how}</Text>
            <Text variant="small" tone="muted" style={{ marginTop: space.md }}>CAR RENTAL</Text>
            <Text variant="caption">{s.rental}</Text>
            <Text variant="small" tone="muted" style={{ marginTop: space.sm }}>INSURANCE CLAIM</Text>
            <Text variant="caption">{s.claim}</Text>
          </Card>
        ))}
      </Section>
      <Card>
        <Text variant="heading">If there is an accident, add these before anything moves</Text>
        <View style={{ gap: space.md, marginTop: space.md }}>
          {ACCIDENT_SHOTS.map((a) => (
            <View key={a.title} style={{ borderTopWidth: 2, borderColor: SHOT_ACCENT, paddingTop: space.sm, gap: 2 }}>
              <Text variant="label">{a.title}</Text>
              <Text variant="caption" tone="muted">{a.body}</Text>
            </View>
          ))}
        </View>
        <Text variant="caption" tone="muted" style={{ marginTop: space.md, color: c.mutedForeground }}>
          Only when it is safe. Never step into traffic for a photo, and follow local rules on moving vehicles.
        </Text>
      </Card>
    </Screen>
  );
}
