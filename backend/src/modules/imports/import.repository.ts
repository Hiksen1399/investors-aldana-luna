import type { ImportRowStatus, ImportStatus, Prisma, TransactionSource } from '@prisma/client';
import { prisma } from '../../shared/database/prisma.js';

export class ImportRepository {
  list(userId: string) {
    return prisma.importBatch.findMany({ where: { userId }, include: { account: { include: { broker: true } }, _count: { select: { rows: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  getBatch(userId: string, id: string) {
    return prisma.importBatch.findFirst({ where: { id, userId }, include: { account: { include: { broker: true } }, rows: { orderBy: { rowNumber: 'asc' }, include: { transaction: { select: { id: true } } } } } });
  }

  findByFileHash(userId: string, fileHash: string) {
    return prisma.importBatch.findFirst({ where: { userId, fileHash, status: { not: 'FAILED' } }, include: { rows: true, account: { include: { broker: true } } }, orderBy: { createdAt: 'desc' } });
  }

  createBatch(data: { userId: string; accountId?: string; emailMessageId?: string; source: TransactionSource; fileName?: string; fileHash?: string }) {
    return prisma.importBatch.create({ data: { ...data, status: 'PROCESSING', startedAt: new Date() } });
  }

  createRows(batchId: string, rows: Array<{ rowNumber: number; rawData: Prisma.InputJsonValue; normalizedData: Prisma.InputJsonValue; confidence: number; status: ImportRowStatus; duplicateKey: string; validationErrors?: Prisma.InputJsonValue }>) {
    return prisma.importRow.createMany({ data: rows.map((row) => ({ ...row, batchId })) });
  }

  updateBatch(id: string, data: { accountId?: string; status?: ImportStatus; totalRows?: number; importedRows?: number; duplicateRows?: number; reviewRows?: number; errorMessage?: string | null; completedAt?: Date | null }) {
    return prisma.importBatch.update({ where: { id }, data });
  }

  async findAccount(userId: string, input: { accountId?: string; externalAccountNumber?: string; broker?: string }) {
    if (input.accountId) return prisma.brokerAccount.findFirst({ where: { id: input.accountId, archivedAt: null, portfolio: { workspace: { members: { some: { userId } } } } }, include: { broker: true } });
    if (input.externalAccountNumber) return prisma.brokerAccount.findFirst({ where: { externalAccountNumber: input.externalAccountNumber, archivedAt: null, portfolio: { workspace: { members: { some: { userId } } } } }, include: { broker: true } });
    if (input.broker) {
      const accounts = await prisma.brokerAccount.findMany({ where: { broker: { slug: input.broker.toLowerCase() }, archivedAt: null, portfolio: { workspace: { members: { some: { userId } } } } }, include: { broker: true }, take: 2 });
      return accounts.length === 1 ? accounts[0] : null;
    }
    return null;
  }

  listBrokerAccountsWithCredential(userId: string, broker: string, kind: string) {
    return prisma.brokerAccount.findMany({
      where: { broker: { slug: broker }, archivedAt: null, portfolio: { workspace: { members: { some: { userId } } } } },
      select: {
        id: true,
        name: true,
        credentials: { where: { kind }, select: { id: true, updatedAt: true, lastValidatedAt: true }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  listBrokerCredentials(userId: string, broker: string, kind: string) {
    return prisma.brokerCredential.findMany({
      where: { kind, account: { broker: { slug: broker }, archivedAt: null, portfolio: { workspace: { members: { some: { userId } } } } } },
      select: { id: true, accountId: true, encryptedSecretRef: true },
    });
  }

  upsertBrokerCredential(accountId: string, kind: string, encryptedSecretRef: string) {
    return prisma.brokerCredential.upsert({
      where: { accountId_kind: { accountId, kind } },
      update: { encryptedSecretRef, lastValidatedAt: null },
      create: { accountId, kind, encryptedSecretRef },
    });
  }

  deleteBrokerCredential(accountId: string, kind: string) {
    return prisma.brokerCredential.deleteMany({ where: { accountId, kind } });
  }

  markBrokerCredentialValidated(id: string) {
    return prisma.brokerCredential.update({ where: { id }, data: { lastValidatedAt: new Date() } });
  }

  getRow(userId: string, rowId: string) {
    return prisma.importRow.findFirst({ where: { id: rowId, batch: { userId } }, include: { batch: true, transaction: true } });
  }

  updateRow(rowId: string, data: { normalizedData?: Prisma.InputJsonValue; confidence?: number; status?: ImportRowStatus; duplicateKey?: string; validationErrors?: Prisma.InputJsonValue | typeof Prisma.JsonNull; reviewedAt?: Date }) {
    return prisma.importRow.update({ where: { id: rowId }, data });
  }

  findDuplicate(accountId: string, externalId: string) {
    return prisma.transaction.findFirst({ where: { accountId, externalId }, select: { id: true } });
  }

  getForwardingConnection(userId: string) {
    return prisma.emailConnection.findFirst({ where: { userId, type: 'FORWARDING', isActive: true } });
  }

  getMicrosoftConnection(userId: string) {
    return prisma.emailConnection.findFirst({ where: { userId, type: 'MICROSOFT_GRAPH', isActive: true } });
  }

  listMicrosoftConnections() {
    return prisma.emailConnection.findMany({ where: { type: 'MICROSOFT_GRAPH', isActive: true, encryptedSecretRef: { not: null } }, select: { id: true, userId: true } });
  }

  async saveMicrosoftConnection(userId: string, email: string, encryptedSecretRef: string) {
    const existing = await prisma.emailConnection.findFirst({ where: { userId, type: 'MICROSOFT_GRAPH' } });
    if (existing) return prisma.emailConnection.update({ where: { id: existing.id }, data: { email, encryptedSecretRef, isActive: true, lastSyncedAt: null } });
    return prisma.emailConnection.create({ data: { userId, type: 'MICROSOFT_GRAPH', email, encryptedSecretRef, isActive: true } });
  }

  updateMicrosoftConnection(id: string, data: { encryptedSecretRef?: string; lastSyncedAt?: Date | null; isActive?: boolean }) {
    return prisma.emailConnection.update({ where: { id }, data });
  }

  async disconnectMicrosoft(userId: string) {
    const connection = await this.getMicrosoftConnection(userId);
    if (!connection) return false;
    await prisma.emailConnection.update({ where: { id: connection.id }, data: { isActive: false, encryptedSecretRef: null } });
    return true;
  }

  createForwardingConnection(userId: string, forwardingAddress: string) {
    return prisma.emailConnection.create({ data: { userId, type: 'FORWARDING', forwardingAddress, isActive: true } });
  }

  findConnectionByAddress(forwardingAddress: string) {
    return prisma.emailConnection.findUnique({ where: { forwardingAddress } });
  }

  async createEmailMessage(data: { connectionId: string; externalId: string; sender: string; subject?: string; receivedAt: Date; contentHash: string }) {
    const existing = await prisma.emailMessage.findUnique({ where: { connectionId_externalId: { connectionId: data.connectionId, externalId: data.externalId } } });
    if (existing) return { message: existing, duplicate: true };
    return { message: await prisma.emailMessage.create({ data }), duplicate: false };
  }

  deleteEmailMessage(id: string) {
    return prisma.emailMessage.delete({ where: { id } });
  }

  markEmailProcessed(id: string) {
    return prisma.emailMessage.update({ where: { id }, data: { processedAt: new Date() } });
  }

  listOutlookImportsForCleanup(userId: string) {
    return prisma.importBatch.findMany({
      where: { userId, source: 'OUTLOOK', importedRows: 0, emailMessageId: { not: null } },
      select: {
        id: true,
        emailMessage: { select: { sender: true, subject: true } },
        rows: { select: { transaction: { select: { id: true } } } },
      },
    });
  }

  deleteImportBatches(ids: string[]) {
    return prisma.importBatch.deleteMany({ where: { id: { in: ids } } });
  }
}

export const importRepository = new ImportRepository();
