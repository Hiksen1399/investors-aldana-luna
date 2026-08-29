import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { SecretVault } from '../../../shared/security/secret-vault.js';
import { isBrokerTradeMessage, isExplicitlyNonTradeMessage, OutlookGraphService } from '../outlook-graph.service.js';

describe('SecretVault', () => {
  it('cifra los tokens con autenticación y propósito', () => {
    const vault = new SecretVault();
    const encrypted = vault.encrypt('token-cache-secreto', 'outlook:user-1');
    expect(encrypted).not.toContain('token-cache-secreto');
    expect(vault.decrypt(encrypted, 'outlook:user-1')).toBe('token-cache-secreto');
    expect(() => vault.decrypt(encrypted, 'outlook:user-2')).toThrow();
  });
});

describe('OutlookGraphService', () => {
  it('intercambia el código OAuth y guarda solamente el caché cifrado', async () => {
    const repository = { saveMicrosoftConnection: vi.fn().mockResolvedValue({ id: 'connection-1' }) };
    const vault = {
      isConfigured: () => true,
      decrypt: () => JSON.stringify({ userId: '11111111-1111-4111-8111-111111111111', verifier: 'v'.repeat(48), nonce: 'n'.repeat(18), expiresAt: Date.now() + 60_000 }),
      encrypt: vi.fn().mockReturnValue('ciphertext-only'),
    };
    const graph = { get: vi.fn().mockResolvedValue({ data: { mail: 'user@outlook.com', userPrincipalName: 'user@outlook.com', displayName: 'User' } }) } as unknown as AxiosInstance;
    const tokenCache = { serialize: vi.fn().mockReturnValue('{"AccessToken":{},"RefreshToken":{"secret":"hidden"}}') };
    const msal = { acquireTokenByCode: vi.fn().mockResolvedValue({ accessToken: 'access-token', account: { username: 'user@outlook.com' } }), getTokenCache: () => tokenCache };
    const service = new OutlookGraphService(repository as never, {} as never, vault as never, graph, { clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'http://localhost/callback' }, () => msal as never);

    await service.callback('authorization-code', 'encrypted-state');
    expect(msal.acquireTokenByCode).toHaveBeenCalledWith(expect.objectContaining({ code: 'authorization-code', codeVerifier: 'v'.repeat(48) }));
    expect(vault.encrypt).toHaveBeenCalledWith(expect.stringContaining('RefreshToken'), 'outlook-token-cache:11111111-1111-4111-8111-111111111111');
    expect(repository.saveMicrosoftConnection).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'user@outlook.com', 'ciphertext-only');
  });

  it('lee MIME de Hapi con Graph, importa el correo y actualiza la sincronización', async () => {
    const repository = {
      getMicrosoftConnection: vi.fn().mockResolvedValue({ id: 'connection-1', userId: 'user-1', encryptedSecretRef: 'encrypted-cache', email: 'user@outlook.com', lastSyncedAt: null }),
      updateMicrosoftConnection: vi.fn().mockResolvedValue({}),
      listOutlookImportsForCleanup: vi.fn().mockResolvedValue([{ id: 'false-batch-1', emailMessage: { sender: 'no-reply@hapi.trade', subject: 'Dividend from QQQ received!' }, rows: [{ transaction: null }] }]),
      deleteImportBatches: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const importer = { processOutlookMime: vi.fn().mockResolvedValue({ duplicate: false, batch: { id: 'batch-1' }, ignored: false }) };
    const vault = { isConfigured: () => true, decrypt: () => '{"cache":true}', encrypt: () => 'encrypted-cache-updated' };
    const graph = {
      get: vi.fn().mockImplementation((url: string) => url === '/me/messages'
        ? Promise.resolve({ data: { value: [{ id: 'message-1', subject: 'Hapi - orden ejecutada', internetMessageId: '<hapi-1>', receivedDateTime: '2026-07-13T15:00:00Z', from: { emailAddress: { address: 'no-reply@hapi.trade', name: 'Hapi' } } }] } })
        : Promise.resolve({ data: Buffer.from('From: no-reply@hapi.trade\nSubject: Hapi\n\nTicker: NVDA') })),
    } as unknown as AxiosInstance;
    const tokenCache = { deserialize: vi.fn(), serialize: vi.fn().mockReturnValue('{"cache":"updated"}'), getAllAccounts: vi.fn().mockResolvedValue([{ homeAccountId: 'account-1' }]) };
    const msal = { getTokenCache: () => tokenCache, acquireTokenSilent: vi.fn().mockResolvedValue({ accessToken: 'access-token' }) };
    const service = new OutlookGraphService(repository as never, importer as never, vault as never, graph, { clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'http://localhost/callback' }, () => msal as never);

    await expect(service.sync('user-1', { lookbackMonths: 12 })).resolves.toMatchObject({ scanned: 1, matched: 1, batches: 1, duplicates: 0, failed: 0, cleaned: 1 });
    expect(importer.processOutlookMime).toHaveBeenCalledWith('user-1', 'connection-1', expect.objectContaining({ externalId: '<hapi-1>', sender: 'no-reply@hapi.trade' }));
    expect(repository.deleteImportBatches).toHaveBeenCalledWith(['false-batch-1']);
    expect(graph.get).toHaveBeenCalledWith('/me/messages', expect.objectContaining({ params: expect.objectContaining({ '$filter': expect.stringContaining('receivedDateTime ge ') }) }));
    expect(repository.updateMicrosoftConnection).toHaveBeenCalledWith('connection-1', expect.objectContaining({ encryptedSecretRef: 'encrypted-cache-updated', lastSyncedAt: expect.any(Date) }));
  });

  it('acepta confirmaciones y excluye dividendos, extractos y publicidad', () => {
    expect(isBrokerTradeMessage({ sender: 'no-reply@hapi.trade', subject: 'Tu orden de compra fue ejecutada' })).toBe(true);
    expect(isBrokerTradeMessage({ sender: 'reports@mail.xtb.com', subject: 'Confirmación de operaciones' })).toBe(true);
    expect(isBrokerTradeMessage({ sender: 'no-reply@hapi.trade', subject: 'Dividend from QQQ received!' })).toBe(false);
    expect(isBrokerTradeMessage({ senderName: 'Hapi Securities', subject: 'Your statement from Hapi is ready!' })).toBe(false);
    expect(isExplicitlyNonTradeMessage({ sender: 'news@imhapi.app', subject: 'Sé de los primeros en depositar' })).toBe(true);
  });

  it('informa cuando faltan las credenciales de Microsoft', async () => {
    const service = new OutlookGraphService({ getMicrosoftConnection: vi.fn().mockResolvedValue(null) } as never, {} as never, { isConfigured: () => true } as never, {} as never, { clientId: '', clientSecret: '', redirectUri: 'http://localhost/callback' });
    await expect(service.status('user-1')).resolves.toMatchObject({ configured: false, connected: false });
  });
});
