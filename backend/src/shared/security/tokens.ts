import { createHash, randomBytes } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function newOpaqueToken(): string {
  return randomBytes(48).toString('base64url');
}

export function signAccessToken(user: { id: string; email: string }): string {
  return jwt.sign(
    { email: user.email },
    env.JWT_ACCESS_SECRET,
    { subject: user.id, expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'] },
  );
}

