import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';

/**
 * Seed helper: builds REAL, simple, multi-page PDFs (pdf-lib) with synthetic content so
 * previews, downloads and SHA-256 hashes are genuine. Page 2 always carries a recognisable
 * marker string ("NEXUS-SEED-…") so a reviewer can tell the stored file is the one they uploaded/opened.
 */

export type PdfBlock =
  | { type: 'h'; text: string }
  | { type: 'p'; text: string }
  | { type: 'kv'; rows: Array<[string, string]> }
  | { type: 'table'; head: string[]; rows: string[][]; widths?: number[] };

export interface PdfPageSpec {
  heading?: string;
  blocks: PdfBlock[];
}

export interface PdfSpec {
  title: string;
  subtitle?: string;
  /** Reference printed in the header and used for the page-2 marker */
  reference: string;
  /** Cover-page key/value lines */
  meta?: Array<[string, string]>;
  pages?: PdfPageSpec[];
  /** Override the page-2 marker text (defaults to NEXUS-SEED-<reference>) */
  marker?: string;
}

const A4: [number, number] = [595.28, 841.89];
const M = 56;
const INK = rgb(0.09, 0.1, 0.12);
const MUTED = rgb(0.4, 0.43, 0.48);
const LINE = rgb(0.85, 0.87, 0.9);
const HEAD_BG = rgb(0.96, 0.965, 0.975);

