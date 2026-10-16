import {
  DriverException,
  ForeignKeyConstraintViolationException,
  NotNullConstraintViolationException,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

/**
 * Une violation de contrainte est une erreur d'utilisateur, pas une panne.
 *
 * Sans ce filtre, ajouter deux fois la même spec à un sort rend « Internal server error » —
 * l'admin affiche alors un mur là où il devrait dire ce qui cloche.
 */
@Catch(DriverException)
export class DbExceptionFilter implements ExceptionFilter {
  catch(err: DriverException, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const { status, message } = translate(err);
    void reply.status(status).send({ statusCode: status, error: HttpStatus[status], message });
  }
}

function translate(err: DriverException): { status: number; message: string } {
  if (err instanceof UniqueConstraintViolationException) {
    return { status: HttpStatus.CONFLICT, message: `Cette valeur existe déjà : ${detail(err)}` };
  }
  if (err instanceof ForeignKeyConstraintViolationException) {
    return {
      status: HttpStatus.CONFLICT,
      message: `Ligne référencée ailleurs, ou référence inexistante : ${detail(err)}`,
    };
  }
  if (err instanceof NotNullConstraintViolationException) {
    return { status: HttpStatus.BAD_REQUEST, message: `Champ obligatoire non renseigné : ${detail(err)}` };
  }
  return { status: HttpStatus.BAD_REQUEST, message: detail(err) };
}

/** Postgres met l'essentiel dans `detail` (« Key (spell_id, spec_id)=(…) exists »). */
function detail(err: DriverException): string {
  const pg = err as DriverException & { detail?: string; constraint?: string };
  return pg.detail ?? pg.constraint ?? err.message;
}

/** Les `HttpException` levées volontairement passent avant ce filtre, jamais après. */
export const isHttpException = (err: unknown): err is HttpException => err instanceof HttpException;
