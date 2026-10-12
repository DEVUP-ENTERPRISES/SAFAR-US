import { useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, LifeBuoy, Search } from 'lucide-react-native';
import { Button, Card, Chip, EmptyState, Input, ScreenHeader, SkeletonList, Text, useTheme, space } from '@catodrive/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { kbApi } from '../web/features/kb/api';
import { titleCase } from '../web/features/kb/markdown-parse';

/** The website's /help: search and browse articles by topic, with a way to support. */
export function HelpCentreScreen({ supportPath = '/support' }: { supportPath?: string }) {
  const { c } = useTheme();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const categories = useQuery({ queryKey: ['kb-categories'], queryFn: () => kbApi.categories() });
  const articles = useQuery({ queryKey: ['kb-articles', q, category], queryFn: () => kbApi.list({ q: q.trim() || undefined, category: category ?? undefined }) });

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title="Help centre" subtitle="Search or browse by topic." onBack={router.canGoBack() ? () => router.back() : undefined} />
      <FlatList
        data={articles.data ?? []}
        keyExtractor={(a) => a.slug}
        contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: space.xxxl }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <Input value={q} onChangeText={setQ} placeholder="Search help articles…" left={<Search size={18} color={c.mutedForeground} />} returnKeyType="search" />
            {categories.data?.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                <Chip label="All" selected={category === null} onPress={() => setCategory(null)} />
                {categories.data.map((x) => <Chip key={x} label={titleCase(x)} selected={category === x} onPress={() => setCategory(x)} />)}
              </ScrollView>
            ) : null}
          </View>
        }
        renderItem={({ item: a }) => (
          <Card onPress={() => router.push({ pathname: '/help/[slug]', params: { slug: a.slug } })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label">{a.title}</Text>
                {a.summary ? <Text variant="caption" tone="muted" numberOfLines={2}>{a.summary}</Text> : null}
                <Text variant="small" tone="primary">{titleCase(a.category).toUpperCase()}</Text>
              </View>
              <ChevronRight size={18} color={c.mutedForeground} />
            </View>
          </Card>
        )}
        ListEmptyComponent={
          articles.isPending ? <SkeletonList rows={4} height={72} /> : <EmptyState icon={<Search size={28} color={c.primary} />} title={q ? 'No articles match your search' : 'No articles yet'} body={q ? 'Try different words, or reach out to support below.' : 'Check back soon.'} />
        }
        ListFooterComponent={
          <Card style={{ marginTop: space.md }}>
            <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
              <LifeBuoy size={22} color={c.primary} />
              <View style={{ flex: 1 }}>
                <Text variant="label">Still need a hand?</Text>
                <Text variant="caption" tone="muted">Our support team is here to help.</Text>
              </View>
            </View>
            <Button title="Contact support" style={{ marginTop: space.md }} onPress={() => router.push(supportPath as never)} />
          </Card>
        }
      />
    </SafeAreaView>
  );
}
