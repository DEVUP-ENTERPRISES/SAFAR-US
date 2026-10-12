import * as Print from 'expo-print';

/** Escapes text for the printable HTML. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** The receipts' shared page: brand styles around the given body. */
export function printableDocument(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#16130e;padding:24px;}
    h1{margin:0 0 4px;font-size:24px} h2{margin:0 0 6px;font-size:18px}
    .k{text-transform:uppercase;letter-spacing:2px;font-size:11px;color:#0e9090;margin:0 0 4px}
    .muted{color:#6f675d;font-size:13px} section{border:1px solid #e2ddd4;border-radius:14px;padding:16px;margin:16px 0}
    table{width:100%;border-collapse:collapse;margin-top:10px} td{padding:6px 0;font-size:14px} .r{text-align:right}
    tr.t td{border-top:1px solid #e2ddd4;font-weight:700;padding-top:10px}
  </style></head><body>${body}</body></html>`;
}

/** Opens the phone's print / save-as-PDF sheet; false when the phone can't print right now. */
export async function printHtml(html: string): Promise<boolean> {
  try {
    await Print.printAsync({ html });
    return true;
  } catch {
    return false;
  }
}
