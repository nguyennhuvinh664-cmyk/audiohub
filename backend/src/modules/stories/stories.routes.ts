import { AudioStatus, StoryVisibility } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { fail, ok } from '../../shared/http/response.js';
import { requireAuth, type AuthRequest } from '../../shared/middleware/auth.js';

const router = Router();

function normalizeText(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function parseVisibility(value: unknown, fallback: StoryVisibility = StoryVisibility.PRIVATE) {
  const raw = String(value || '').trim();
  const normalized = normalizeText(value);
  if (raw === 'PUBLIC' || normalized === 'cong khai' || normalized === 'public') return StoryVisibility.PUBLIC;
  if (raw === 'UNLISTED' || normalized === 'khong cong khai' || normalized === 'unlisted') return StoryVisibility.UNLISTED;
  if (raw === 'PRIVATE' || normalized === 'rieng tu' || normalized === 'private') return StoryVisibility.PRIVATE;
  return fallback;
}

function parseAudioStatus(value: unknown, fallback: AudioStatus = AudioStatus.READY) {
  const raw = String(value || '').trim();
  const normalized = normalizeText(value);
  if (raw === 'READY' || normalized === 'san sang' || normalized === 'ready') return AudioStatus.READY;
  if (raw === 'PROCESSING' || normalized === 'dang xu ly' || normalized === 'processing') return AudioStatus.PROCESSING;
  if (raw === 'HIDDEN' || normalized === 'tam an' || normalized === 'hidden') return AudioStatus.HIDDEN;
  return fallback;
}

function parseCompletedStatus(value: unknown, fallback = '') {
  const raw = String(value || '').trim();
  const normalized = normalizeText(value);
  if (!raw) return fallback;
  if (normalized === 'da hoan thanh' || normalized === 'hoan thanh' || normalized === 'completed' || normalized === 'full') {
    return 'Đã hoàn thành';
  }
  if (normalized === 'dang ra' || normalized === 'ongoing') {
    return 'Đang ra';
  }
  return raw;
}

function parseIsCompleted(value: unknown, status: string, fallback = false) {
  if (typeof value === 'boolean') return value;
  const normalized = normalizeText(status);
  if (normalized === 'da hoan thanh' || normalized === 'hoan thanh' || normalized === 'completed' || normalized === 'full') {
    return true;
  }
  if (normalized === 'dang ra' || normalized === 'ongoing') {
    return false;
  }
  return fallback;
}

const audioStatusMap: Record<string, AudioStatus> = {
  'Sẵn sàng': AudioStatus.READY,
  'Đang xử lý': AudioStatus.PROCESSING,
  'Tạm ẩn': AudioStatus.HIDDEN
};

function toUiVisibility(value: StoryVisibility) {
  if (value === StoryVisibility.PUBLIC) return 'Công khai';
  if (value === StoryVisibility.UNLISTED) return 'Không công khai';
  return 'Riêng tư';
}

function toUiAudioStatus(value: AudioStatus) {
  if (value === AudioStatus.PROCESSING) return 'Đang xử lý';
  if (value === AudioStatus.HIDDEN) return 'Tạm ẩn';
  return 'Sẵn sàng';
}

function extractYoutubeId(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const direct = raw.match(/^[a-zA-Z0-9_-]{11}$/);
  if (direct) return direct[0];
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match && match[1]) return match[1];
  }
  return '';
}

const createSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  genre: z.string().min(1).default('Truyện audio'),
  description: z.string().optional().default(''),
  readingText: z.string().optional().default(''),
  chapterTitle: z.string().optional().default('Chương 1'),
  chapters: z.string().optional().default('[]'),
  chapterCount: z.number().int().optional().default(0),
  visibility: z.string().optional().default('Riêng tư'),
  audioStatus: z.string().optional().default('Sẵn sàng'),
  status: z.string().optional().default(''),
  isCompleted: z.boolean().optional().default(false),
  coverKey: z.string().nullable().optional(),
  audioKey: z.string().nullable().optional(),
  youtubeUrl: z.string().nullable().optional(),
  youtubeId: z.string().nullable().optional()
});

