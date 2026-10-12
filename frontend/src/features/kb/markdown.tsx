import { Fragment } from 'react';
import { parseMarkdown, type Inline } from './markdown-parse';

/** Renders a help article from the shared parser; React elements only, never raw HTML. */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="text-[15px]">
      {parseMarkdown(source).map((b, i) => {
        if (b.kind === 'heading') {
          const cls = b.level === 1 ? 'mt-6 mb-2 text-2xl font-bold' : b.level === 2 ? 'mt-5 mb-2 text-xl font-semibold' : 'mt-4 mb-1 text-lg font-semibold';
          return <p key={i} className={cls}>{inline(b.content)}</p>;
        }
        if (b.kind === 'list') {
          const items = b.items.map((t, j) => <li key={j}>{inline(t)}</li>);
          return b.ordered ? <ol key={i} className="my-3 list-decimal space-y-1 ps-6">{items}</ol> : <ul key={i} className="my-3 list-disc space-y-1 ps-6">{items}</ul>;
        }
        return <p key={i} className="my-3 leading-relaxed text-foreground/90">{inline(b.content)}</p>;
      })}
    </div>
  );
}

/** Links open in a new tab; the parser already neutralised unsafe targets. */
function inline(parts: Inline[]) {
  return parts.map((p, k) =>
    p.kind === 'bold' ? (
      <strong key={k} className="font-semibold">{p.text}</strong>
    ) : p.kind === 'link' ? (
      <a key={k} href={p.href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">{p.text}</a>
    ) : (
      <Fragment key={k}>{p.text}</Fragment>
    ),
  );
}
