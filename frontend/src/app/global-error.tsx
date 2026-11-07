'use client';

/** When even the app's frame fails: plain styles only, because the stylesheet may not have loaded. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#fff', color: '#111' }}>
        <main style={{ maxWidth: 440, margin: '0 auto', padding: '96px 16px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#555', margin: '0 0 24px' }}>Your data is safe. Try again, or refresh the page if it keeps happening.</p>
          <button type="button" onClick={reset} style={{ height: 40, padding: '0 20px', borderRadius: 8, border: 0, background: '#0c7979', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Try again</button>
          {error.digest && <p style={{ marginTop: 16, fontFamily: 'monospace', fontSize: 12, color: '#777' }}>Reference {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
