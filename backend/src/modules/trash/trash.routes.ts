import { AudioStatus, StoryVisibility } from '@prisma/client';
import { Router } from 'express';
import { promises as fs } from 'node:fs';
import { prisma } from '../../config/prisma.js';
import { fail, ok } from '../../shared/http/response.js';
import { requireAuth, type AuthRequest } from '../../shared/middleware/auth.js';

const router = Router();

function toStoryVisibility(value: string | undefined | null) {
  if (value === 'Công khai') return StoryVisibility.PUBLIC;
  if (value === 'Không công khai') return StoryVisibility.UNLISTED;
  return StoryVisibility.PRIVATE;
}

function toAudioStatus(value: string | undefined | null) {
  if (value === 'Đang xử lý') return AudioStatus.PROCESSING;
  if (value === 'Tạm ẩn') return AudioStatus.HIDDEN;
  return AudioStatus.READY;
}

async function removeMediaAssetFile(audioKey: string) {
  const asset = await prisma.mediaAsset.findUnique({ where: { key: audioKey } });
  if (!asset || !asset.storagePath) {
    return;
  }
  await fs.unlink(asset.storagePath).catch(function () { return null; });
}

router.use(requireAuth);

router.get('/', async (req: AuthRequest, res) => {
  const items = await prisma.audioTrash.findMany({
    where: { ownerUserId: req.auth!.userId },
    include: { mediaAsset: true },
    orderBy: { deletedAt: 'desc' }
  });

  return ok(res, items.map(function (item: any) {
    return {
      key: item.audioKey,
      size: item.mediaAsset && typeof item.mediaAsset.sizeBytes === 'number' ? item.mediaAsset.sizeBytes : 0,
      deletedAt: item.deletedAt,
      story: item.storySnapshot
    };
  }));
});

router.post('/:audioKey/restore', async (req: AuthRequest, res) => {
  const row = await prisma.audioTrash.findFirst({
    where: { audioKey: req.params.audioKey, ownerUserId: req.auth!.userId }
  });
  if (!row) {
    return fail(res, 'Trash item not found', 404);
  }

  const snapshot = (row.storySnapshot || {}) as Record<string, unknown>;
  const storyId = typeof snapshot.id === 'string' ? snapshot.id : undefined;

  const existing = storyId
    ? await prisma.story.findFirst({ where: { id: storyId, userId: req.auth!.userId } })
    : null;

  const payload = {
    title: typeof snapshot.title === 'string' ? snapshot.title : 'Truyện mới',
    author: typeof snapshot.author === 'string' ? snapshot.author : 'Ẩn danh',
    genre: typeof snapshot.genre === 'string' ? snapshot.genre : 'Truyện audio',
    description: typeof snapshot.description === 'string' ? snapshot.description : '',
    chapterTitle: typeof snapshot.chapterTitle === 'string' ? snapshot.chapterTitle : 'Chương 1',
    visibility: toStoryVisibility(typeof snapshot.visibility === 'string' ? snapshot.visibility : undefined),
    audioStatus: toAudioStatus(typeof snapshot.audioStatus === 'string' ? snapshot.audioStatus : undefined),
    coverKey: typeof snapshot.coverKey === 'string' ? snapshot.coverKey : null,
    audioKey: row.audioKey,
    deletedAt: null as Date | null
  };

  if (existing) {
    await prisma.story.update({ where: { id: existing.id }, data: payload });
  } else {
    const createData: Record<string, unknown> = {
      userId: req.auth!.userId,
      ...payload
    };
    if (storyId) {
      createData.id = storyId;
    }

    await prisma.story.create({ data: createData as any });
  }

  await prisma.audioTrash.delete({ where: { audioKey: row.audioKey } });
  return ok(res, { restored: true });
});

router.delete('/:audioKey', async (req: AuthRequest, res) => {
  const row = await prisma.audioTrash.findFirst({
    where: { audioKey: req.params.audioKey, ownerUserId: req.auth!.userId }
  });
  if (!row) {
    return fail(res, 'Trash item not found', 404);
  }

  await removeMediaAssetFile(row.audioKey);
  await prisma.audioTrash.delete({ where: { audioKey: row.audioKey } });
  await prisma.mediaAsset.delete({ where: { key: row.audioKey } }).catch(function () { return null; });
  return ok(res, { deleted: true });
});

router.delete('/', async (req: AuthRequest, res) => {
  const rows = await prisma.audioTrash.findMany({ where: { ownerUserId: req.auth!.userId } });
  const keys = rows.map(function (row) { return row.audioKey; });

  await Promise.all(keys.map(function (key) { return removeMediaAssetFile(key); }));
  await prisma.audioTrash.deleteMany({ where: { ownerUserId: req.auth!.userId } });
  if (keys.length) {
    await prisma.mediaAsset.deleteMany({ where: { key: { in: keys } } });
  }

  return ok(res, { deleted: keys.length });
});

export default router;