function safe(font: PDFFont, text: string): string {
  const set = font.getCharacterSet();
  const map: Record<string, string> = { '≈': '~', '−': '-', '→': '->', '≥': '>=', '≤': '<=', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', ' ': ' ' };
  let out = '';
  for (const ch of text.replace(/\r/g, '')) {
    const c = map[ch] ?? ch;
    for (const cc of c) out += set.includes(cc.codePointAt(0)!) || cc === '\n' ? cc : '?';
  }
  return out;
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of safe(font, text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const trial = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(trial, size) <= maxWidth) line = trial;
      else {
        if (line) lines.push(line);
        line = w;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function buildPdf(spec: PdfSpec): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(spec.title);
  pdf.setAuthor('Matanho Asset Management (synthetic demo)');
  pdf.setCreator('Matanho Nexus seed');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = A4[0];
  const H = A4[1];
  const contentW = W - 2 * M;
  const pages: PDFPage[] = [];

  const newPage = (): { page: PDFPage; y: number } => {
    const page = pdf.addPage(A4);
    pages.push(page);
    page.drawText('matanho', { x: M, y: H - 44, size: 15, font: bold, color: INK });
    page.drawText(safe(font, spec.reference), { x: W - M - font.widthOfTextAtSize(safe(font, spec.reference), 8.5), y: H - 40, size: 8.5, font, color: MUTED });
    page.drawLine({ start: { x: M, y: H - 54 }, end: { x: W - M, y: H - 54 }, thickness: 1.2, color: INK });
    return { page, y: H - 82 };
  };

  // ── cover ──
  let { page, y } = newPage();
  y -= 90;
  for (const l of wrap(bold, spec.title, 24, contentW)) {
    page.drawText(l, { x: M, y, size: 24, font: bold, color: INK });
    y -= 30;
  }
  if (spec.subtitle) {
    y -= 4;
    for (const l of wrap(font, spec.subtitle, 12, contentW)) {
      page.drawText(l, { x: M, y, size: 12, font, color: MUTED });
      y -= 17;
    }
  }
  y -= 24;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: LINE });
  y -= 22;
  for (const [k, v] of spec.meta ?? []) {
    page.drawText(safe(font, k.toUpperCase()), { x: M, y, size: 7.5, font: bold, color: MUTED });
    page.drawText(safe(font, v), { x: M + 140, y, size: 10, font, color: INK });
    y -= 20;
  }
  page.drawText('Synthetic demonstration document. Not a real financial, legal or identity record.', { x: M, y: 70, size: 8, font, color: MUTED });

  const body: PdfPageSpec[] = spec.pages?.length ? spec.pages : [{ heading: 'Summary', blocks: [{ type: 'p', text: 'This document contains synthetic demonstration content.' }] }];

  const ensure = (need: number) => {
    if (y - need < 70) ({ page, y } = newPage());
  };

  body.forEach((pg, idx) => {
    ({ page, y } = newPage());
    if (pg.heading) {
      page.drawText(safe(bold, pg.heading), { x: M, y, size: 16, font: bold, color: INK });
      y -= 26;
    }
    if (idx === 0) {
      // page 2 of the file: recognisable marker
      const marker = spec.marker ?? `NEXUS-SEED-${spec.reference}`;
      page.drawRectangle({ x: M, y: y - 22, width: contentW, height: 26, color: HEAD_BG });
      page.drawText(`Verification marker: ${safe(font, marker)}`, { x: M + 10, y: y - 14, size: 9, font: bold, color: INK });
      y -= 44;
    }
    for (const b of pg.blocks) {
      if (b.type === 'h') {
        ensure(34);
        page.drawText(safe(bold, b.text), { x: M, y, size: 11.5, font: bold, color: INK });
        y -= 20;
      } else if (b.type === 'p') {
        const lines = wrap(font, b.text, 10, contentW);
        for (const l of lines) {
          ensure(16);
          page.drawText(l, { x: M, y, size: 10, font, color: INK });
          y -= 14.5;
        }
        y -= 6;
      } else if (b.type === 'kv') {
        for (const [k, v] of b.rows) {
          ensure(18);
          page.drawText(safe(font, k), { x: M, y, size: 9.5, font, color: MUTED });
          page.drawText(safe(font, v), { x: M + 200, y, size: 9.5, font: bold, color: INK });
          page.drawLine({ start: { x: M, y: y - 6 }, end: { x: W - M, y: y - 6 }, thickness: 0.4, color: LINE });
          y -= 19;
        }
        y -= 6;
      } else {
        const n = b.head.length;
        const frac = b.widths ?? b.head.map(() => 1 / n);
        const total = frac.reduce((a, v) => a + v, 0);
        const widths = frac.map((f) => (f / total) * contentW);
        const drawRow = (cells: string[], isHead: boolean) => {
          const wrapped = cells.map((c, i) => wrap(isHead ? bold : font, c, 8.5, widths[i]! - 10));
          const h = Math.max(...wrapped.map((w) => w.length)) * 11.5 + 9;
          ensure(h + 4);
          if (isHead) page.drawRectangle({ x: M, y: y - h + 8, width: contentW, height: h, color: HEAD_BG });
          let x = M;
          wrapped.forEach((lines, i) => {
            lines.forEach((l, li) => {
              const tw = (isHead ? bold : font).widthOfTextAtSize(l, 8.5);
              const right = i > 0 && /^[-+−US$R\d(][\d,.\s%xMkB()$-]*$/.test(l.trim());
              page.drawText(l, { x: right ? x + widths[i]! - 6 - tw : x + 5, y: y - li * 11.5, size: 8.5, font: isHead ? bold : font, color: isHead ? MUTED : INK });
            });
            x += widths[i]!;
          });
          page.drawLine({ start: { x: M, y: y - h + 6 }, end: { x: W - M, y: y - h + 6 }, thickness: 0.4, color: LINE });
          y -= h;
        };
        drawRow(b.head, true);
        for (const r of b.rows) drawRow(r, false);
        y -= 12;
      }
    }
  });

  const total = pages.length;
  pages.forEach((p, i) => {
    p.drawText(`Page ${i + 1} of ${total}`, { x: W - M - 50, y: 40, size: 8, font, color: MUTED });
    p.drawText('Confidential · Matanho Asset Management (synthetic demo data)', { x: M, y: 40, size: 8, font, color: MUTED });
  });

  return Buffer.from(await pdf.save());
}

/** Convenience: a short evidence-style document (cover + 1 content page with the page-2 marker). */
export async function buildEvidencePdf(opts: { title: string; holder: string; reference: string; lines?: string[]; facts?: Array<[string, string]> }): Promise<Buffer> {
  return buildPdf({
    title: opts.title,
    subtitle: `Specimen evidence for ${opts.holder}`,
    reference: opts.reference,
    meta: [
      ['Holder', opts.holder],
      ['Reference', opts.reference],
      ['Document type', opts.title],
    ],
    pages: [
      {
        heading: opts.title,
        blocks: [
          { type: 'p', text: `This specimen was generated for the Matanho Nexus demonstration. It stands in for the original ${opts.title.toLowerCase()} supplied by ${opts.holder}. The original file remains the evidence of record.` },
          ...(opts.facts?.length ? ([{ type: 'kv', rows: opts.facts }] as PdfBlock[]) : []),
          ...((opts.lines ?? []).map((text) => ({ type: 'p', text })) as PdfBlock[]),
        ],
      },
    ],
  });
}
