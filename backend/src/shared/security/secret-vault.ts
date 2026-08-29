import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { HttpError } from '../errors/http-error.js';

export class SecretVault {
  isConfigured() { return env.TOKEN_ENCRYPTION_KEY.length >= 32; }

  encrypt(value: string, purpose: string) {
    this.requireConfigured();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from(purpose));
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
  }

  decrypt(value: string, purpose: string) {
    this.requireConfigured();
    const [ivValue, tagValue, encryptedValue] = value.split('.');
    if (!ivValue || !tagValue || !encryptedValue) throw new HttpError(401, 'El estado de autorización no es válido.', 'INVALID_OAUTH_STATE');
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(ivValue, 'base64url'));
      decipher.setAAD(Buffer.from(purpose));
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      throw new HttpError(401, 'El estado de autorización expiró o fue alterado.', 'INVALID_OAUTH_STATE');
    }
  }

  private requireConfigured() {
    if (!this.isConfigured()) throw new HttpError(503, 'Configura TOKEN_ENCRYPTION_KEY antes de conectar Outlook.', 'TOKEN_ENCRYPTION_NOT_CONFIGURED');
  }

  private key() { return createHash('sha256').update(env.TOKEN_ENCRYPTION_KEY).digest(); }
}

export const secretVault = new SecretVault();
