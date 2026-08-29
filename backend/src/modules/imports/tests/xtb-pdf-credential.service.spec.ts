import { describe, expect, it, vi } from 'vitest';
import { XtbPdfCredentialService } from '../xtb-pdf-credential.service.js';

describe('XtbPdfCredentialService', () => {
  it('guarda solamente la contraseña cifrada y ligada a la cuenta', async () => {
    const repository = {
      findAccount: vi.fn().mockResolvedValue({ id: 'account-1', name: 'XTB principal', broker: { slug: 'xtb' } }),
      upsertBrokerCredential: vi.fn().mockResolvedValue({ updatedAt: new Date(), lastValidatedAt: null }),
    };
    const vault = { encrypt: vi.fn().mockReturnValue('ciphertext-only') };
    const service = new XtbPdfCredentialService(repository as never, vault as never);

    await service.save('user-1', 'account-1', 'pdf-password');

    expect(vault.encrypt).toHaveBeenCalledWith('pdf-password', 'xtb-pdf-password:account-1');
    expect(repository.upsertBrokerCredential).toHaveBeenCalledWith('account-1', 'XTB_PDF_PASSWORD', 'ciphertext-only');
    expect(JSON.stringify(repository.upsertBrokerCredential.mock.calls)).not.toContain('pdf-password');
  });

  it('descifra las candidatas solo al procesar documentos', async () => {
    const repository = { listBrokerCredentials: vi.fn().mockResolvedValue([{ id: 'credential-1', accountId: 'account-1', encryptedSecretRef: 'ciphertext-only' }]) };
    const vault = { decrypt: vi.fn().mockReturnValue('pdf-password') };
    const service = new XtbPdfCredentialService(repository as never, vault as never);

    await expect(service.candidates('user-1')).resolves.toEqual([{ credentialId: 'credential-1', accountId: 'account-1', password: 'pdf-password' }]);
    expect(vault.decrypt).toHaveBeenCalledWith('ciphertext-only', 'xtb-pdf-password:account-1');
  });
});
