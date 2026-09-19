import { HttpError } from '../../shared/errors/http-error.js';
import { secretVault, type SecretVault } from '../../shared/security/secret-vault.js';
import { importRepository, type ImportRepository } from './import.repository.js';

export const XTB_PDF_PASSWORD_KIND = 'XTB_PDF_PASSWORD';

export type XtbPdfPasswordCandidate = {
  credentialId: string;
  accountId: string;
  externalAccountNumber?: string;
  password: string;
};

export class XtbPdfCredentialService {
  constructor(
    private readonly repository: ImportRepository = importRepository,
    private readonly vault: SecretVault = secretVault,
  ) {}

  async status(userId: string) {
    const accounts = await this.repository.listBrokerAccountsWithCredential(userId, 'xtb', XTB_PDF_PASSWORD_KIND);
    return accounts.map((account) => ({
      accountId: account.id,
      accountName: account.name,
      configured: account.credentials.length > 0,
      updatedAt: account.credentials[0]?.updatedAt ?? null,
      lastValidatedAt: account.credentials[0]?.lastValidatedAt ?? null,
    }));
  }

  async save(userId: string, accountId: string, password: string) {
    const account = await this.repository.findAccount(userId, { accountId });
    if (!account || account.broker.slug.toLowerCase() !== 'xtb') {
      throw new HttpError(404, 'Selecciona una cuenta válida de XTB.', 'XTB_ACCOUNT_NOT_FOUND');
    }
    const encryptedSecretRef = this.vault.encrypt(password, this.purpose(account.id));
    const credential = await this.repository.upsertBrokerCredential(account.id, XTB_PDF_PASSWORD_KIND, encryptedSecretRef);
    return { accountId: account.id, accountName: account.name, configured: true, updatedAt: credential.updatedAt, lastValidatedAt: credential.lastValidatedAt };
  }

  async remove(userId: string, accountId: string) {
    const account = await this.repository.findAccount(userId, { accountId });
    if (!account || account.broker.slug.toLowerCase() !== 'xtb') {
      throw new HttpError(404, 'Selecciona una cuenta válida de XTB.', 'XTB_ACCOUNT_NOT_FOUND');
    }
    await this.repository.deleteBrokerCredential(account.id, XTB_PDF_PASSWORD_KIND);
    return { accountId: account.id, configured: false };
  }

  async candidates(userId: string): Promise<XtbPdfPasswordCandidate[]> {
    const credentials = await this.repository.listBrokerCredentials(userId, 'xtb', XTB_PDF_PASSWORD_KIND);
    const candidates: XtbPdfPasswordCandidate[] = [];
    for (const credential of credentials) {
      try {
        candidates.push({
          credentialId: credential.id,
          accountId: credential.accountId,
          externalAccountNumber: credential.account.externalAccountNumber ?? undefined,
          password: this.vault.decrypt(credential.encryptedSecretRef, this.purpose(credential.accountId)),
        });
      } catch {
        // Una clave rotada o un registro alterado nunca debe bloquear las otras cuentas.
      }
    }
    return candidates;
  }

  validated(credentialId: string) {
    return this.repository.markBrokerCredentialValidated(credentialId);
  }

  private purpose(accountId: string) { return `xtb-pdf-password:${accountId}`; }
}

export const xtbPdfCredentialService = new XtbPdfCredentialService();