function parseTime(value: Date | string | null | undefined) {
  var time = Date.parse(String(value || ''));
  return isNaN(time) ? 0 : time;
}

async function getStoryMetrics(storyId: string) {
  var now = Date.now();
  var twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);
  var sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const listenCount = await prisma.storyListenEvent.count({ where: { storyId } });
  const listenCount2d = await prisma.storyListenEvent.count({ where: { storyId, createdAt: { gte: twoDaysAgo } } });
  const listenCount7d = await prisma.storyListenEvent.count({ where: { storyId, createdAt: { gte: sevenDaysAgo } } });

  return { listenCount, listenCount2d, listenCount7d };
}

async function toStoryResponse(story: any) {
  const metrics = await getStoryMetrics(String(story.id));
  return {
    id: story.id,
    title: story.title,
    author: story.author,
    genre: story.genre,
    description: story.description,
    readingText: story.readingText,
    chapterTitle: story.chapterTitle,
    visibility: toUiVisibility(story.visibility),
    audioStatus: toUiAudioStatus(story.audioStatus),
    status: story.status || '',
    isCompleted: !!story.isCompleted,
    coverKey: story.coverKey,
    audioKey: story.audioKey,
    youtubeUrl: story.youtubeUrl || '',
    youtubeId: story.youtubeId || '',
    listenCount: metrics.listenCount,
    listenCount2d: metrics.listenCount2d,
    listenCount7d: metrics.listenCount7d,
    chapters: (() => { try { return JSON.parse(String((story as any).chapters || '[]')); } catch (e) { return []; } })(),
    chapterCount: (story as any).chapterCount || 0,
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
    sortTime: parseTime(story.updatedAt || story.createdAt)
  };
}

function sortByRecent(a: any, b: any) {
  return Number(b.sortTime || 0) - Number(a.sortTime || 0);
}

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  author: z.string().min(1).optional(),
  genre: z.string().min(1).optional(),
  description: z.string().optional(),
  readingText: z.string().optional(),
  chapterTitle: z.string().optional(),
  chapters: z.string().optional(),
  chapterCount: z.number().int().optional(),
  visibility: z.string().optional(),
  audioStatus: z.string().optional(),
  status: z.string().optional(),
  isCompleted: z.boolean().optional(),
  coverKey: z.string().nullable().optional(),
  audioKey: z.string().nullable().optional(),
  youtubeUrl: z.string().nullable().optional(),
  youtubeId: z.string().nullable().optional()
});

