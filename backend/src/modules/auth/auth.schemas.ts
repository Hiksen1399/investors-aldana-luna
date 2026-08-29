import { z } from 'zod';

export const registerSchema = z.object({
  email: z.email('Correo inválido.').transform((value) => value.trim().toLowerCase()),
  password: z.string().min(10, 'Usa al menos 10 caracteres.').max(128),
  fullName: z.string().trim().min(2).max(160),
  timezone: z.string().trim().min(3).max(80).default('America/Bogota'),
});

export const loginSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(10).max(128),
});

