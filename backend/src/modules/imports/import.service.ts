import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { simpleParser } from 'mailparser';
import { Prisma, type ImportRowStatus } from '@prisma/client';
import { env } from '../../shared/config/env.js';
import { HttpError } from '../../shared/errors/http-error.js';
import { prisma } from '../../shared/database/prisma.js';
import { transactionService } from '../transactions/transaction.service.js';
import { importRepository, type ImportRepository } from './import.repository.js';
import { normalizedImportOperationSchema, reviewImportRowSchema } from './import.schemas.js';
import type { ImportBroker, InboundEmailPayload, NormalizedImportOperation, ParsedImportOperation } from './import.types.js';
import { parseCsvImport } from './parsers/csv-import.parser.js';
import { parseHapiEmail } from './parsers/hapi-email.parser.js';
import { duplicateKey } from './parsers/parser.utils.js';
import { extractPdfText } from './parsers/pdf-text.extractor.js';
import { parseXtbDocument } from './parsers/xtb-document.parser.js';
import { importAssetResolverService, type ImportAssetResolverService, type ResolvedImportAsset } from './import-asset-resolver.service.js';
import { xtbPdfCredentialService, type XtbPdfCredentialService, type XtbPdfPasswordCandidate } from './xtb-pdf-credential.service.js';

type UploadFile = { originalname: string; mimetype: string; buffer: Buffer; size: number };
type PasswordCandidate = Pick<XtbPdfPasswordCandidate, 'password'> & { credentialId?: string };
type ParsedFileResult = {
  operations: ParsedImportOperation[];
  source: 'HAPI_EMAIL' | 'XTB_DOCUMENT' | 'FILE';
  validatedCredentialIds: string[];
};

