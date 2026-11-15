import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Actor, Role } from '../domain/types';
import { ForbiddenError, type AuthService } from '../services/authService';

declare module 'express-serve-static-core' {
  interface Request {
    actor?: Actor;
  }
}

/** Requires a valid Bearer token; attaches the (freshly re-checked) user as req.actor. */
export function requireAuth(auth: AuthService): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    req.actor = await auth.authenticate(token);
    next();
  };
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.actor || !roles.includes(req.actor.role)) throw new ForbiddenError();
    next();
  };
}

/** The authenticated actor (routes behind requireAuth only). */
export function actorOf(req: Request): Actor {
  if (!req.actor) throw new Error('actorOf() used on an unauthenticated route');
  return req.actor;
}
