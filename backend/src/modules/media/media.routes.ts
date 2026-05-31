import { MediaKind } from '@prisma/client';
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { fail, ok } from '../../shared/http/response.js';
import { requireAuth, type AuthRequest } from '../../shared/middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

function makeKey(prefix: 'c' | 'a') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function saveFile(kind: 'covers' | 'audio', key: string, file: Express.Multer.File) {
  const ext = path.extname(file.originalname || '') || '';
  const dir = path.resolve(process.cwd(), env.STORAGE_ROOT, kind);
  await fs.mkdir(dir, { recursive: true });
  const diskName = `${key}${ext}`;
  const abs = path.join(dir, diskName);
  await fs.writeFile(abs, file.buffer);
  return abs;
}

router.use(requireAuth);

router.post('/stories/:id/cover', upload.single('cover'), async (req: AuthRequest, res) => {
  if (!req.file) {
    return fail(res, 'Missing cover file', 400);
  }

  const story = await prisma.story.findFirst({ where: { id: req.params.id, userId: req.auth!.userId, deletedAt: null } });
  if (!story) {
    return fail(res, 'Story not found', 404);
  }

  const key = makeKey('c');
  const storagePath = await saveFile('covers', key, req.file);

  await prisma.mediaAsset.create({
    data: {
      key,
      ownerUserId: req.auth!.userId,
      kind: MediaKind.COVER,
      mimeType: req.file.mimetype || 'application/octet-stream',
      sizeBytes: req.file.size,
      storagePath
    }
  });

  await prisma.story.update({ where: { id: story.id }, data: { coverKey: key } });

  return ok(res, { coverKey: key }, 201);
});

router.post('/stories/:id/audio', upload.single('audio'), async (req: AuthRequest, res) => {
  if (!req.file) {
    return fail(res, 'Missing audio file', 400);
  }

  const story = await prisma.story.findFirst({ where: { id: req.params.id, userId: req.auth!.userId, deletedAt: null } });
  if (!story) {
    return fail(res, 'Story not found', 404);
  }

  const key = makeKey('a');
  const storagePath = await saveFile('audio', key, req.file);

  await prisma.mediaAsset.create({
    data: {
      key,
      ownerUserId: req.auth!.userId,
      kind: MediaKind.AUDIO,
      mimeType: req.file.mimetype || 'application/octet-stream',
      sizeBytes: req.file.size,
      storagePath
    }
  });

  await prisma.story.update({ where: { id: story.id }, data: { audioKey: key } });

  return ok(res, { audioKey: key }, 201);
});

router.get('/media/audio/:key', async (req: AuthRequest, res) => {
  const key = String(req.params.key || '');
  if (!key) {
    return fail(res, 'Missing audio key', 400);
  }

  const asset = await prisma.mediaAsset.findFirst({
    where: {
      key,
      ownerUserId: req.auth!.userId,
      kind: MediaKind.AUDIO
    }
  });

  if (!asset) {
    return fail(res, 'Audio not found', 404);
  }

  try {
    const buffer = await fs.readFile(asset.storagePath);
    res.setHeader('Content-Type', asset.mimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).send(buffer);
  } catch {
    return fail(res, 'Audio file is missing on storage', 404);
  }
});

export default router;
