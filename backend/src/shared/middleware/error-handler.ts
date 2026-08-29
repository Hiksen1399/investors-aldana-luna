import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { HttpError } from '../errors/http-error.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, `No existe la ruta ${req.method} ${req.path}.`, 'NOT_FOUND'));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'Revisa los datos enviados.', details: error.issues },
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    res.status(409).json({ error: { code: 'DUPLICATE', message: 'Ya existe un registro con esos datos.' } });
    return;
  }

  console.error(error);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado.' } });
};

