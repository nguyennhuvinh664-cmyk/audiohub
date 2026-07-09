import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { fail, ok } from '../../shared/http/response.js';

const router = Router();

router.post('/guest', async (req, res) => {
  try {
    const guestId = String(req.body?.guestId || '').trim();
    if (!guestId) {
      return fail(res, 'Missing guestId', 400);
    }

    const email = guestId + '@guest.audiohub.local';

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: await bcrypt.hash(guestId, 6),
          displayName: 'Guest',
        },
      });
    }

    const token = jwt.sign(
      { userId: user.id, email },
      env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    return ok(res, { token });
  } catch (error) {
    return fail(res, 'Guest registration failed', 500);
  }
});

export default router;
