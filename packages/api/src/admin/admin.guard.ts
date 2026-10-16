import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { bearerMatches, isDeployed } from '../auth.js';

/**
 * L'admin écrit dans les 9 tables : en ligne, sans garde, n'importe qui viderait la base.
 *
 * `ADMIN_TOKEN` absent : ouvert en local pour ne pas gêner le dev, FERMÉ une fois déployé —
 * un oubli de configuration doit verrouiller, pas exposer.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const token = process.env.ADMIN_TOKEN;
    if (!token) {
      if (isDeployed()) throw new ForbiddenException('Admin disabled: ADMIN_TOKEN is not configured');
      return true;
    }
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (!bearerMatches(req.headers.authorization, token)) throw new UnauthorizedException('Admin token required');
    return true;
  }
}