router.get('/public', async (_req, res) => {
  const stories = await prisma.story.findMany({
    where: { visibility: StoryVisibility.PUBLIC, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    take: 100
  });

  const mapped = await Promise.all(stories.map(toStoryResponse));
  mapped.sort(sortByRecent);
  return ok(res, mapped);
});

router.use(requireAuth);

router.post('/', async (req: AuthRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Invalid payload', 400);
  }

  const userId = req.auth!.userId;
  const body = parsed.data;

  const recentBoundary = new Date(Date.now() - 15000);
  const duplicatedRecent = await prisma.story.findFirst({
    where: {
      userId,
      deletedAt: null,
      title: body.title,
      author: body.author,
      chapterTitle: body.chapterTitle,
      createdAt: { gte: recentBoundary }
    },
    orderBy: { createdAt: 'desc' }
  });

  if (duplicatedRecent) {
    return ok(res, await toStoryResponse(duplicatedRecent), 200);
  }

  const youtubeUrl = body.youtubeUrl === undefined || body.youtubeUrl === null ? null : String(body.youtubeUrl).trim();
  const youtubeId = body.youtubeId === undefined || body.youtubeId === null
    ? extractYoutubeId(youtubeUrl || '') || null
    : (extractYoutubeId(body.youtubeId) || extractYoutubeId(youtubeUrl || '') || null);

  const story = await prisma.story.create({
    data: {
      userId,
      title: body.title,
      author: body.author,
      genre: body.genre,
      description: body.description,
      readingText: body.readingText,
      chapterTitle: body.chapterTitle,
      chapters: body.chapters || '[]',
      chapterCount: body.chapterCount || 0,
      visibility: parseVisibility(body.visibility, StoryVisibility.PRIVATE),
      audioStatus: parseAudioStatus(body.audioStatus, AudioStatus.READY),
      status: parseCompletedStatus(body.status, ''),
      isCompleted: parseIsCompleted(body.isCompleted, String(body.status || ''), false),
      coverKey: body.coverKey === undefined ? null : body.coverKey,
      audioKey: body.audioKey === undefined ? null : body.audioKey,
      youtubeUrl,
      youtubeId
    }
  }).catch(async (err: any) => {
    // If chapters column doesn't exist yet, retry without it
    if (String(err?.message || '').includes('chapters') || String(err?.message || '').includes('chapter_count')) {
      console.warn('[StoryCreate] chapters column missing, retrying without it');
      return prisma.story.create({
        data: {
          userId,
          title: body.title,
          author: body.author,
          genre: body.genre,
          description: body.description,
          readingText: body.readingText,
          chapterTitle: body.chapterTitle,
          visibility: parseVisibility(body.visibility, StoryVisibility.PRIVATE),
          audioStatus: parseAudioStatus(body.audioStatus, AudioStatus.READY),
          status: parseCompletedStatus(body.status, ''),
          isCompleted: parseIsCompleted(body.isCompleted, String(body.status || ''), false),
          coverKey: body.coverKey === undefined ? null : body.coverKey,
          audioKey: body.audioKey === undefined ? null : body.audioKey,
          youtubeUrl,
          youtubeId
        }
      });
    }
    throw err;
  });

  return ok(res, await toStoryResponse(story), 201);
});

router.get('/', async (req: AuthRequest, res) => {
  const stories = await prisma.story.findMany({
    where: { userId: req.auth!.userId, deletedAt: null },
    orderBy: { updatedAt: 'desc' }
  });

  const mapped = await Promise.all(stories.map(toStoryResponse));
  mapped.sort(sortByRecent);
  return ok(res, mapped);
});

router.get('/:id', async (req: AuthRequest, res) => {
  const story = await prisma.story.findFirst({
    where: { id: req.params.id, userId: req.auth!.userId, deletedAt: null }
  });

  if (!story) {
    return fail(res, 'Story not found', 404);
  }

  return ok(res, await toStoryResponse(story));
});

