import { EntityManager } from '@mikro-orm/postgresql';
import { Controller, ForbiddenException, Get, Headers, Logger, UnauthorizedException } from '@nestjs/common';
import { bearerMatches, isDeployed } from './auth.js';

/**
 * Seuil par défaut : ~27 000 runs à ~15 Ko sur disque tiennent dans 400 Mo, soit le quota
 * Neon Free (0,5 Go) moins 100 Mo de marge. Mesuré sur 6 runs — à réajuster avec plus de recul.
 */
const DEFAULT_MAX_RUNS = 27_000;

/**
 * Purge des runs les plus anciennes, appelée une fois par jour par le cron Vercel.
 *
 * Le déclencheur est un NOMBRE de runs, pas `pg_database_size()` : un DELETE ne rend pas
 * l'espace disque (Postgres le réutilise), donc la taille resterait au-dessus du seuil et
 * chaque cron re-purgerait la moitié de ce qui reste.
 *
 * Une run purgée n'est pas perdue : elle se re-scanne tant que le rapport existe sur WCL.
 */
@Controller('cron')
export class PurgeController {
  private readonly log = new Logger(PurgeController.name);

  constructor(private readonly em: EntityManager) {}

  @Get('purge')
  async purge(@Headers('authorization') authorization?: string): Promise<{ runs: number; max: number; deleted: number }> {
    // Vercel envoie `Authorization: Bearer $CRON_SECRET` sur chaque appel de cron.
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      if (isDeployed()) throw new ForbiddenException('CRON_SECRET is not configured');
    } else if (!bearerMatches(authorization, secret)) {
      throw new UnauthorizedException();
    }

    const max = Number(process.env.PURGE_MAX_RUNS) || DEFAULT_MAX_RUNS;
    const conn = this.em.getConnection();
    const [row] = await conn.execute<Array<{ n: string }>>('select count(*) as n from scanned_run');
    const runs = Number(row?.n ?? 0);
    if (runs <= max) return { runs, max, deleted: 0 };

    // La moitié la plus ancienne. `scanned_boss` suit par ON DELETE CASCADE.
    const toDelete = Math.floor(runs / 2);
    await conn.execute(
      `delete from scanned_run where (report_code, fight_id) in (
         select report_code, fight_id from scanned_run order by scanned_at asc limit ?
       )`,
      [toDelete],
    );
    this.log.warn(`purge : ${toDelete}/${runs} runs supprimées (seuil ${max})`);
    return { runs, max, deleted: toDelete };
  }
}
