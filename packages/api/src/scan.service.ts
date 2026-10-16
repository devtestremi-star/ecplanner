import { EntityManager, MikroORM } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { ScannedRun } from '@timeline/db';
import { scanRun, type ScanResult } from '@timeline/scanner';
import { WclClient } from '@timeline/wcl';

@Injectable()
export class ScanService {
  private readonly log = new Logger(ScanService.name);
  private readonly client: WclClient;

  /**
   * Déduplication in-flight (plan §4.6, protection 2). Sans file, deux requêtes
   * simultanées sur la même run lanceraient deux scans et paieraient deux fois.
   * Une map de promesses suffit tant qu'il n'y a qu'un process.
   */
  private readonly inFlight = new Map<string, Promise<ScanResult>>();

  constructor(private readonly orm: MikroORM) {
    const clientId = process.env.WCL_CLIENT_ID;
    const clientSecret = process.env.WCL_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('WCL_CLIENT_ID / WCL_CLIENT_SECRET absents');
    this.client = new WclClient({
      credentials: { clientId, clientSecret },
      onRateLimit: (r) =>
        this.log.warn(`budget WCL à ${((r.pointsSpentThisHour / r.limitPerHour) * 100).toFixed(0)}%`),
    });
  }

  /** Une run terminée est immuable : c'est le seul endroit où le cache est trivialement correct. */
  async findScanned(reportCode: string, fightID: number): Promise<ScannedRun | null> {
    return this.orm.em.fork().findOne(ScannedRun, { reportCode, fightID });
  }

  async scan(reportCode: string, fight: number | 'last', force = false): Promise<ScanResult> {
    // `force` fait partie de la clé : sans ça, une demande de re-scan arrivant pendant
    // une requête normale récupérerait sa réponse de cache et ne re-scannerait jamais.
    const key = `${reportCode}-${fight}${force ? ':force' : ''}`;
    const running = this.inFlight.get(key);
    if (running) {
      this.log.log(`${key} déjà en cours — la requête s'y raccroche`);
      return running;
    }

    const task = this.run(reportCode, fight, force).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, task);
    return task;
  }

  private async run(reportCode: string, fight: number | 'last', force: boolean): Promise<ScanResult> {
    if (force) this.log.log(`${reportCode}-${fight} : re-scan forcé, le cache est ignoré`);
    // EntityManager forké : le scan écrit hors du contexte d'une requête HTTP.
    const em: EntityManager = this.orm.em.fork();

    if (!force && typeof fight === 'number') {
      const existing = await em.findOne(ScannedRun, { reportCode, fightID: fight }, { populate: ['bosses'] });
      if (existing) {
        this.log.log(`${reportCode}-${fight} servi depuis le cache`);
        // Rendre les compteurs RÉELS : annoncer 0 cast sur une run qui en contient 151
        // ferait passer un cache pour un scan vide.
        return {
          reportCode,
          fightID: fight,
          bosses: existing.bosses.length,
          participants: existing.participants.length,
          eventsStored: existing.bosses.getItems().reduce((n, b) => n + b.events.length, 0),
          eventsDropped: 0,
          pointsSpent: 0,
          warnings: ['déjà scanné — servi depuis la base, aucun point consommé'],
        };
      }
    }

    const t0 = Date.now();
    const res = await scanRun(em, this.client, reportCode, fight);
    this.log.log(`${res.reportCode}-${res.fightID} scanné en ${Date.now() - t0}ms, ${res.pointsSpent ?? '?'} pts`);
    return res;
  }
}