router.put('/:id', async (req: AuthRequest, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Invalid payload', 400);
  }

  const existing = await prisma.story.findFirst({
    where: { id: req.params.id, userId: req.auth!.userId, deletedAt: null }
  });
  if (!existing) {
    return fail(res, 'Story not found', 404);
  }

  const body = parsed.data;

  const nextYoutubeUrl = body.youtubeUrl === undefined
    ? existing.youtubeUrl
    : (body.youtubeUrl === null ? null : String(body.youtubeUrl).trim());
  const nextYoutubeId = body.youtubeId === undefined
    ? (extractYoutubeId(nextYoutubeUrl || '') || existing.youtubeId)
    : (body.youtubeId === null ? null : (extractYoutubeId(body.youtubeId) || extractYoutubeId(nextYoutubeUrl || '') || null));

  const updated = await prisma.story.update({
    where: { id: existing.id },
    data: {
      title: body.title ?? existing.title,
      author: body.author ?? existing.author,
      genre: body.genre ?? existing.genre,
      description: body.description ?? existing.description,
      readingText: body.readingText ?? existing.readingText,
      chapterTitle: body.chapterTitle ?? existing.chapterTitle,
      chapters: body.chapters ?? (existing as any).chapters ?? '[]',
      chapterCount: body.chapterCount ?? (existing as any).chapterCount ?? 0,
      visibility: body.visibility === undefined ? existing.visibility : parseVisibility(body.visibility, existing.visibility),
      audioStatus: body.audioStatus === undefined ? existing.audioStatus : parseAudioStatus(body.audioStatus, existing.audioStatus),
      status: body.status === undefined ? existing.status : parseCompletedStatus(body.status, existing.status || ''),
      isCompleted: body.isCompleted === undefined
        ? parseIsCompleted(undefined, body.status === undefined ? String(existing.status || '') : String(body.status || ''), !!existing.isCompleted)
        : parseIsCompleted(body.isCompleted, body.status === undefined ? String(existing.status || '') : String(body.status || ''), !!existing.isCompleted),
      coverKey: body.coverKey === undefined ? existing.coverKey : body.coverKey,
      audioKey: body.audioKey === undefined ? existing.audioKey : body.audioKey,
      youtubeUrl: nextYoutubeUrl,
      youtubeId: nextYoutubeId
    }
  }).catch(async (err: any) => {
    if (String(err?.message || '').includes('chapters') || String(err?.message || '').includes('chapter_count')) {
      console.warn('[StoryUpdate] chapters column missing, retrying without it');
      return prisma.story.update({
        where: { id: existing.id },
        data: {
          title: body.title ?? existing.title,
          author: body.author ?? existing.author,
          genre: body.genre ?? existing.genre,
          description: body.description ?? existing.description,
          readingText: body.readingText ?? existing.readingText,
          chapterTitle: body.chapterTitle ?? existing.chapterTitle,
          visibility: body.visibility === undefined ? existing.visibility : parseVisibility(body.visibility, existing.visibility),
          audioStatus: body.audioStatus === undefined ? existing.audioStatus : parseAudioStatus(body.audioStatus, existing.audioStatus),
          status: body.status === undefined ? existing.status : parseCompletedStatus(body.status, existing.status || ''),
          isCompleted: body.isCompleted === undefined
            ? parseIsCompleted(undefined, body.status === undefined ? String(existing.status || '') : String(body.status || ''), !!existing.isCompleted)
            : parseIsCompleted(body.isCompleted, body.status === undefined ? String(existing.status || '') : String(body.status || ''), !!existing.isCompleted),
          coverKey: body.coverKey === undefined ? existing.coverKey : body.coverKey,
          audioKey: body.audioKey === undefined ? existing.audioKey : body.audioKey,
          youtubeUrl: nextYoutubeUrl,
          youtubeId: nextYoutubeId
        }
      });
    }
    throw err;
  });

  return ok(res, await toStoryResponse(updated));
});

