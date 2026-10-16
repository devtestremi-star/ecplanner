import {
  type Fight,
  REPORT_FIGHTS,
  ReportNotAccessibleError,
  ReportSchema,
  WclGraphQLError,
  type WclClient,
} from '@timeline/wcl';

/**
 * WCL signale un rapport absent ou privé par une erreur GraphQL, pas par un `report: null`.
 * Sans cette traduction, un code invalide remonte en 500 au lieu d'un refus explicite.
 */
const NOT_ACCESSIBLE = /does not exist|private|do not have permission|not authorized/i;

/**
 * Une run sans aucun boss tué n'a rien à montrer sur une timeline boss par boss (§1).
 * On la refuse APRÈS la requête `fights` (1 point) mais AVANT celle des events (~4),
 * puisqu'un rapport de session contient beaucoup de tentatives avortées : sur le second
 * témoin, 11 fights sur 20 sont dans ce cas.
 */
export class NoBossPullError extends Error {
  override readonly name = 'NoBossPullError';
  constructor(readonly reportCode: string, readonly fightID: number, readonly durationSec: number) {
    super(
      `Fight ${fightID} of ${reportCode} contains no boss encounter ` +
        `(${durationSec.toFixed(0)}s, abandoned attempt) - nothing to show.`,
    );
  }
}

export class NotAMythicPlusRunError extends Error {
  override readonly name = 'NotAMythicPlusRunError';
  constructor(readonly reportCode: string, readonly fightID: number | 'last') {
    super(
      `Fight ${fightID} of ${reportCode} has no keystoneLevel - it is not an M+ run. ` +
        `An existing fight is not enough: a report can mix raid, trash and M+.`,
    );
  }
}

/**
 * Aucun joueur du rapport n'a d'informations de combattant (`CombatantInfo`) : log lancé
 * sans la journalisation avancée, ou démarré en cours de run. Sans elles, ni spé ni
 * talents — pas de pistes de joueurs, pas d'alignement, pas d'export ECP. Permanent.
 */
export class NoCombatantInfoError extends Error {
  override readonly name = 'NoCombatantInfoError';
  constructor(readonly reportCode: string, readonly fightID: number) {
    super("This report can't be used");
  }
}

export interface ResolvedRun {
  reportCode: string;
  fight: Fight;
  /** Timestamp ABSOLU de départ de la run. Seul ancrage du système (plan §2.3). */
  startedAt: Date;
  /** `dungeonPulls` à `encounterID !== 0`, dans l'ordre. L'index EST l'orderIndex. */
  bosses: Array<{ orderIndex: number; pullId: number; encounterID: number; name: string; startTime: number; endTime: number }>;
  zoneId: number;
  gameZoneId: number;
}

/**
 * Étage 2 de la validation (plan §4.7) : une requête `fights`, ~1 point.
 * Établit que le rapport est accessible, que le fight existe, et que c'est bien une run M+.
 */
export async function resolveRun(
  client: WclClient,
  reportCode: string,
  fightID: number | 'last',
): Promise<ResolvedRun> {
  let raw: unknown;
  try {
    const res = await client.query<{ reportData: { report: unknown } }>(REPORT_FIGHTS, { code: reportCode });
    raw = res.data.reportData.report;
  } catch (err) {
    if (err instanceof WclGraphQLError && NOT_ACCESSIBLE.test(JSON.stringify(err.errors))) {
      throw new ReportNotAccessibleError(reportCode);
    }
    throw err;
  }
  if (!raw) throw new ReportNotAccessibleError(reportCode);

  const report = ReportSchema.parse(raw);

  // `fight=last` se résout sur le dernier fight PORTANT UN KEYSTONE, pas le dernier tout
  // court — sinon on tombe sur un pull de trash de fin de session.
  const fight =
    fightID === 'last'
      ? [...report.fights].reverse().find((f) => f.keystoneLevel != null)
      : report.fights.find((f) => f.id === fightID);

  if (!fight || fight.keystoneLevel == null) throw new NotAMythicPlusRunError(reportCode, fightID);

  const gameZoneId = fight.gameZone?.id;
  if (!gameZoneId) {
    throw new Error(`fight ${fight.id} sans gameZone — impossible d'identifier le donjon de façon stable`);
  }

  const bosses = (fight.dungeonPulls ?? [])
    .filter((p) => p.encounterID !== 0)
    .map((p, i) => ({
      orderIndex: i, // ⚠️ la position, pas `pull.id` — celui-ci a des trous
      pullId: p.id,
      encounterID: p.encounterID,
      name: p.name,
      startTime: p.startTime,
      endTime: p.endTime,
    }));

  if (bosses.length === 0) {
    throw new NoBossPullError(reportCode, fight.id, (fight.endTime - fight.startTime) / 1000);
  }

  return {
    reportCode,
    fight,
    startedAt: new Date(report.startTime + fight.startTime),
    bosses,
    zoneId: report.zone?.id ?? 0,
    gameZoneId,
  };
}
