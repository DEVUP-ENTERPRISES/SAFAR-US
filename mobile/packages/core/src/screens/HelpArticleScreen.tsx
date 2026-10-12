import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { LifeBuoy, ThumbsDown, ThumbsUp } from 'lucide-react-native';
import { Button, Card, ErrorState, Screen, ScreenHeader, Skeleton, Text, useTheme, space } from '@catodrive/ui';
import { kbApi } from '../web/features/kb/api';
import { titleCase } from '../web/features/kb/markdown-parse';
import { Markdown } from '../components/Markdown';

/** One help article, with "Was this helpful?" and a way to support. */
export function HelpArticleScreen({ supportPath = '/support' }: { supportPath?: string }) {
  const { c } = useTheme();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [voted, setVoted] = useState<null | 'up' | 'down'>(null);
  const article = useQuery({ queryKey: ['kb-article', slug], queryFn: () => kbApi.get(slug), retry: false });
  const vote = useMutation({ mutationFn: (helpful: boolean) => kbApi.vote(slug, helpful), onSuccess: (_d, helpful) => setVoted(helpful ? 'up' : 'down') });
  const header = <ScreenHeader title="Help centre" onBack={() => (router.canGoBack() ? router.back() : router.replace('/help'))} />;

  if (article.isPending) return <Screen header={header}><Skeleton height={32} width="70%" /><Skeleton height={240} /></Screen>;
  if (article.isError || !article.data) return <Screen header={header}><ErrorState message="We couldn’t find that article." /></Screen>;
  const a = article.data;
  return (
    <Screen header={header}>
      <View style={{ gap: space.sm }}>
        <Text variant="small" tone="primary">{titleCase(a.category).toUpperCase()}</Text>
        <Text variant="display">{a.title}</Text>
        {a.summary ? <Text tone="muted">{a.summary}</Text> : null}
      </View>
      <Markdown source={a.body} />
      <Card>
        {voted ? (
          <Text>{voted === 'up' ? 'Thanks for the feedback!' : 'Thanks - we’ll work on making this clearer.'}</Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
            <Text variant="label" style={{ flex: 1 }}>Was this helpful?</Text>
            <Button title="Yes" size="sm" variant="outline" full={false} icon={<ThumbsUp size={14} color={c.foreground} />} loading={vote.isPending} onPress={() => vote.mutate(true)} />
            <Button title="No" size="sm" variant="outline" full={false} icon={<ThumbsDown size={14} color={c.foreground} />} loading={vote.isPending} onPress={() => vote.mutate(false)} />
          </View>
        )}
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <LifeBuoy size={20} color={c.primary} />
          <Text style={{ flex: 1 }}>Didn’t solve it? Our team can help.</Text>
        </View>
        <Button title="Contact support" style={{ marginTop: space.md }} onPress={() => router.push(supportPath as never)} />
      </Card>
    </Screen>
  );
}
