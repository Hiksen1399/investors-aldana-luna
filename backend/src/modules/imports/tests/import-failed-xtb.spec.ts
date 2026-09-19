import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../../shared/errors/http-error.js';

vi.mock('../parsers/pdf-text.extractor.js', () => ({
  extractPdfText: vi.fn().mockRejectedValue(new HttpError(422, 'El documento requiere contraseña.', 'PDF_PASSWORD_REQUIRED')),
}));

import { ImportService } from '../import.service.js';

function xtbMime() {
  return Buffer.from([
    'From: XTB <dailystatements@mail.xtb.com>',
    'Subject: Confirmacion de ejecucion de orden - 53604716',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="xtb-boundary"',
    '',
    '--xtb-boundary',
    'Content-Type: application/pdf; name="53604716_20260903_DailyStatement.pdf"',
    'Content-Disposition: attachment; filename="53604716_20260903_DailyStatement.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from('%PDF-1.7 protected').toString('base64'),
    '--xtb-boundary--',
    '',
  ].join('\r\n'));
}

describe('ImportService - fallos XTB visibles', () => {
  it('conserva en el historial el correo cuyo PDF no pudo abrirse', async () => {
    const repository = {
      createEmailMessage: vi.fn().mockResolvedValue({ message: { id: 'email-1' }, duplicate: false }),
      findAccount: vi.fn().mockResolvedValue({ id: 'xtb-account-1', broker: { slug: 'xtb' } }),
      createBatch: vi.fn().mockResolvedValue({ id: 'failed-batch-1' }),
      updateBatch: vi.fn().mockResolvedValue({}),
      markEmailProcessed: vi.fn().mockResolvedValue({}),
      deleteEmailMessage: vi.fn(),
    };
    const credentials = { candidates: vi.fn().mockResolvedValue([]) };
    const service = new ImportService(repository as never, {} as never, credentials as never);

    await expect(service.processOutlookMime('user-1', 'connection-1', {
      externalId: '<xtb-1>', sender: 'dailystatements@mail.xtb.com', subject: 'Confirmacion de ejecucion de orden - 53604716',
      receivedAt: new Date('2026-09-04T06:57:54Z'), mime: xtbMime(),
    })).rejects.toMatchObject({ code: 'PDF_PASSWORD_REQUIRED' });

    expect(repository.createBatch).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1', accountId: 'xtb-account-1', emailMessageId: 'email-1', source: 'OUTLOOK',
      fileName: 'Confirmacion de ejecucion de orden - 53604716',
    }));
    expect(repository.updateBatch).toHaveBeenCalledWith('failed-batch-1', expect.objectContaining({ status: 'FAILED', totalRows: 0, errorMessage: expect.stringContaining('53604716') }));
    expect(repository.markEmailProcessed).toHaveBeenCalledWith('email-1');
    expect(repository.deleteEmailMessage).not.toHaveBeenCalled();
  });

  it('elimina el intento fallido anterior para poder reanalizar el mismo correo', async () => {
    const repository = {
      createEmailMessage: vi.fn().mockResolvedValue({ message: { id: 'email-1' }, duplicate: true }),
      listImportsByEmail: vi.fn().mockResolvedValue([{ id: 'old-failed-batch', status: 'FAILED', rows: [] }]),
      deleteImportBatches: vi.fn().mockResolvedValue({ count: 1 }),
      findAccount: vi.fn().mockResolvedValue({ id: 'xtb-account-1', broker: { slug: 'xtb' } }),
      createBatch: vi.fn().mockResolvedValue({ id: 'new-failed-batch' }),
      updateBatch: vi.fn().mockResolvedValue({}),
      markEmailProcessed: vi.fn().mockResolvedValue({}),
      deleteEmailMessage: vi.fn(),
    };
    const service = new ImportService(repository as never, {} as never, { candidates: vi.fn().mockResolvedValue([]) } as never);

    await expect(service.processOutlookMime('user-1', 'connection-1', {
      externalId: '<xtb-1>', sender: 'dailystatements@mail.xtb.com', subject: 'Confirmacion de ejecucion de orden - 53604716',
      receivedAt: new Date('2026-09-04T06:57:54Z'), mime: xtbMime(),
    })).rejects.toMatchObject({ code: 'PDF_PASSWORD_REQUIRED' });

    expect(repository.deleteImportBatches).toHaveBeenCalledWith(['old-failed-batch']);
    expect(repository.createBatch).toHaveBeenCalledWith(expect.objectContaining({ emailMessageId: 'email-1' }));
  });
});
