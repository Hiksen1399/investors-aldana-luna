import { randomBytes } from 'node:crypto';
import axios, { type AxiosInstance } from 'axios';
import { ConfidentialClientApplication, CryptoProvider, type Configuration } from '@azure/msal-node';
import { z } from 'zod';
import { env } from '../../shared/config/env.js';
import { HttpError } from '../../shared/errors/http-error.js';
import { secretVault, type SecretVault } from '../../shared/security/secret-vault.js';
import { importRepository, type ImportRepository } from './import.repository.js';
import { importService, type ImportService } from './import.service.js';
import { isXtbExecutionEmail } from './xtb-email.policy.js';

const scopes = ['User.Read', 'Mail.Read'];
const statePurpose = 'outlook-oauth-state';
const graphMessageSchema = z.object({
  id: z.string(),
  subject: z.string().nullable().optional(),
  internetMessageId: z.string().nullable().optional(),
  receivedDateTime: z.string(),
  from: z.object({ emailAddress: z.object({ address: z.string(), name: z.string().optional() }) }).nullable().optional(),
});
const graphMessagesSchema = z.object({
  value: z.array(graphMessageSchema),
  '@odata.nextLink': z.string().url().optional(),
});
const graphUserSchema = z.object({ mail: z.string().nullable().optional(), userPrincipalName: z.string(), displayName: z.string().optional() });
const oauthStateSchema = z.object({ userId: z.uuid(), verifier: z.string().min(43), nonce: z.string().min(16), expiresAt: z.number().int() });

type GraphMessage = z.infer<typeof graphMessageSchema>;
export type OutlookGraphSettings = { clientId: string; clientSecret: string; redirectUri: string };
export type OutlookSyncOptions = { lookbackMonths?: number };
type MsalClientFactory = () => ConfidentialClientApplication;

const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const explicitNonTradePattern = /\b(dividend|dividendo|statement|estado de cuenta|extracto|important information|informacion importante|cambios legales|deposit|depositar|deposito|withdrawal|retiro|proxy|vote|votacion|tax document|documento fiscal|promocion|newsletter|webinar|market update|order placed|order submitted|orden colocada|orden enviada|orden recibida)\b/i;
const brokerPattern = /(?:^|[@.\s_-])(hapi|xtb)(?:[.@\s_-]|$)/i;
const executedOrderPattern = /\b(order executed|order has been executed|order completed|orden(?: de (?:compra|venta))? (?:(?:ha sido|fue) )?ejecutad[ao]|orden completad[ao])\b/i;

export const isExplicitlyNonTradeMessage = (input: { sender?: string | null; subject?: string | null }) =>
  explicitNonTradePattern.test(normalized(`${input.sender ?? ''} ${input.subject ?? ''}`));

export const isBrokerTradeMessage = (input: { sender?: string | null; senderName?: string | null; subject?: string | null }) => {
  const value = normalized(`${input.sender ?? ''} ${input.senderName ?? ''} ${input.subject ?? ''}`);
  if (!brokerPattern.test(value) || explicitNonTradePattern.test(value)) return false;
  return /hapi/i.test(value) ? executedOrderPattern.test(value) : isXtbExecutionEmail(input.sender, input.subject);
};

export class OutlookGraphService {
  private readonly graph: AxiosInstance;
  private readonly msalClientFactory: MsalClientFactory;
  private syncingAll = false;

  constructor(
    private readonly repository: ImportRepository = importRepository,
    private readonly importer: ImportService = importService,
    private readonly vault: SecretVault = secretVault,
    graphClient?: AxiosInstance,
    private readonly settings: OutlookGraphSettings = { clientId: env.MICROSOFT_CLIENT_ID, clientSecret: env.MICROSOFT_CLIENT_SECRET, redirectUri: env.MICROSOFT_REDIRECT_URI },
    msalClientFactory?: MsalClientFactory,
  ) {
    this.graph = graphClient ?? axios.create({ baseURL: 'https://graph.microsoft.com/v1.0', timeout: 15_000 });
    this.msalClientFactory = msalClientFactory ?? (() => this.createClient());
  }

  async status(userId: string) {
    const connection = await this.repository.getMicrosoftConnection(userId);
    return {
      configured: this.isConfigured(),
      connected: Boolean(connection?.encryptedSecretRef),
      email: connection?.email ?? null,
      lastSyncedAt: connection?.lastSyncedAt ?? null,
    };
  }