router.patch('/:id', async (req: AuthRequest, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Invalid payload', 400);
  }

  const existing = await prisma.story.findFirst({
    where: { id: req.params.id, userId: req.auth!.userId, deletedAt: null }
  });
  if (!existing) {
    return fail(res, 'Story not found', 404);
  }

  const body = parsed.data;

  const nextYoutubeUrl = body.youtubeUrl === undefined
    ? existing.youtubeUrl
    : (body.youtubeUrl === null ? null : String(body.youtubeUrl).trim());
  const nextYoutubeId = body.youtubeId === undefined
    ? (extractYoutubeId(nextYoutubeUrl || '') || existing.youtubeId)
    : (body.youtubeId === null ? null : (extractYoutubeId(body.youtubeId) || extractYoutubeId(nextYoutubeUrl || '') || null));

  const updated = await prisma.story.update({
    where: { id: existing.id },
    data: {
      title: body.title ?? existing.title,
      author: body.author ?? existing.author,
      genre: body.genre ?? existing.genre,
      description: body.description ?? existing.description,
      readingText: body.readingText ?? existing.readingText,
      chapterTitle: body.chapterTitle ?? existing.chapterTitle,
      chapters: body.chapters ?? (existing as any).chapters ?? '[]',
      chapterCount: body.chapterCount ?? (existing as any).chapterCount ?? 0,
      visibility: body.visibility === undefined ? existing.visibility : parseVisibility(body.visibility, existing.visibility),
      audioStatus: body.audioStatus === undefined ? existing.audioStatus : parseAudioStatus(body.audioStatus, existing.audioStatus),
      status: body.status === undefined ? existing.status : parseCompletedStatus(body.status, existing.status || ''),
      isCompleted: body.isCompleted === undefined
        ? parseIsCompleted(undefined, body.status === undefined ? String(existing.status || '') : String(body.status || ''), !!existing.isCompleted)
        : parseIsCompleted(body.isCompleted, body.status === undefined ? String(existing.status || '') : String(body.status || ''), !!existing.isCompleted),
      coverKey: body.coverKey === undefined ? existing.coverKey : body.coverKey,
      audioKey: body.audioKey === undefined ? existing.audioKey : body.audioKey,
      youtubeUrl: nextYoutubeUrl,
      youtubeId: nextYoutubeId
    }
  }).catch(async (err: any) => {
    if (String(err?.message || '').includes('chapters') || String(err?.message || '').includes('chapter_count')) {
      console.warn('[StoryUpdate] chapters column missing, retrying without it');
      return prisma.story.update({
        where: { id: existing.id },
        data: {
          title: body.title ?? existing.title,
          author: body.author ?? existing.author,
          genre: body.genre ?? existing.genre,
          description: body.description ?? existing.description,
          readingText: body.readingText ?? existing.readingText,
          chapterTitle: body.chapterTitle ?? existing.chapterTitle,
          visibility: body.visibility === undefined ? existing.visibility : parseVisibility(body.visibility, existing.visibility),
          audioStatus: body.audioStatus === undefined ? existing.audioStatus : parseAudioStatus(body.audioStatus, existing.audioStatus),
          status: body.status === undefined ? existing.status : parseCompletedStatus(body.status, existing.status || ''),
          isCompleted: body.isCompleted === undefined
            ? parseIsCompleted(undefined, body.status === undefined ? String(existing.status || '') : String(body.status || ''), !!existing.isCompleted)
            : parseIsCompleted(body.isCompleted, body.status === undefined ? String(existing.status || '') : String(body.status || ''), !!existing.isCompleted),
          coverKey: body.coverKey === undefined ? existing.coverKey : body.coverKey,
          audioKey: body.audioKey === undefined ? existing.audioKey : body.audioKey,
          youtubeUrl: nextYoutubeUrl,
          youtubeId: nextYoutubeId
        }
      });
    }
    throw err;
  });

  return ok(res, await toStoryResponse(updated));
});

router.post('/:id/listen', async (req: AuthRequest, res) => {
  const story = await prisma.story.findFirst({
    where: { id: req.params.id, userId: req.auth!.userId, deletedAt: null }
  });

  if (!story) {
    return fail(res, 'Story not found', 404);
  }

  await prisma.storyListenEvent.create({
    data: {
      storyId: story.id,
      userId: req.auth!.userId
    }
  });

  const metrics = await getStoryMetrics(story.id);
  return ok(res, {
    storyId: story.id,
    listenCount: metrics.listenCount,
    listenCount2d: metrics.listenCount2d,
    listenCount7d: metrics.listenCount7d
  });
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const story = await prisma.story.findFirst({
    where: { id: req.params.id, userId: req.auth!.userId, deletedAt: null }
  });
  if (!story) {
    return fail(res, 'Story not found', 404);
  }

  if (story.audioKey) {
    const asset = await prisma.mediaAsset.findFirst({ where: { key: story.audioKey, ownerUserId: req.auth!.userId } });
    if (asset) {
      const snapshot = {
        id: story.id,
        title: story.title,
        author: story.author,
        genre: story.genre,
        description: story.description,
        chapterTitle: story.chapterTitle,
        visibility: toUiVisibility(story.visibility),
        audioStatus: toUiAudioStatus(story.audioStatus),
        coverKey: story.coverKey,
        youtubeUrl: story.youtubeUrl,
        youtubeId: story.youtubeId,
        createdAt: story.createdAt
      };

      await prisma.audioTrash.upsert({
        where: { audioKey: story.audioKey },
        update: { storySnapshot: snapshot, deletedAt: new Date() },
        create: {
          audioKey: story.audioKey,
          ownerUserId: req.auth!.userId,
          storySnapshot: snapshot
        }
      });
    }
  }

  await prisma.story.update({ where: { id: story.id }, data: { deletedAt: new Date() } });

  return ok(res, { deleted: true });
});

export default router;
