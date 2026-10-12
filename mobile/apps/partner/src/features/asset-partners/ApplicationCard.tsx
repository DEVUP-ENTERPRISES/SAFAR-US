import { View } from 'react-native';
import { Clock } from 'lucide-react-native';
import { Badge, Card, Text, space, useTheme } from '@catodrive/ui';
import type { PartnerApplication } from '@catodrive/core/web/features/asset-partners/api';
import { APPLICATION_STATUS, applicationStage } from '@catodrive/core/web/features/asset-partners/status';
import { formatDate } from '@catodrive/core/web/lib/utils/format';
import { StageTrack } from './StageTrack';
import { partnerBadge } from './tone';

/** One application: where it stands, the manager's note, and what happens next. */
export function ApplicationCard({ app, isEarning }: { app: PartnerApplication; isEarning: boolean }) {
  const { c } = useTheme();
  const meta = APPLICATION_STATUS[app.status];
  const rejected = app.status === 'rejected';
  return (
    <Card>
      <View style={{ gap: space.md }}>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Badge label={meta.label} tone={partnerBadge(meta.tone)} />
            <Text variant="caption" tone="muted">{app.reference}</Text>
          </View>
          <Text variant="heading">
            {app.vehicle.year} {app.vehicle.make} {app.vehicle.model}{app.vehicle.trim ? ` ${app.vehicle.trim}` : ''}
          </Text>
          <Text variant="caption" tone="muted">Applied {formatDate(app.createdAt)} · VIN {app.vehicle.vin}</Text>
        </View>
        <Text tone="muted">{meta.detail}</Text>
        {!rejected ? <StageTrack current={applicationStage(app, isEarning)} /> : null}
        {app.reviewNotes ? (
          <View style={{ borderRadius: 12, padding: space.md, gap: 4, backgroundColor: rejected ? c.destructiveSoft : c.muted }}>
            <Text variant="small" tone="muted">NOTE FROM YOUR PARTNER MANAGER</Text>
            <Text>{app.reviewNotes}</Text>
          </View>
        ) : null}
        {app.status === 'approved' && !isEarning ? (
          <View style={{ borderRadius: 12, padding: space.md, gap: 4, backgroundColor: c.primarySoft }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Clock size={16} color={c.primary} />
              <Text variant="label">Next: onboarding & inspection</Text>
            </View>
            <Text variant="caption" tone="muted">
              We’ll photograph the car, confirm the agreement and complete the inspection. Your car goes live straight after - nothing more is needed from you until we call.
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}
