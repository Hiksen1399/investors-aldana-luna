import { MarketDataError } from '../../market-data/market-data.errors.js';

type PdfTextItem = { str: string; transform?: number[] };

export function arrangePdfText(items: unknown[]) {
  const positioned = items
    .filter((item): item is PdfTextItem => Boolean(item && typeof item === 'object' && 'str' in item && typeof (item as PdfTextItem).str === 'string'))
    .map((item, index) => ({ text: item.str.trim(), x: item.transform?.[4] ?? index, y: item.transform?.[5] ?? 0, index }))
    .filter((item) => item.text);
  const lines: Array<{ y: number; items: typeof positioned }> = [];
  for (const item of positioned.sort((left, right) => right.y - left.y || left.x - right.x || left.index - right.index)) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2.5);
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  return lines
    .sort((left, right) => right.y - left.y)
    .map((line) => line.items.sort((left, right) => left.x - right.x || left.index - right.index).map((item) => item.text).join('\t'))
    .join('\n');
}

export async function extractPdfText(buffer: Buffer, password?: string) {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), password });
    const document = await loadingTask.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(arrangePdfText(content.items));
      page.cleanup();
    }
    await document.cleanup();
    await loadingTask.destroy();
    return pages.join('\n');
  } catch (error) {
    const value = error as { name?: string; code?: number };
    if (value.name === 'PasswordException' || value.code === 1) throw new MarketDataError(422, password ? 'La contraseña del documento XTB no es válida.' : 'El documento XTB requiere una contraseña temporal.', password ? 'INVALID_PDF_PASSWORD' : 'PDF_PASSWORD_REQUIRED');
    throw new MarketDataError(422, 'No pudimos leer el PDF. Verifica que contenga texto seleccionable.', 'PDF_READ_ERROR');
  }
}
