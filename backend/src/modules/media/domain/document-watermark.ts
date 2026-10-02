import sharp from 'sharp';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

/** Longest side of a stamped image: sharp enough to read, small enough to send quickly. */
const MAX_SIDE = 1800;

const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

function overlaySvg(width: number, height: number, lines: string[]): Buffer {
  const size = Math.max(14, Math.round(Math.min(width, height) / 28));
  const step = size * 7;
  const text = xml(lines.join('  ·  '));
  const rows: string[] = [];
  for (let y = -height; y < height * 2; y += step) {
    rows.push(`<text x="${-width}" y="${y}">${`${text}     `.repeat(4)}</text>`);
  }
  const bar = Math.round(size * 2.2);
  // Shrink the bottom line until it fits the width (about 0.55 em per character).
  const label = Math.max(8, Math.min(size * 0.8, (width - size * 2) / (lines.join('  ·  ').length * 0.55)));
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<g transform="rotate(-30 ${width / 2} ${height / 2})" font-family="DejaVu Sans, Arial, sans-serif" font-size="${size}" font-weight="700" fill="#b00020" fill-opacity="0.22">${rows.join('')}</g>` +
      `<rect x="0" y="${height - bar}" width="${width}" height="${bar}" fill="#000" fill-opacity="0.6"/>` +
      `<text x="${size}" y="${height - bar / 2 + size / 3}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${label.toFixed(1)}" fill="#fff">${text}</text>` +
      `</svg>`,
  );
}

/** Burn the viewer's stamp into an image; the plain file never leaves the server. */
export async function stampImage(input: Buffer, lines: string[]): Promise<Buffer> {
  const { data, info } = await sharp(input, { failOn: 'error' })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .toBuffer({ resolveWithObject: true });
  return sharp(data)
    .composite([{ input: overlaySvg(info.width, info.height, lines), top: 0, left: 0 }])
    .jpeg({ quality: 82 })
    .toBuffer();
}

/** Stamp every page of a PDF the same way, and drop its title, author and other metadata. */
export async function stampPdf(input: Buffer, lines: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.load(input, { ignoreEncryption: true, updateMetadata: false });
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  // The built-in PDF font covers Latin-1 only; anything else would stop the stamp.
  const text = lines.join('  ·  ').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?');
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.max(9, Math.min(width, height) / 32);
    for (let y = -height; y < height * 2; y += size * 7) {
      page.drawText(`${text}     `.repeat(3), { x: -width / 2, y, size, font, color: rgb(0.69, 0, 0.13), opacity: 0.2, rotate: degrees(30) });
    }
    page.drawRectangle({ x: 0, y: 0, width, height: size * 2.2, color: rgb(0, 0, 0), opacity: 0.6 });
    const label = Math.min(size * 0.8, (width - size * 2) / font.widthOfTextAtSize(text, 1));
    page.drawText(text, { x: size, y: size * 0.75, size: label, font, color: rgb(1, 1, 1) });
  }
  pdf.setTitle('Vehicle document');
  pdf.setAuthor('CatoDrive');
  pdf.setSubject('');
  pdf.setKeywords([]);
  pdf.setProducer('CatoDrive');
  pdf.setCreator('CatoDrive');
  return Buffer.from(await pdf.save());
}

const isPdf = (b: Buffer) => b.subarray(0, 5).toString('latin1') === '%PDF-';

/** The stamped file and its type, or null when it is not a picture or PDF we can read. */
export async function stampDocument(input: Buffer, lines: string[]): Promise<{ contentType: 'image/jpeg' | 'application/pdf'; body: Buffer } | null> {
  try {
    if (isPdf(input)) return { contentType: 'application/pdf', body: await stampPdf(input, lines) };
    return { contentType: 'image/jpeg', body: await stampImage(input, lines) };
  } catch {
    return null;
  }
}
