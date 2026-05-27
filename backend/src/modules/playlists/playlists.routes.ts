import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { ok, fail } from '../../shared/http/response.js';
import { requireAuth, type AuthRequest } from '../../shared/middleware/auth.js';

const router = Router();

const createPlaylistSchema = z.object({
  name: z.string().min(1).max(120),
  status: z.string().optional()
});

const updatePlaylistSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  status: z.string().optional()
});

const createItemSchema = z.object({
  storyId: z.string().min(1),
  storyTitle: z.string().min(1).default('Truyện mới'),
  storyAuthor: z.string().min(1).default('Ẩn danh'),
  chapterLabel: z.string().min(1).default('Chương 1'),
  chapterIndex: z.number().int().min(0).optional()
});

const updateItemSchema = z.object({
  chapterLabel: z.string().min(1).optional(),
  chapterIndex: z.number().int().min(0).optional()
});

function normalizeStatus(value: unknown) {
  return String(value || '').trim() === 'Đã hoàn thành' ? 'Đã hoàn thành' : 'Đang ra';
}

function toPlaylistResponse(playlist: any) {
  const items = Array.isArray(playlist.items) ? playlist.items.slice() : [];
  items.sort(function (a: any, b: any) {
    const ai = Number(a.chapterIndex || 0);
    const bi = Number(b.chapterIndex || 0);
    if (ai !== bi) return ai - bi;
    return Date.parse(String(a.createdAt || '')) - Date.parse(String(b.createdAt || ''));
  });

  return {
    id: playlist.id,
    name: playlist.name,
    status: normalizeStatus(playlist.status),
    createdAt: playlist.createdAt,
    updatedAt: playlist.updatedAt,
    items: items.map(function (item: any) {
      return {
        id: item.id,
        storyId: item.storyId,
        storyTitle: item.storyTitle,
        storyAuthor: item.storyAuthor,
        chapterLabel: item.chapterLabel || 'Chương 1',
        chapterIndex: Number(item.chapterIndex || 0),
        createdAt: item.createdAt
      };
    })
  };
}

router.use(requireAuth);

router.get('/', async (req: AuthRequest, res) => {
  const rows = await prisma.playlist.findMany({
    where: { userId: req.auth!.userId },
    orderBy: { updatedAt: 'desc' },
    include: { items: true }
  });
  return ok(res, rows.map(toPlaylistResponse));
});

router.post('/', async (req: AuthRequest, res) => {
  const parsed = createPlaylistSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Invalid payload', 400);
  }

  const created = await prisma.playlist.create({
    data: {
      userId: req.auth!.userId,
      name: parsed.data.name.trim(),
      status: normalizeStatus(parsed.data.status)
    },
    include: { items: true }
  });

  return ok(res, toPlaylistResponse(created), 201);
});

router.patch('/:id', async (req: AuthRequest, res) => {
  const parsed = updatePlaylistSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Invalid payload', 400);
  }

  const existing = await prisma.playlist.findFirst({
    where: { id: req.params.id, userId: req.auth!.userId },
    include: { items: true }
  });

  if (!existing) {
    return fail(res, 'Playlist not found', 404);
  }

  const updated = await prisma.playlist.update({
    where: { id: existing.id },
    data: {
      name: parsed.data.name ? parsed.data.name.trim() : existing.name,
      status: parsed.data.status === undefined ? existing.status : normalizeStatus(parsed.data.status)
    },
    include: { items: true }
  });

  return ok(res, toPlaylistResponse(updated));
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const existing = await prisma.playlist.findFirst({
    where: { id: req.params.id, userId: req.auth!.userId }
  });

  if (!existing) {
    return fail(res, 'Playlist not found', 404);
  }

  await prisma.playlist.delete({ where: { id: existing.id } });
  return ok(res, { id: existing.id });
});

router.post('/:id/items', async (req: AuthRequest, res) => {
  const parsed = createItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Invalid payload', 400);
  }

  const playlist = await prisma.playlist.findFirst({
    where: { id: req.params.id, userId: req.auth!.userId },
    include: { items: true }
  });

  if (!playlist) {
    return fail(res, 'Playlist not found', 404);
  }

  const nextIndex = parsed.data.chapterIndex === undefined
    ? (playlist.items || []).length
    : parsed.data.chapterIndex;

  await prisma.playlistItem.create({
    data: {
      playlistId: playlist.id,
      storyId: parsed.data.storyId,
      storyTitle: parsed.data.storyTitle,
      storyAuthor: parsed.data.storyAuthor,
      chapterLabel: parsed.data.chapterLabel,
      chapterIndex: nextIndex
    }
  });

  const updated = await prisma.playlist.findUnique({
    where: { id: playlist.id },
    include: { items: true }
  });

  return ok(res, toPlaylistResponse(updated));
});

router.patch('/:id/items/:itemId', async (req: AuthRequest, res) => {
  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Invalid payload', 400);
  }

  const playlist = await prisma.playlist.findFirst({
    where: { id: req.params.id, userId: req.auth!.userId }
  });

  if (!playlist) {
    return fail(res, 'Playlist not found', 404);
  }

  const item = await prisma.playlistItem.findFirst({
    where: { id: req.params.itemId, playlistId: playlist.id }
  });

  if (!item) {
    return fail(res, 'Playlist item not found', 404);
  }

  await prisma.playlistItem.update({
    where: { id: item.id },
    data: {
      chapterLabel: parsed.data.chapterLabel === undefined ? item.chapterLabel : parsed.data.chapterLabel,
      chapterIndex: parsed.data.chapterIndex === undefined ? item.chapterIndex : parsed.data.chapterIndex
    }
  });

  const updated = await prisma.playlist.findUnique({
    where: { id: playlist.id },
    include: { items: true }
  });

  return ok(res, toPlaylistResponse(updated));
});

router.delete('/:id/items/:itemId', async (req: AuthRequest, res) => {
  const playlist = await prisma.playlist.findFirst({
    where: { id: req.params.id, userId: req.auth!.userId }
  });

  if (!playlist) {
    return fail(res, 'Playlist not found', 404);
  }

  const item = await prisma.playlistItem.findFirst({
    where: { id: req.params.itemId, playlistId: playlist.id }
  });

  if (!item) {
    return fail(res, 'Playlist item not found', 404);
  }

  await prisma.playlistItem.delete({ where: { id: item.id } });

  const updated = await prisma.playlist.findUnique({
    where: { id: playlist.id },
    include: { items: true }
  });

  return ok(res, toPlaylistResponse(updated));
});

export default router;
