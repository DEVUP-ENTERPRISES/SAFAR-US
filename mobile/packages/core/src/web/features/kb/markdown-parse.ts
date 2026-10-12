// Generated from frontend/src/features/kb/markdown-parse.ts by mobile/tools/sync-web.js. Edit the web file, then run `npm run sync:api`.
/**
 * A deliberately small Markdown parser for help articles - headings, bullet
 * and numbered lists, paragraphs, and inline **bold** / [links](url). It
 * returns plain data that each platform renders as its own elements (never
 * raw HTML), so untrusted article text can't inject markup.
 */
export type Inline = { kind: 'text'; text: string } | { kind: 'bold'; text: string } | { kind: 'link'; text: string; href: string };

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; content: Inline[] }
  | { kind: 'paragraph'; content: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] };

/** Inline **bold** and [text](url); a link that isn't http(s), mailto or a site path becomes "#". */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: 'bold', text: m[1] });
    else out.push({ kind: 'link', text: m[2], href: /^(https?:|mailto:|\/)/i.test(m[3]) ? m[3] : '#' });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;
  const flush = () => {
    if (list) blocks.push({ kind: 'list', ordered: list.ordered, items: list.items });
    list = null;
  };
  for (const raw of source.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ kind: 'heading', level: h[1].length as 1 | 2 | 3, content: parseInline(h[2]) });
      continue;
    }
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ol || ul) {
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push(parseInline((ol ?? ul)![1]));
      continue;
    }
    flush();
    blocks.push({ kind: 'paragraph', content: parseInline(line) });
  }
  flush();
  return blocks;
}

/** "getting-started" → "Getting Started", for help categories. */
export function titleCase(s: string): string {
  return s.replace(/(^|[-_\s])(\w)/g, (_, sep, ch) => (sep ? ' ' : '') + ch.toUpperCase()).trim();
}
