import { View } from 'react-native';
import { Text, space } from '@catodrive/ui';
import { parseMarkdown, type Inline } from '../web/features/kb/markdown-parse';
import { openInAppBrowser, webUrl } from '../links';

function inline(parts: Inline[]) {
  return parts.map((p, k) =>
    p.kind === 'bold' ? (
      <Text key={k} variant="label">{p.text}</Text>
    ) : p.kind === 'link' ? (
      <Text key={k} tone="primary" accessibilityRole="link" style={{ textDecorationLine: 'underline' }} onPress={() => p.href !== '#' && void openInAppBrowser(p.href.startsWith('/') ? webUrl(p.href) : p.href)}>
        {p.text}
      </Text>
    ) : (
      <Text key={k}>{p.text}</Text>
    ),
  );
}

/** Help articles from the website's parser, drawn as native text. */
export function Markdown({ source }: { source: string }) {
  return (
    <View style={{ gap: space.md }}>
      {parseMarkdown(source).map((b, i) => {
        if (b.kind === 'heading') return <Text key={i} variant={b.level === 1 ? 'title' : 'heading'} accessibilityRole="header">{inline(b.content)}</Text>;
        if (b.kind === 'list') {
          return (
            <View key={i} style={{ gap: 4 }}>
              {b.items.map((t, j) => (
                <View key={j} style={{ flexDirection: 'row', gap: space.sm }}>
                  <Text>{b.ordered ? `${j + 1}.` : '•'}</Text>
                  <Text style={{ flex: 1 }}>{inline(t)}</Text>
                </View>
              ))}
            </View>
          );
        }
        return <Text key={i}>{inline(b.content)}</Text>;
      })}
    </View>
  );
}
