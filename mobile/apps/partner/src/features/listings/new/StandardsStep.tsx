import { View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { Card, Checkbox, Text, space, useTheme } from '@catodrive/ui';
import { HOST_STANDARDS } from '@catodrive/core/web/features/vehicles/new-listing';
import { useListingDraft } from './draft-store';

/** The host's safety and quality standards, agreed before the car can be listed. */
export function StandardsStep({ errors }: { errors: Record<string, string> }) {
  const { c } = useTheme();
  const d = useListingDraft((s) => s.draft);
  const set = useListingDraft((s) => s.set);
  return (
    <View style={{ gap: space.md }}>
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <ShieldCheck size={26} color={c.primary} />
        </View>
        <Text variant="title" center>Safety & quality standards</Text>
        <Text tone="muted" center>We strive to maintain a safe marketplace and reliable experience. As a host, you’re expected to uphold these standards:</Text>
      </View>
      {HOST_STANDARDS.map((s) => (
        <Card key={s.title}>
          <Text variant="label">{s.title}</Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>{s.body}</Text>
        </Card>
      ))}
      <Checkbox checked={d.standardsAgreed} onChange={(v) => set('standardsAgreed', v)} label="I agree to uphold CatoDrive’s safety and quality standards for every trip." />
      {errors.standardsAgreed ? <Text variant="caption" tone="destructive">{errors.standardsAgreed}</Text> : null}
    </View>
  );
}
