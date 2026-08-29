import { MarketDataError } from '../../market-data/market-data.errors.js';

export async function extractPdfText(buffer: Buffer, password?: string) {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), password });
    const document = await loadingTask.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '));
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
