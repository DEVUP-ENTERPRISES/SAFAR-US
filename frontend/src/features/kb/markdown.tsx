import { Fragment, type ReactNode } from 'react';

/**
 * A deliberately small Markdown renderer for help articles — headings, bullet
 * and numbered lists, paragraphs, and inline **bold** / [links](url). It builds
 * React elements (never dangerouslySetInnerHTML), so untrusted article text
 * can't inject markup. Anything fancier than this belongs in a real library,
 * but help copy rarely needs more.
 */
export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((t, i) => <li key={i}>{inline(t)}</li>);
    blocks.push(
      list.ordered
        ? <ol key={blocks.length} className="my-3 list-decimal space-y-1 pl-6">{items}</ol>
        : <ul key={blocks.length} className="my-3 list-disc space-y-1 pl-6">{items}</ul>,
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushList(); continue; }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushList();
      const level = h[1].length;
      const cls = level === 1 ? 'mt-6 mb-2 text-2xl font-bold' : level === 2 ? 'mt-5 mb-2 text-xl font-semibold' : 'mt-4 mb-1 text-lg font-semibold';
      blocks.push(<p key={blocks.length} className={cls}>{inline(h[2])}</p>);
      continue;
    }

    const ol = /^\d+\.\s+(.*)$/.exec(line);
    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ol || ul) {
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push((ol ?? ul)![1]);
      continue;
    }

    flushList();
    blocks.push(<p key={blocks.length} className="my-3 leading-relaxed text-foreground/90">{inline(line)}</p>);
  }
  flushList();

  return <div className="text-[15px]">{blocks}</div>;
}

/** Inline **bold** and [text](url). Links open safely in a new tab. */
function inline(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>);
    if (m[1] !== undefined) {
      nodes.push(<strong key={key++} className="font-semibold">{m[1]}</strong>);
    } else {
      const href = m[3];
      const safe = /^(https?:|mailto:|\/)/i.test(href) ? href : '#';
      nodes.push(
        <a key={key++} href={safe} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">
          {m[2]}
        </a>,
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return nodes;
}
