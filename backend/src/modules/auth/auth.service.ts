import argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { env } from '../../shared/config/env.js';
import { prisma } from '../../shared/database/prisma.js';
import { HttpError } from '../../shared/errors/http-error.js';
import { hashToken, newOpaqueToken, signAccessToken } from '../../shared/security/tokens.js';

type ClientMeta = { ipAddress?: string; userAgent?: string };

const publicUserSelect = {
  id: true,
  email: true,
  status: true,
  emailVerifiedAt: true,
  profile: { select: { fullName: true, timezone: true, locale: true, baseCurrencyCode: true } },
} satisfies Prisma.UserSelect;

async function issueSession(user: { id: string; email: string }, meta: ClientMeta) {
  const secret = newOpaqueToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000);
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashToken(secret),
      expiresAt,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });
  return {
    accessToken: signAccessToken(user),
    refreshToken: `${session.id}.${secret}`,
    refreshExpiresAt: expiresAt,
  };
}

export const authService = {
  async register(input: { email: string; password: string; fullName: string; timezone: string }, meta: ClientMeta) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new HttpError(409, 'Ya existe una cuenta con ese correo.', 'EMAIL_IN_USE');

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          emailVerifiedAt: new Date(),
          profile: { create: { fullName: input.fullName, timezone: input.timezone } },
        },
      });
      const workspace = await tx.workspace.create({
        data: {
          ownerUserId: created.id,
          name: `Espacio de ${input.fullName.split(' ')[0]}`,
          members: { create: { userId: created.id, role: 'OWNER', acceptedAt: new Date() } },
          portfolios: { create: { name: 'Mi portafolio', baseCurrencyCode: 'USD', objective: 'Construir patrimonio a largo plazo' } },
        },
      });
      await tx.auditLog.create({ data: { actorUserId: created.id, action: 'AUTH_REGISTER', entityType: 'workspace', entityId: workspace.id } });
      return created;
    });

    const session = await issueSession(user, meta);
    return { user: await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: publicUserSelect }), ...session };
  },

  async login(input: { email: string; password: string }, meta: ClientMeta) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw new HttpError(401, 'Correo o contraseña incorrectos.', 'INVALID_CREDENTIALS');
    if (user.status === 'SUSPENDED') throw new HttpError(403, 'Esta cuenta está suspendida.', 'ACCOUNT_SUSPENDED');
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpError(423, 'La cuenta está bloqueada temporalmente. Intenta más tarde.', 'ACCOUNT_LOCKED');
    }

    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: attempts >= 5 ? 0 : attempts, lockedUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null },
      });
      throw new HttpError(401, 'Correo o contraseña incorrectos.', 'INVALID_CREDENTIALS');
    }

    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    const session = await issueSession(user, meta);
    await prisma.auditLog.create({ data: { actorUserId: user.id, action: 'AUTH_LOGIN', ipAddress: meta.ipAddress, userAgent: meta.userAgent } });
    return { user: await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: publicUserSelect }), ...session };
  },

  async refresh(rawToken?: string) {
    const [sessionId, secret] = rawToken?.split('.') ?? [];
    if (!sessionId || !secret) throw new HttpError(401, 'La sesión ya no es válida.', 'INVALID_REFRESH_TOKEN');
    const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.refreshTokenHash !== hashToken(secret)) {
      throw new HttpError(401, 'La sesión ya no es válida.', 'INVALID_REFRESH_TOKEN');
    }
    const nextSecret = newOpaqueToken();
    await prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: hashToken(nextSecret), lastUsedAt: new Date() },
    });
    return {
      accessToken: signAccessToken(session.user),
      refreshToken: `${session.id}.${nextSecret}`,
      refreshExpiresAt: session.expiresAt,
    };
  },

  async me(userId: string) {
    return prisma.user.findUniqueOrThrow({ where: { id: userId }, select: publicUserSelect });
  },

  async logout(rawToken?: string) {
    const sessionId = rawToken?.split('.')[0];
    if (sessionId) await prisma.session.updateMany({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  },

  async logoutAll(userId: string) {
    await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  },

  async sessions(userId: string) {
    return prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, ipAddress: true, userAgent: true, lastUsedAt: true, expiresAt: true, createdAt: true },
      orderBy: { lastUsedAt: 'desc' },
    });
  },

  async revokeSession(userId: string, sessionId: string) {
    await prisma.session.updateMany({ where: { id: sessionId, userId }, data: { revokedAt: new Date() } });
  },

  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return { message: 'Si el correo existe, recibirás instrucciones para recuperar tu cuenta.' };
    const token = newOpaqueToken();
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60_000) },
    });
    return {
      message: 'Si el correo existe, recibirás instrucciones para recuperar tu cuenta.',
      ...(env.NODE_ENV === 'development' ? { developmentToken: token } : {}),
    };
  },

  async resetPassword(token: string, password: string) {
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.usedAt || record.expiresAt <= new Date()) throw new HttpError(400, 'El enlace venció o ya fue utilizado.', 'INVALID_RESET_TOKEN');
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { message: 'Contraseña actualizada correctamente.' };
  },
};

