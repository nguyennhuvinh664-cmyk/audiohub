import cron from 'node-cron';
import { promises as fs } from 'node:fs';
import { Router } from 'express';
import { prisma } from '../../config/prisma.js';
import { fail, ok } from '../../shared/http/response.js';
import { requireAuth, type AuthRequest } from '../../shared/middleware/auth.js';

const router = Router();
const RETENTION_DAYS = 7;

async function removeFilesByKeys(keys: string[]) {
  if (!keys.length) {
    return;
  }
  const assets = await prisma.mediaAsset.findMany({ where: { key: { in: keys } }, select: { storagePath: true } });
  await Promise.all(assets.map(function (asset: any) {
    return asset && asset.storagePath ? fs.unlink(asset.storagePath).catch(function () { return null; }) : Promise.resolve(null);
  }));
}

async function cleanupOldTrash() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const oldRows = await prisma.audioTrash.findMany({ where: { deletedAt: { lt: cutoff } } });
  const keys = oldRows.map(function (row: any) { return row.audioKey; });

  if (!keys.length) {
    return 0;
  }

  await removeFilesByKeys(keys);
  await prisma.audioTrash.deleteMany({ where: { audioKey: { in: keys } } });
  await prisma.mediaAsset.deleteMany({ where: { key: { in: keys } } });
  return keys.length;
}

export function startMaintenanceCron() {
  cron.schedule('17 * * * *', function () {
    cleanupOldTrash().catch(function () { return 0; });
  });
}

router.use(requireAuth);

router.post('/cleanup-orphans', async (req: AuthRequest, res) => {
  const userId = req.auth!.userId;

  const stories = await prisma.story.findMany({ where: { userId, deletedAt: null }, select: { coverKey: true, audioKey: true } });
  const trash = await prisma.audioTrash.findMany({ where: { ownerUserId: userId }, select: { audioKey: true, storySnapshot: true } });

  const usedKeys = new Set<string>();
  stories.forEach(function (story: any) {
    if (story.coverKey) usedKeys.add(story.coverKey);
    if (story.audioKey) usedKeys.add(story.audioKey);
  });

  trash.forEach(function (row: any) {
    usedKeys.add(row.audioKey);
    var snapshot = (row.storySnapshot || {}) as Record<string, unknown>;
    var coverKey = typeof snapshot.coverKey === 'string' ? snapshot.coverKey : '';
    if (coverKey) usedKeys.add(coverKey);
  });

  const allMedia = await prisma.mediaAsset.findMany({ where: { ownerUserId: userId } });
  const orphanKeys = allMedia.map(function (item: any) { return item.key; }).filter(function (key: string) { return !usedKeys.has(key); });

  if (!orphanKeys.length) {
    return ok(res, { removed: 0 });
  }

  await removeFilesByKeys(orphanKeys);
  await prisma.mediaAsset.deleteMany({ where: { key: { in: orphanKeys } } });
  return ok(res, { removed: orphanKeys.length });
});

router.post('/cleanup-retention', async (_req: AuthRequest, res) => {
  try {
    const removed = await cleanupOldTrash();
    return ok(res, { removed });
  } catch {
    return fail(res, 'Cleanup failed', 500);
  }
});

export default router;