const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const asObject = (value: Prisma.JsonValue | null) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export class ImportService {
  constructor(
    private readonly repository: ImportRepository = importRepository,
    private readonly assetResolver: ImportAssetResolverService = importAssetResolverService,
    private readonly xtbCredentials: XtbPdfCredentialService = xtbPdfCredentialService,
  ) {}

  list(userId: string) { return this.repository.list(userId); }

  async get(userId: string, id: string) {
    const batch = await this.repository.getBatch(userId, id);
    if (!batch) throw new HttpError(404, 'No encontramos esa importación.', 'IMPORT_NOT_FOUND');
    return batch;
  }

  async upload(userId: string, file: UploadFile | undefined, input: { accountId?: string; broker?: ImportBroker; documentPassword?: string }) {
    if (!file) throw new HttpError(422, 'Selecciona un correo, PDF o archivo CSV.', 'FILE_REQUIRED');
    if (file.size > 12 * 1024 * 1024) throw new HttpError(413, 'El archivo supera el límite de 12 MB.', 'FILE_TOO_LARGE');
    if (input.accountId && !await this.repository.findAccount(userId, { accountId: input.accountId })) throw new HttpError(404, 'No encontramos la cuenta seleccionada.', 'ACCOUNT_NOT_FOUND');
    const fileHash = hash(file.buffer);
    const duplicate = await this.repository.findByFileHash(userId, fileHash);
    if (duplicate) return { ...duplicate, duplicateBatch: true };
    const parsed = await this.parseFile(file, input.broker, input.documentPassword ? [{ password: input.documentPassword }] : []);
    if (!parsed.operations.length) throw new HttpError(422, 'No encontramos operaciones reconocibles en el archivo.', 'NO_OPERATIONS_FOUND');
    return this.createBatchFromOperations(userId, parsed.operations, { accountId: input.accountId, source: parsed.source, fileName: file.originalname, fileHash });
  }

  async reviewRow(userId: string, rowId: string, patch: unknown) {
    const row = await this.repository.getRow(userId, rowId);
    if (!row) throw new HttpError(404, 'No encontramos esa fila.', 'IMPORT_ROW_NOT_FOUND');
    if (row.transaction) throw new HttpError(409, 'La fila ya creó una transacción.', 'ROW_ALREADY_IMPORTED');
    const updates = reviewImportRowSchema.parse(patch);
    const merged = { ...asObject(row.normalizedData), ...updates, confidence: 100, warnings: [] } as unknown as NormalizedImportOperation;
    let resolvedAsset: ResolvedImportAsset | null;
    try {
      resolvedAsset = await this.assetResolver.resolve(merged);
    } catch {
      throw new HttpError(502, 'No pudimos consultar Twelve Data en este momento. Intenta nuevamente.', 'MARKET_PROVIDER_UNAVAILABLE');
    }
    if (!resolvedAsset) throw new HttpError(422, 'Twelve Data no encontró una empresa que coincida con el símbolo y el nombre indicados.', 'MARKET_SYMBOL_NOT_MATCHED');
    const normalized = normalizedImportOperationSchema.parse({ ...merged, ...resolvedAsset });
    const account = await this.repository.findAccount(userId, { accountId: normalized.accountId, externalAccountNumber: normalized.externalAccountNumber, broker: normalized.broker });
    if (!account) throw new HttpError(422, 'Selecciona una cuenta válida antes de aprobar.', 'IMPORT_ACCOUNT_REQUIRED');
    normalized.accountId = account.id;
    const key = duplicateKey(normalized, account.id);
    return this.repository.updateRow(rowId, { normalizedData: normalized as unknown as Prisma.InputJsonValue, confidence: 100, status: 'APPROVED', duplicateKey: key, validationErrors: [] as unknown as Prisma.InputJsonValue, reviewedAt: new Date() });
  }

  async approveRow(userId: string, rowId: string) {
    const row = await this.repository.getRow(userId, rowId);
    if (!row) throw new HttpError(404, 'No encontramos esa fila.', 'IMPORT_ROW_NOT_FOUND');
    return this.reviewRow(userId, rowId, {});
  }

  async rejectRow(userId: string, rowId: string) {
    const row = await this.repository.getRow(userId, rowId);
    if (!row) throw new HttpError(404, 'No encontramos esa fila.', 'IMPORT_ROW_NOT_FOUND');
    if (row.transaction) throw new HttpError(409, 'La fila ya creó una transacción.', 'ROW_ALREADY_IMPORTED');
    return this.repository.updateRow(rowId, { status: 'REJECTED', reviewedAt: new Date() });
  }

  async confirm(userId: string, batchId: string) {
    const batch = await this.get(userId, batchId);
    let imported = 0;
    let duplicates = 0;
    for (const row of batch.rows.filter((item) => item.status === 'APPROVED' && !item.transaction)) {
      try {
        const normalized = normalizedImportOperationSchema.parse(row.normalizedData);
        const account = await this.repository.findAccount(userId, { accountId: normalized.accountId, externalAccountNumber: normalized.externalAccountNumber, broker: normalized.broker });
        if (!account) throw new HttpError(422, 'No se pudo identificar la cuenta de destino.', 'IMPORT_ACCOUNT_REQUIRED');
        const externalId = normalized.externalOrderId ?? `import:${row.duplicateKey}`;
        if (await this.repository.findDuplicate(account.id, externalId)) {
          await this.repository.updateRow(row.id, { status: 'DUPLICATE', reviewedAt: new Date() });
          duplicates++;
          continue;
        }
        const transaction = await transactionService.create(userId, {
          accountId: account.id,
          asset: { ticker: normalized.symbol, name: normalized.assetName, type: normalized.assetType, exchange: normalized.exchange, providerSymbol: normalized.providerSymbol },
          type: 'TRADE', side: normalized.side, status: 'CONFIRMED', tradeAt: normalized.executedAt, quantity: normalized.quantity, unitPrice: normalized.unitPrice,
          grossAmount: normalized.grossAmount, fees: normalized.fees, taxes: normalized.taxes, exchangeRate: normalized.exchangeRate, currencyCode: normalized.currencyCode,
          externalId, notes: `Importado desde ${normalized.broker}`, source: normalized.broker === 'HAPI' ? 'HAPI_EMAIL' : 'XTB_DOCUMENT', importRowId: row.id,
        });
        if (transaction.assetId) {
          const sourceProvider = normalized.broker.toLowerCase();
          await prisma.assetProviderSymbol.upsert({
            where: { provider_providerSymbol: { provider: sourceProvider, providerSymbol: normalized.sourceSymbol } },
            update: { assetId: transaction.assetId, exchangeCode: normalized.exchange, active: true },
            create: { assetId: transaction.assetId, provider: sourceProvider, providerSymbol: normalized.sourceSymbol, exchangeCode: normalized.exchange },
          });
          await prisma.assetProviderSymbol.upsert({
            where: { provider_providerSymbol: { provider: 'twelve-data', providerSymbol: normalized.providerSymbol } },
            update: { assetId: transaction.assetId, exchangeCode: normalized.exchange, active: true },
            create: { assetId: transaction.assetId, provider: 'twelve-data', providerSymbol: normalized.providerSymbol, exchangeCode: normalized.exchange },
          });
          await prisma.assetProviderSymbol.updateMany({
            where: { assetId: transaction.assetId, provider: 'twelve-data', providerSymbol: { not: normalized.providerSymbol } },
            data: { active: false },
          });
        }
        imported++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo registrar la operación.';
        await this.repository.updateRow(row.id, { status: 'ERROR', validationErrors: [message] as unknown as Prisma.InputJsonValue, reviewedAt: new Date() });
      }
    }
    const refreshed = await this.get(userId, batchId);
    const reviewRows = refreshed.rows.filter((row) => row.status === 'PENDING' || row.status === 'ERROR').length;
    const duplicateRows = refreshed.rows.filter((row) => row.status === 'DUPLICATE').length;
    await this.repository.updateBatch(batchId, { status: reviewRows ? 'NEEDS_REVIEW' : 'COMPLETED', importedRows: refreshed.rows.filter((row) => Boolean(row.transaction)).length, duplicateRows, reviewRows, completedAt: reviewRows ? null : new Date() });
    return { batch: await this.get(userId, batchId), imported, duplicates };
  }

  async forwardingAddress(userId: string) {
    const existing = await this.repository.getForwardingConnection(userId);
    if (existing) return existing;
    const alias = randomBytes(9).toString('base64url').toLowerCase();
    return this.repository.createForwardingConnection(userId, `importar+${alias}@${env.IMPORT_EMAIL_DOMAIN}`);
  }

  async processInbound(secret: string | undefined, payload: InboundEmailPayload) {
    this.verifyInboundSecret(secret);
    const connection = await this.repository.findConnectionByAddress(payload.to.toLowerCase());
    if (!connection || !connection.isActive) throw new HttpError(404, 'La dirección de importación no existe.', 'IMPORT_ADDRESS_NOT_FOUND');
    const receivedAt = payload.receivedAt ? new Date(payload.receivedAt) : new Date();
    const contentHash = hash(`${payload.from}|${payload.subject ?? ''}|${payload.text ?? payload.html ?? ''}`);
    const email = await this.repository.createEmailMessage({ connectionId: connection.id, externalId: payload.messageId ?? contentHash, sender: payload.from, subject: payload.subject, receivedAt, contentHash });
    if (email.duplicate) throw new HttpError(409, 'El correo ya fue procesado.', 'DUPLICATE_EMAIL');
    const broker: ImportBroker = /xtb/i.test(`${payload.from} ${payload.subject}`) ? 'XTB' : 'HAPI';
    let operations: ParsedImportOperation[] = [];
    const passwordCandidates = broker === 'XTB' ? await this.xtbCredentials.candidates(connection.userId) : [];
    const validatedCredentialIds = new Set<string>();
    for (const attachment of payload.attachments ?? []) {
      const buffer = Buffer.from(attachment.contentBase64, 'base64');
      if (buffer.byteLength > 12 * 1024 * 1024) throw new HttpError(413, 'Un adjunto supera el límite de 12 MB.', 'FILE_TOO_LARGE');
      if (!this.isSupportedImportFile(attachment.filename, attachment.contentType ?? 'application/octet-stream')) continue;
      const parsed = await this.parseFile({ originalname: attachment.filename, mimetype: attachment.contentType ?? 'application/octet-stream', buffer, size: buffer.byteLength }, broker, passwordCandidates);
      operations.push(...parsed.operations);
      parsed.validatedCredentialIds.forEach((id) => validatedCredentialIds.add(id));
    }
    if (!operations.length) operations = broker === 'HAPI' ? parseHapiEmail(this.plainText(payload.text ?? payload.html ?? ''), receivedAt) : [];
    if (!operations.length) throw new HttpError(422, 'El correo no contiene operaciones reconocibles.', 'NO_OPERATIONS_FOUND');
    const batch = await this.createBatchFromOperations(connection.userId, operations, { source: 'OUTLOOK', fileName: payload.subject ?? 'Correo reenviado', fileHash: contentHash, emailMessageId: email.message.id });
    await this.markCredentialsValidated(validatedCredentialIds);
    await this.repository.markEmailProcessed(email.message.id);
    return batch;
  }

  async processOutlookMime(userId: string, connectionId: string, input: { externalId: string; sender: string; subject?: string; receivedAt: Date; mime: Buffer }) {
    if (input.mime.byteLength > 12 * 1024 * 1024) throw new HttpError(413, 'El correo supera el límite de 12 MB.', 'FILE_TOO_LARGE');
    const contentHash = hash(input.mime);
    const email = await this.repository.createEmailMessage({ connectionId, externalId: input.externalId, sender: input.sender, subject: input.subject, receivedAt: input.receivedAt, contentHash });
    if (email.duplicate) return { duplicate: true as const, batch: null };
    try {
      const passwordCandidates = await this.xtbCredentials.candidates(userId);
      const parsed = await this.parseFile({ originalname: 'outlook-message.eml', mimetype: 'message/rfc822', buffer: input.mime, size: input.mime.byteLength }, undefined, passwordCandidates);
      if (!parsed.operations.length) {
        await this.repository.markEmailProcessed(email.message.id);
        return { duplicate: false as const, batch: null, ignored: true as const };
      }
      const batch = await this.createBatchFromOperations(userId, parsed.operations, { source: 'OUTLOOK', fileName: input.subject ?? 'Correo de Outlook', fileHash: contentHash, emailMessageId: email.message.id });
      await this.markCredentialsValidated(new Set(parsed.validatedCredentialIds));
      await this.repository.markEmailProcessed(email.message.id);
      return { duplicate: false as const, batch, ignored: false as const };
    } catch (error) {
      await this.repository.deleteEmailMessage(email.message.id).catch(() => undefined);
      throw error;
    }
  }

  private async parseFile(file: UploadFile, broker?: ImportBroker, passwordCandidates: PasswordCandidate[] = []): Promise<ParsedFileResult> {
    const extension = file.originalname.toLowerCase().split('.').pop();
    if (extension === 'eml' || file.mimetype === 'message/rfc822') {
      const email = await simpleParser(file.buffer);
      const detected: ImportBroker = broker ?? (/xtb/i.test(`${email.from?.text} ${email.subject}`) ? 'XTB' : 'HAPI');
      const attachmentRows: ParsedImportOperation[] = [];
      const validatedCredentialIds = new Set<string>();
      for (const attachment of email.attachments) {
        const filename = attachment.filename ?? 'attachment';
        if (!this.isSupportedImportFile(filename, attachment.contentType)) continue;
        const parsed = await this.parseFile({ originalname: filename, mimetype: attachment.contentType, buffer: attachment.content, size: attachment.size }, detected, passwordCandidates);
        attachmentRows.push(...parsed.operations);
        parsed.validatedCredentialIds.forEach((id) => validatedCredentialIds.add(id));
      }
      const body = `${email.subject ?? ''}\n${email.text ?? this.plainText(email.html || '')}`;
      const bodyRows = detected === 'HAPI' ? parseHapiEmail(body, email.date ?? new Date()) : [];
      return { operations: [...bodyRows, ...attachmentRows], source: detected === 'HAPI' ? 'HAPI_EMAIL' : 'XTB_DOCUMENT', validatedCredentialIds: [...validatedCredentialIds] };
    }
    if (extension === 'pdf' || file.mimetype === 'application/pdf') {
      const pdf = await this.extractPdfWithCandidates(file.buffer, passwordCandidates);
      return { operations: parseXtbDocument(pdf.text), source: 'XTB_DOCUMENT', validatedCredentialIds: pdf.credentialId ? [pdf.credentialId] : [] };
    }
    if (extension === 'csv' || file.mimetype.includes('csv')) {
      if (!broker) throw new HttpError(422, 'Selecciona Hapi o XTB para importar un CSV.', 'BROKER_REQUIRED');
      return { operations: parseCsvImport(file.buffer, broker), source: 'FILE', validatedCredentialIds: [] };
    }
    if (extension === 'txt' || file.mimetype.startsWith('text/')) {
      const detected = broker ?? (/xtb/i.test(file.originalname) ? 'XTB' : 'HAPI');
      const text = file.buffer.toString('utf8');
      return { operations: detected === 'HAPI' ? parseHapiEmail(text) : parseXtbDocument(text), source: detected === 'HAPI' ? 'HAPI_EMAIL' : 'XTB_DOCUMENT', validatedCredentialIds: [] };
    }
    throw new HttpError(415, 'Formato no compatible. Usa EML, PDF, CSV o TXT.', 'UNSUPPORTED_IMPORT_FILE');
  }

  private async extractPdfWithCandidates(buffer: Buffer, candidates: PasswordCandidate[]) {
    let passwordRequired: unknown;
    try {
      return { text: await extractPdfText(buffer), credentialId: undefined as string | undefined };
    } catch (error) {
      if (!(error instanceof HttpError) || error.code !== 'PDF_PASSWORD_REQUIRED') throw error;
      passwordRequired = error;
    }
    let lastError = passwordRequired;
    for (const candidate of candidates) {
      try {
        return { text: await extractPdfText(buffer, candidate.password), credentialId: candidate.credentialId };
      } catch (error) {
        if (!(error instanceof HttpError) || error.code !== 'INVALID_PDF_PASSWORD') throw error;
        lastError = error;
      }
    }
    throw lastError;
  }

  private isSupportedImportFile(filename: string, mimetype: string) {
    return /\.(eml|pdf|csv|txt)$/i.test(filename) || ['message/rfc822', 'application/pdf', 'text/csv', 'text/plain', 'application/csv'].includes(mimetype);
  }

  private async markCredentialsValidated(ids: Set<string>) {
    await Promise.allSettled([...ids].map((id) => this.xtbCredentials.validated(id)));
  }

  private async createBatchFromOperations(userId: string, operations: ParsedImportOperation[], meta: { accountId?: string; emailMessageId?: string; source: 'HAPI_EMAIL' | 'XTB_DOCUMENT' | 'OUTLOOK' | 'FILE'; fileName?: string; fileHash?: string }) {
    const batch = await this.repository.createBatch({ userId, ...meta });
    const rows = [];
    for (let index = 0; index < operations.length; index++) {
      const operation = operations[index]!;
      let marketLinked = false;
      try {
        const resolvedAsset = await this.assetResolver.resolve(operation.normalized);
        if (resolvedAsset) {
          Object.assign(operation.normalized, resolvedAsset, {
            confidence: Math.max(operation.normalized.confidence, resolvedAsset.marketDataMatch.confidence),
            warnings: operation.normalized.warnings.filter((warning) => !/s[ií]mbolo equivalente|proveedor de precios/i.test(warning)),
          });
          marketLinked = true;
        } else {
          operation.normalized.confidence = Math.min(operation.normalized.confidence, 92);
          operation.normalized.warnings.push('Twelve Data no encontró una empresa coincidente; revisa el símbolo.');
        }
      } catch {
        operation.normalized.confidence = Math.min(operation.normalized.confidence, 92);
        operation.normalized.warnings.push('No fue posible validar la empresa en Twelve Data en este momento.');
      }
      const account = await this.repository.findAccount(userId, { accountId: meta.accountId, externalAccountNumber: operation.normalized.externalAccountNumber, broker: operation.normalized.broker });
      if (account) operation.normalized.accountId = account.id;
      const key = duplicateKey(operation.normalized, account?.id);
      const externalId = operation.normalized.externalOrderId ?? `import:${key}`;
      const duplicate = account ? await this.repository.findDuplicate(account.id, externalId) : null;
      const valid = normalizedImportOperationSchema.safeParse(operation.normalized).success;
      const status: ImportRowStatus = duplicate ? 'DUPLICATE' : valid && account && marketLinked && operation.normalized.confidence >= 98 ? 'APPROVED' : valid ? 'PENDING' : 'ERROR';
      rows.push({ rowNumber: index + 1, rawData: operation.raw as Prisma.InputJsonValue, normalizedData: operation.normalized as unknown as Prisma.InputJsonValue, confidence: operation.normalized.confidence, status, duplicateKey: key, validationErrors: valid ? undefined : operation.normalized.warnings as unknown as Prisma.InputJsonValue });
    }
    await this.repository.createRows(batch.id, rows);
    const reviewRows = rows.filter((row) => row.status === 'PENDING' || row.status === 'ERROR').length;
    const duplicateRows = rows.filter((row) => row.status === 'DUPLICATE').length;
    const commonAccount = rows.map((_, index) => operations[index]!.normalized.accountId).find(Boolean);
    await this.repository.updateBatch(batch.id, { accountId: commonAccount, status: 'NEEDS_REVIEW', totalRows: rows.length, duplicateRows, reviewRows });
    return this.get(userId, batch.id);
  }

  private verifyInboundSecret(value?: string) {
    const expected = Buffer.from(env.INBOUND_EMAIL_SECRET);
    const provided = Buffer.from(value ?? '');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new HttpError(401, 'Webhook no autorizado.', 'INVALID_INBOUND_SECRET');
  }

  private plainText(value: string) { return value.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
}

export const importService = new ImportService();
