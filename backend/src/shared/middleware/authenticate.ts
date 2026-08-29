import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { HttpError } from '../errors/http-error.js';

type AccessPayload = jwt.JwtPayload & { sub: string; email: string };

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) {
    next(new HttpError(401, 'Debes iniciar sesión.', 'UNAUTHENTICATED'));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
    req.auth = { userId: payload.sub, email: payload.email };
    next();
  } catch {
    next(new HttpError(401, 'Tu sesión venció. Inicia sesión nuevamente.', 'INVALID_TOKEN'));
  }
}

