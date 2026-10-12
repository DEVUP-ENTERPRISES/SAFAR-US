import { useState } from 'react';
import { View } from 'react-native';
import { Badge, BottomSheet, Button, Text, space } from '@catodrive/ui';
import { SecureImage } from '@catodrive/core';
import type { PartnerDocument } from '@catodrive/core/web/features/documents/api';
import { DOC_CATEGORY_LABEL, EXPIRY_WARNING_DAYS, daysUntil } from '@catodrive/core/web/features/asset-partners/status';
import { formatDate, formatDay } from '@catodrive/core/web/lib/utils/format';

/** One uploaded document with its expiry and verification state; View opens it in a sheet. */
export function DocumentRow({ doc }: { doc: PartnerDocument }) {
  const [open, setOpen] = useState(false);
  const left = doc.expiresAt ? daysUntil(doc.expiresAt) : null;
  const expired = left !== null && left < 0;
  const expiring = left !== null && left >= 0 && left <= EXPIRY_WARNING_DAYS;
  const label = DOC_CATEGORY_LABEL[doc.category] ?? doc.category;
  return (
    <View style={{ gap: space.sm, paddingVertical: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">{label}</Text>
          <Text variant="caption" tone="muted">
            Uploaded {formatDate(doc.createdAt)}{doc.expiresAt ? ` · expires ${formatDay(doc.expiresAt)}` : ''}
          </Text>
        </View>
        <Button title="View" variant="outline" size="sm" full={false} onPress={() => setOpen(true)} />
      </View>
      {expired || expiring || doc.verification?.status === 'verified' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
          {expired ? <Badge label="Expired" tone="destructive" /> : null}
          {expiring ? <Badge label={`Expires in ${left}d`} tone="warning" /> : null}
          {doc.verification?.status === 'verified' ? <Badge label="Verified" tone="success" /> : null}
        </View>
      ) : null}
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={label}>
        {open ? <SecureImage url={doc.url} alt={label} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 12 }} /> : null}
      </BottomSheet>
    </View>
  );
}
