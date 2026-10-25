import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

const SWAPS: Record<string, string> = { '□': '[ ]', '☐': '[ ]', '☑': '[x]', 'ʺ': '"', '≥': '>=', '≤': '<=', '→': '->', '\t': '    ' };

/** Keeps only characters the standard PDF font can draw, swapping the common ones for look-alikes. */
function drawable(font: PDFFont, text: string, cache: Map<string, string>): string {
  let out = '';
  for (const ch of text) {
    let ok = cache.get(ch);
    if (ok === undefined) {
      try {
        font.widthOfTextAtSize(ch, 10);
        ok = ch;
      } catch {
        ok = SWAPS[ch] ?? '?';
      }
      cache.set(ch, ok);
    }
    out += ok;
  }
  return out;
}

export interface PdfOptions {
  /** Fixed dates and producer make the bytes reproducible, so a sealed copy can be rebuilt and checked byte for byte. */
  date?: Date;
  /** Printed on every page, e.g. "Envelope CD-ENV-7K3M-92QX · Document CD-DOC-…". */
  stamp?: string;
  /** Starts on its own page: the certificate of completion. */
  appendix?: { title: string; lines: string[] };
}

export async function buildTextPdf(title: string, body: string, footer: string[], opts: PdfOptions = {}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  if (opts.date) {
    doc.setCreationDate(opts.date);
    doc.setModificationDate(opts.date);
  }
  doc.setProducer('CatoDrive');
  doc.setCreator('CatoDrive');
  doc.setTitle(title);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const cache = new Map<string, string>();
  const W = 612, H = 792, M = 54, size = 10, lead = 14;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const line = (text: string, f: PDFFont, s = size, color = rgb(0.1, 0.1, 0.12)) => {
    if (y < M + lead) newPage();
    page.drawText(text, { x: M, y, size: s, font: f, color });
    y -= s === size ? lead : s + 8;
  };
  const wrap = (text: string, f: PDFFont, s = size) => {
    const clean = drawable(f, text, cache);
    if (!clean.trim()) { y -= lead / 2; return; }
    let current = '';
    for (const word of clean.split(/\s+/)) {
      const next = current ? `${current} ${word}` : word;
      if (f.widthOfTextAtSize(next, s) > W - 2 * M && current) {
        line(current, f, s);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) line(current, f, s);
  };

  wrap(title, bold, 16);
  y -= 6;
  for (const para of body.replace(/\r\n/g, '\n').split('\n')) wrap(para, font);
  y -= lead;
  for (const f of footer) wrap(f, font, 8);
  if (opts.appendix) {
    newPage();
    wrap(opts.appendix.title, bold, 14);
    y -= 6;
    for (const l of opts.appendix.lines) wrap(l, font, 9);
  }
  if (opts.stamp) {
    const pages = doc.getPages();
    const stamp = drawable(font, opts.stamp, cache);
    pages.forEach((p, i) => p.drawText(`${stamp}  ·  Page ${i + 1} of ${pages.length}`, { x: M, y: 24, size: 7, font, color: rgb(0.45, 0.45, 0.5) }));
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}