  async authorizationUrl(userId: string) {
    this.requireConfigured();
    const pkce = await new CryptoProvider().generatePkceCodes();
    const state = this.vault.encrypt(JSON.stringify({ userId, verifier: pkce.verifier, nonce: randomBytes(18).toString('base64url'), expiresAt: Date.now() + 10 * 60_000 }), statePurpose);
    const url = await this.client().getAuthCodeUrl({
      scopes,
      redirectUri: this.settings.redirectUri,
      responseMode: 'query',
      prompt: 'select_account',
      state,
      codeChallenge: pkce.challenge,
      codeChallengeMethod: 'S256',
    });
    return { url };
  }

  async callback(code: string, encryptedState: string) {
    this.requireConfigured();
    const state = oauthStateSchema.parse(JSON.parse(this.vault.decrypt(encryptedState, statePurpose)));
    if (state.expiresAt < Date.now()) throw new HttpError(401, 'La autorización de Outlook expiró. Intenta conectarla nuevamente.', 'OAUTH_STATE_EXPIRED');
    const client = this.client();
    const result = await client.acquireTokenByCode({ code, scopes, redirectUri: this.settings.redirectUri, codeVerifier: state.verifier });
    if (!result?.accessToken || !result.account) throw new HttpError(502, 'Microsoft no devolvió una sesión válida.', 'MICROSOFT_TOKEN_ERROR');
    const profileResponse = await this.graph.get('/me', { headers: this.authorization(result.accessToken), params: { '$select': 'mail,userPrincipalName,displayName' } });
    const profile = graphUserSchema.parse(profileResponse.data);
    const encryptedCache = this.vault.encrypt(client.getTokenCache().serialize(), this.cachePurpose(state.userId));
    return this.repository.saveMicrosoftConnection(state.userId, profile.mail ?? profile.userPrincipalName, encryptedCache);
  }

  async sync(userId: string, options: OutlookSyncOptions = {}) {
    this.requireConfigured();
    const connection = await this.repository.getMicrosoftConnection(userId);
    if (!connection?.encryptedSecretRef) throw new HttpError(409, 'Primero conecta tu cuenta de Outlook.', 'OUTLOOK_NOT_CONNECTED');
    const { accessToken, client } = await this.accessToken(userId, connection.encryptedSecretRef);
    const startedAt = new Date();
    const from = options.lookbackMonths ? this.monthsBefore(startedAt, options.lookbackMonths) : connection.lastSyncedAt ?? this.monthsBefore(startedAt, 1);
    const listing = await this.listMessages(accessToken, from);
    const messages = listing.messages;
    const xtbAccountNumbers = new Set(await this.repository.listBrokerAccountNumbers(userId, 'xtb'));
    const cleaned = await this.cleanupFalsePositiveImports(userId);
    let matched = 0;
    let batches = 0;
    let duplicates = 0;
    let ignored = 0;
    let failed = 0;
    let passwordFailures = 0;
    const passwordFailureAccounts = new Set<string>();

    for (const message of messages) {
      if (!this.isBrokerMessage(message, xtbAccountNumbers)) continue;
      matched++;
      try {
        const mimeResponse = await this.graph.get(`/me/messages/${encodeURIComponent(message.id)}/$value`, { headers: this.authorization(accessToken), responseType: 'arraybuffer', maxContentLength: 12 * 1024 * 1024 });
        const result = await this.importer.processOutlookMime(userId, connection.id, {
          externalId: message.internetMessageId ?? message.id,
          sender: message.from?.emailAddress.address ?? 'outlook',
          subject: message.subject ?? undefined,
          receivedAt: new Date(message.receivedDateTime),
          mime: Buffer.from(mimeResponse.data),
        });
        if (result.duplicate) duplicates++;
        else if (result.batch) batches++;
        else ignored++;
      } catch (error) {
        failed++;
        if (error instanceof HttpError && ['PDF_PASSWORD_REQUIRED', 'INVALID_PDF_PASSWORD'].includes(error.code)) {
          passwordFailures++;
          const accountNumber = (error.details as { accountNumber?: unknown } | undefined)?.accountNumber;
          if (typeof accountNumber === 'string') passwordFailureAccounts.add(accountNumber);
        }
      }
    }

    const encryptedCache = this.vault.encrypt(client.getTokenCache().serialize(), this.cachePurpose(userId));
    await this.repository.updateMicrosoftConnection(connection.id, { encryptedSecretRef: encryptedCache, lastSyncedAt: startedAt });
    return { scanned: messages.length, matched, batches, duplicates, ignored, failed, passwordFailures, passwordFailureAccounts: [...passwordFailureAccounts], cleaned, truncated: listing.truncated, from, lastSyncedAt: startedAt };
  }

