import {
  Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, NotFoundException, Post, Req, Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { isDeployed } from '../auth.js';
import {
  authMode, issueToken, passwordMatches, readCookie, recordFailure, SESSION_COOKIE, sessionCookie,
  tokenValid, tooManyFailures,
} from './session.js';

/** Échec de connexion : un temps fixe, pour ne pas laisser enchaîner les essais au plus vite. */
const FAILURE_DELAY_MS = 1_000;

/**
 * IP du client. Sur Vercel, la fonction ne voit que le proxy : c'est `x-real-ip`, posé
 * (et écrasé) par Vercel, qui porte la vraie. En local, l'en-tête serait falsifiable,
 * on s'en tient à la connexion.
 */
function clientIp(req: FastifyRequest): string {
  const real = req.headers['x-real-ip'];
  return isDeployed() && typeof real === 'string' && real ? real : req.ip;
}

/**
 * Connexion à l'admin. HORS garde : c'est elle qui délivre la session.
 */
@Controller('admin/session')
export class SessionController {
  /** Le front s'en sert pour savoir s'il doit afficher le formulaire de connexion. */
  @Get()
  status(@Req() req: FastifyRequest): { mode: string; authenticated: boolean } {
    const mode = authMode();
    if (mode === 'disabled') throw new NotFoundException();
    const authenticated = mode === 'open' || tokenValid(readCookie(req.headers.cookie, SESSION_COOKIE));
    return { mode, authenticated };
  }

  @Post()
  @HttpCode(204)
  async login(
    @Body() body: { password?: unknown } | undefined,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<void> {
    if (authMode() !== 'password') throw new NotFoundException();
    const ip = clientIp(req);
    if (tooManyFailures(ip)) {
      throw new HttpException('Too many attempts, try again in 15 minutes', HttpStatus.TOO_MANY_REQUESTS);
    }
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!passwordMatches(password)) {
      recordFailure(ip);
      await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
      throw new UnauthorizedException('Wrong password');
    }
    void res.header('Set-Cookie', sessionCookie(issueToken()));
  }

  @Delete()
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: FastifyReply): void {
    void res.header('Set-Cookie', sessionCookie(null));
  }
}
