import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { fail } from '../http/response.js';

export type AuthPayload = {
  userId: string;
  email: string;
};

export type AuthRequest = Request & {
  auth?: AuthPayload;
};

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return fail(res, 'Unauthorized', 401);
  }

  const token = header.slice('Bearer '.length);
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    req.auth = decoded;
    return next();
  } catch {
    return fail(res, 'Unauthorized', 401);
  }
}
