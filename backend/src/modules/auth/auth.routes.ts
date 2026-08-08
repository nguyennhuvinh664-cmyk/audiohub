import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { fail, ok } from '../../shared/http/response.js';
import { requireAuth, type AuthRequest } from '../../shared/middleware/auth.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const updateProfileSchema = z.object({
  displayName: z.string().min(1).optional(),
  avatarDataUrl: z.string().max(6 * 1024 * 1024).optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(6).optional()
});

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Invalid payload', 400);
  }

  const { email, password, displayName } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return fail(res, 'Email already in use', 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, displayName }
  });

  const token = jwt.sign({ userId: user.id, email: user.email }, env.JWT_SECRET, { expiresIn: '7d' });
  return ok(res, { token, user: { id: user.id, email: user.email, displayName: user.displayName, isAdmin: user.isAdmin } }, 201);
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Invalid payload', 400);
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return fail(res, 'Invalid credentials', 401);
  }

  const matched = await bcrypt.compare(password, user.passwordHash);
  if (!matched) {
    return fail(res, 'Invalid credentials', 401);
  }

  const token = jwt.sign({ userId: user.id, email: user.email }, env.JWT_SECRET, { expiresIn: '7d' });
  return ok(res, { token, user: { id: user.id, email: user.email, displayName: user.displayName, isAdmin: user.isAdmin } });
});

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.auth?.userId;
  if (!userId) {
    return fail(res, 'Unauthorized', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return fail(res, 'User not found', 404);
  }

  return ok(res, { id: user.id, email: user.email, displayName: user.displayName, avatarDataUrl: user.avatarDataUrl || '', isAdmin: user.isAdmin });
});

router.patch('/profile', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.auth?.userId;
  if (!userId) {
    return fail(res, 'Unauthorized', 401);
  }

  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Invalid payload', 400);
  }

  const body = parsed.data;
  if (!body.displayName && !body.avatarDataUrl && !body.newPassword && !body.currentPassword) {
    return fail(res, 'No changes provided', 400);
  }

  if ((body.currentPassword && !body.newPassword) || (!body.currentPassword && body.newPassword)) {
    return fail(res, 'Current password and new password are required together', 400);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return fail(res, 'User not found', 404);
  }

  let nextPasswordHash: string | undefined;
  if (body.currentPassword && body.newPassword) {
    const matched = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!matched) {
      return fail(res, 'Current password is incorrect', 400);
    }
    nextPasswordHash = await bcrypt.hash(body.newPassword, 10);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      displayName: body.displayName ? body.displayName : user.displayName,
      avatarDataUrl: body.avatarDataUrl === undefined ? user.avatarDataUrl : body.avatarDataUrl,
      passwordHash: nextPasswordHash ? nextPasswordHash : user.passwordHash
    }
  });

  return ok(res, { id: updated.id, email: updated.email, displayName: updated.displayName, avatarDataUrl: updated.avatarDataUrl || '', isAdmin: updated.isAdmin });
});

export default router;
