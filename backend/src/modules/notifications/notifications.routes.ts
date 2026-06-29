import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { requireAuth, type AuthRequest } from '../../shared/middleware/auth.js';
import { ok, fail } from '../../shared/http/response.js';
import type { Response } from 'express';

const router = Router();
router.use(requireAuth);

// GET /api/v1/notifications/ — list notifications
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const page = Math.max(1, parseInt(String(req.query.page || '1')));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'))));
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, isRead: false } })
    ]);

    return ok(res, { notifications, total, unreadCount, page, limit });
  } catch (err) {
    return fail(res, 'Không thể tải thông báo', 500);
  }
});

// PATCH /api/v1/notifications/:id/read — mark as read
router.patch('/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const notification = await prisma.notification.findFirst({
      where: { id, userId }
    });
    if (!notification) return fail(res, 'Không tìm thấy thông báo', 404);

    await prisma.notification.update({
      where: { id },
      data: { isRead: true }
    });

    return ok(res, { success: true });
  } catch (err) {
    return fail(res, 'Cập nhật thất bại', 500);
  }
});

// POST /api/v1/notifications/read-all — mark all as read
router.post('/read-all', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;

    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true }
    });

    return ok(res, { success: true });
  } catch (err) {
    return fail(res, 'Cập nhật thất bại', 500);
  }
});

// DELETE /api/v1/notifications/:id — delete one
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const notification = await prisma.notification.findFirst({
      where: { id, userId }
    });
    if (!notification) return fail(res, 'Không tìm thấy thông báo', 404);

    await prisma.notification.delete({ where: { id } });

    return ok(res, { success: true });
  } catch (err) {
    return fail(res, 'Xóa thất bại', 500);
  }
});

export default router;
