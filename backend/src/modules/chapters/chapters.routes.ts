import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { requireAuth, type AuthRequest } from '../../shared/middleware/auth.js';
import { ok, fail } from '../../shared/http/response.js';
import type { Response } from 'express';

const router = Router();
router.use(requireAuth);

// GET /api/v1/chapters/unlocked — list unlocked chapters grouped by story
router.get('/unlocked', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;

    const chapters = await prisma.unlockedChapter.findMany({
      where: { userId },
      orderBy: { unlockedAt: 'desc' },
      include: {
        story: {
          select: { id: true, title: true, author: true, genre: true, coverKey: true }
        }
      }
    });

    // Group by story
    const grouped: Record<string, any> = {};
    chapters.forEach(function(ch) {
      const storyId = ch.storyId;
      if (!grouped[storyId]) {
        grouped[storyId] = {
          story: ch.story,
          chapters: []
        };
      }
      grouped[storyId].chapters.push({
        id: ch.id,
        chapterIdx: ch.chapterIdx,
        unlockedAt: ch.unlockedAt
      });
    });

    return ok(res, { stories: Object.values(grouped) });
  } catch (err) {
    return fail(res, 'Không thể tải danh sách chương', 500);
  }
});

// POST /api/v1/chapters/unlock — unlock a chapter
const unlockSchema = z.object({
  storyId: z.string().min(1),
  chapterIdx: z.number().int().min(0)
});

router.post('/unlock', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const parsed = unlockSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 'Dữ liệu không hợp lệ');

    const { storyId, chapterIdx } = parsed.data;

    // Check if already unlocked
    const existing = await prisma.unlockedChapter.findUnique({
      where: { userId_storyId_chapterIdx: { userId, storyId, chapterIdx } }
    });
    if (existing) return ok(res, { alreadyUnlocked: true });

    const chapter = await prisma.unlockedChapter.create({
      data: { userId, storyId, chapterIdx }
    });

    return ok(res, { chapter });
  } catch (err) {
    return fail(res, 'Mở khóa thất bại', 500);
  }
});

export default router;
