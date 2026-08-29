import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../../shared/config/env.js';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authService } from './auth.service.js';
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from './auth.schemas.js';

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });

function clientMeta(req: Request) {
  return { ipAddress: req.ip, userAgent: req.get('user-agent') };
}

function setRefreshCookie(res: Response, token: string, expires: Date) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires,
    path: '/api/auth',
  });
}

router.post('/register', authLimiter, async (req, res) => {
  const result = await authService.register(registerSchema.parse(req.body), clientMeta(req));
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  res.status(201).json({ user: result.user, accessToken: result.accessToken });
});

router.post('/login', authLimiter, async (req, res) => {
  const result = await authService.login(loginSchema.parse(req.body), clientMeta(req));
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  res.json({ user: result.user, accessToken: result.accessToken });
});

router.post('/refresh', async (req, res) => {
  const result = await authService.refresh(req.cookies.refreshToken);
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  res.json({ accessToken: result.accessToken });
});

router.post('/logout', async (req, res) => {
  await authService.logout(req.cookies.refreshToken);
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.status(204).send();
});

router.post('/logout-all', authenticate, async (req, res) => {
  await authService.logoutAll(req.auth!.userId);
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.status(204).send();
});

router.get('/me', authenticate, async (req, res) => res.json({ data: await authService.me(req.auth!.userId) }));
router.get('/sessions', authenticate, async (req, res) => res.json({ data: await authService.sessions(req.auth!.userId) }));
router.delete('/sessions/:sessionId', authenticate, async (req, res) => {
  await authService.revokeSession(req.auth!.userId, String(req.params.sessionId));
  res.status(204).send();
});
router.post('/forgot-password', authLimiter, async (req, res) => res.json(await authService.forgotPassword(forgotPasswordSchema.parse(req.body).email)));
router.post('/reset-password', authLimiter, async (req, res) => {
  const input = resetPasswordSchema.parse(req.body);
  res.json(await authService.resetPassword(input.token, input.password));
});

export { router as authRouter };
