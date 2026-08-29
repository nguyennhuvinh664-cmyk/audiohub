import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { requireAuth, type AuthRequest } from '../../shared/middleware/auth.js';
import { ok, fail } from '../../shared/http/response.js';
import type { Response } from 'express';

const router = Router();
router.use(requireAuth);

// GET /api/v1/wallet/ — get wallet balance
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    let wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await prisma.wallet.create({ data: { userId, balance: 0 } });
    }
    return ok(res, { balance: wallet.balance, walletId: wallet.id });
  } catch (err) {
    return fail(res, 'Không thể tải ví', 500);
  }
});

// POST /api/v1/wallet/topup — add funds
const topupSchema = z.object({
  amount: z.number().int().positive().max(10000000),
  description: z.string().max(200).optional()
});

router.post('/topup', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const parsed = topupSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 'Số tiền không hợp lệ');

    const { amount, description } = parsed.data;

    let wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await prisma.wallet.create({ data: { userId, balance: 0 } });
    }

    const [updatedWallet] = await prisma.$transaction([
      prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } }
      }),
      prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'TOPUP',
          amount: amount,
          description: description || 'Nạp tiền vào ví'
        }
      })
    ]);

    return ok(res, { balance: updatedWallet.balance });
  } catch (err) {
    return fail(res, 'Nạp tiền thất bại', 500);
  }
});

// GET /api/v1/wallet/transactions — list transactions
router.get('/transactions', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const page = Math.max(1, parseInt(String(req.query.page || '1')));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'))));
    const skip = (page - 1) * limit;

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return ok(res, { transactions: [], total: 0, page, limit });

    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.walletTransaction.count({ where: { walletId: wallet.id } })
    ]);

    return ok(res, { transactions, total, page, limit });
  } catch (err) {
    return fail(res, 'Không thể tải lịch sử giao dịch', 500);
  }
});

// POST /api/v1/wallet/unlock — unlock chapter (deduct balance)
// Server-authoritative price: the client cannot set the cost.
const CHAPTER_UNLOCK_COST = 2500; // Vân Thư per locked chapter

const unlockSchema = z.object({
  storyId: z.string().min(1),
  chapterIdx: z.number().int().min(0),
  storyTitle: z.string().optional()
});

router.post('/unlock', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const parsed = unlockSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 'Dữ liệu không hợp lệ');

    const { storyId, chapterIdx, storyTitle } = parsed.data;
    const cost = CHAPTER_UNLOCK_COST;

    // Check if already unlocked
    const existing = await prisma.unlockedChapter.findUnique({
      where: { userId_storyId_chapterIdx: { userId, storyId, chapterIdx } }
    });
    if (existing) return fail(res, 'Chương đã được mở khóa');

    let wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || wallet.balance < cost) {
      return fail(res, 'Số dư không đủ');
    }

    const [updatedWallet] = await prisma.$transaction([
      prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: cost } }
      }),
      prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "UNLOCK",
          amount: -cost,
          description: "Mở khóa: " + (storyTitle || storyId) + " - Chương " + (chapterIdx + 1),
          referenceId: storyId
        }
      }),
      prisma.unlockedChapter.create({
        data: { userId, storyId, chapterIdx }
      })
]);

    return ok(res, { balance: updatedWallet.balance, unlocked: true });
  } catch (err) {
    return fail(res, 'Mở khóa thất bại', 500);
  }
});

export default router;
