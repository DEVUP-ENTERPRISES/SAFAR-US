import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Upload } from 'lucide-react-native';
import { Button, Text, space, useTheme, useToast } from '@catodrive/ui';
import { pickPhotos, uploadPhotos } from '@catodrive/core';
import { documentsApi } from '@catodrive/core/web/features/documents/api';
import type { Vehicle } from '@catodrive/core/web/features/vehicles/types';

type Category = 'registration' | 'insurance' | 'recall_receipt';
const LABEL: Record<Category, string> = { registration: 'registration', insurance: 'insurance', recall_receipt: 'repair receipt' };

/** Registration and insurance for this car, and the repair receipt that lifts a recall hold. */
export function SafetyDocsPanel({ vehicle, onChanged }: { vehicle: Vehicle; onChanged: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const categories: Category[] = ['registration', 'insurance', ...(vehicle.recallHold ? (['recall_receipt'] as const) : [])];
  const upload = useMutation({
    mutationFn: async (category: Category) => {
      const picked = await pickPhotos('library');
      if (!picked?.length) return null;
      const [up] = await uploadPhotos(category, picked.slice(0, 1));
      return documentsApi.create({ vehicleId: vehicle._id, category, url: up.url, key: up.key });
    },
    onSuccess: (doc) => {
      if (!doc) return;
      onChanged();
      toast({ tone: 'success', title: 'Document uploaded' });
    },
  });
  return (
    <View style={{ gap: space.md }}>
      {vehicle.recallHold ? (
        <Text variant="caption" tone="warning">This car was paused after its last trip over an open safety recall. Upload a repair receipt below - it stays paused until ops verifies it.</Text>
      ) : null}
      {categories.map((cat) => (
        <Button
          key={cat}
          title={`Upload ${LABEL[cat]}`}
          variant="outline"
          icon={<Upload size={16} color={c.foreground} />}
          loading={upload.isPending && upload.variables === cat}
          disabled={upload.isPending}
          onPress={() => upload.mutate(cat)}
        />
      ))}
      <Text variant="caption" tone="muted">A clear photo of the whole page, so every date is readable.</Text>
    </View>
  );
}