  async disconnect(userId: string) {
    await this.repository.disconnectMicrosoft(userId);
    return { disconnected: true };
  }

  async syncAll() {
    if (!this.isConfigured() || this.syncingAll) return;
    this.syncingAll = true;
    try {
      const connections = await this.repository.listMicrosoftConnections();
      for (const connection of connections) await this.sync(connection.userId).catch(() => undefined);
    } finally {
      this.syncingAll = false;
    }
  }

  isConfigured() {
    return Boolean(this.settings.clientId && this.settings.clientSecret && this.vault.isConfigured());
  }

  private async accessToken(userId: string, encryptedCache: string) {
    const client = this.client();
    client.getTokenCache().deserialize(this.vault.decrypt(encryptedCache, this.cachePurpose(userId)));
    const [account] = await client.getTokenCache().getAllAccounts();
    if (!account) throw new HttpError(401, 'La sesión de Outlook ya no es válida. Conecta la cuenta nuevamente.', 'OUTLOOK_RECONNECT_REQUIRED');
    try {
      const result = await client.acquireTokenSilent({ account, scopes });
      if (!result?.accessToken) throw new Error('Missing access token');
      return { accessToken: result.accessToken, client };
    } catch {
      throw new HttpError(401, 'Microsoft requiere que conectes Outlook nuevamente.', 'OUTLOOK_RECONNECT_REQUIRED');
    }
  }

  private async listMessages(accessToken: string, from: Date) {
    const messages: GraphMessage[] = [];
    let next: string | undefined = '/me/messages';
    let page = 0;
    const maxPages = 50;
    while (next && page < maxPages) {
      const response = await this.graph.get(next, {
        headers: this.authorization(accessToken),
        params: next.startsWith('http') ? undefined : {
          '$select': 'id,subject,from,receivedDateTime,internetMessageId',
          '$filter': `receivedDateTime ge ${from.toISOString()}`,
          '$orderby': 'receivedDateTime desc',
          '$top': '100',
        },
      });
      const parsed = graphMessagesSchema.parse(response.data);
      messages.push(...parsed.value);
      next = parsed['@odata.nextLink'];
      page++;
    }
    return { messages, truncated: Boolean(next) };
  }

  private isBrokerMessage(message: GraphMessage, xtbAccountNumbers: ReadonlySet<string>) {
    const input = { sender: message.from?.emailAddress.address, senderName: message.from?.emailAddress.name, subject: message.subject };
    const value = normalized(`${input.sender ?? ''} ${input.senderName ?? ''} ${input.subject ?? ''}`);
    return /hapi/i.test(value) ? isBrokerTradeMessage(input) : isXtbExecutionEmail(input.sender, input.subject, xtbAccountNumbers);
  }

  private async cleanupFalsePositiveImports(userId: string) {
    const candidates = await this.repository.listOutlookImportsForCleanup(userId);
    const ids = candidates
      .filter((batch) => batch.emailMessage && !batch.rows.some((row) => row.transaction) && isExplicitlyNonTradeMessage(batch.emailMessage))
      .map((batch) => batch.id);
    if (ids.length) await this.repository.deleteImportBatches(ids);
    return ids.length;
  }

  private monthsBefore(value: Date, months: number) {
    const result = new Date(value);
    result.setUTCMonth(result.getUTCMonth() - months);
    return result;
  }

  private authorization(accessToken: string) { return { Authorization: `Bearer ${accessToken}` }; }
  private cachePurpose(userId: string) { return `outlook-token-cache:${userId}`; }
  private requireConfigured() {
    if (!this.isConfigured()) throw new HttpError(503, 'Configura MICROSOFT_CLIENT_ID y MICROSOFT_CLIENT_SECRET para conectar Outlook.', 'MICROSOFT_NOT_CONFIGURED');
  }

  private client() { return this.msalClientFactory(); }

  private createClient() {
    const config: Configuration = {
      auth: { clientId: this.settings.clientId, clientSecret: this.settings.clientSecret, authority: 'https://login.microsoftonline.com/common' },
      system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => undefined } },
    };
    return new ConfidentialClientApplication(config);
  }
}

export const outlookGraphService = new OutlookGraphService();
