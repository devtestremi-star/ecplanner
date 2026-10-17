import { type CanActivate, type ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { authMode, readCookie, SESSION_COOKIE, tokenValid } from './session.js';

/**
 * L'admin écrit dans les 9 tables : session exigée dès qu'un mot de passe est configuré.
 *
 * Sans `ADMIN_PASSWORD` / `ADMIN_SESSION_SECRET` : ouvert en local pour ne pas gêner le
 * dev, et 404 une fois déployé, comme si l'admin n'existait pas. Voir `session.ts`.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const mode = authMode();
    if (mode === 'disabled') throw new NotFoundException();
    if (mode === 'open') return true;
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (!tokenValid(readCookie(req.headers.cookie, SESSION_COOKIE))) throw new UnauthorizedException('Admin login required');
    return true;
  }
}
