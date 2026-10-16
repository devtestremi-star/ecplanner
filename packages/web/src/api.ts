export interface ScanResponse {
  reportCode: string;
  fightID: number;
  bosses: number;
  participants: number;
  eventsStored: number;
  eventsDropped: number;
  pointsSpent: number | null;
  warnings: string[];
}

export interface RunDetail {
  run: {
    reportCode: string;
    fightID: number;
    dungeon: { gameZoneId: number; name: string };
    season: string;
    keystoneLevel: number;
    keystoneBonus: number;
    kill: boolean;
    startedAt: string;
    duration: number;
  };
  participants: Array<{
    sourceID: number;
    role: 'tank' | 'healer' | 'dps' | null;
    guid: number;
    name: string;
    server: string;
    region: string;
    class: string | null;
    color: string | null;
    /** Nom de fichier Blizzard, à passer à `iconUrl` comme pour un sort. */
    classIcon: string | null;
    /** specID Blizzard — sert à résoudre la catégorie du sort selon le lanceur. */
    specId: number;
    spec: string | null;
    /** null tant que la spec n'est pas curée : afficher l'icône de classe seule. */
    specIcon: string | null;
  }>;
  bosses: Array<{
    orderIndex: number;
    encounterID: number;
    name: string;
    /** Position du boss dans la run, en ms depuis son début. */
    offsetRun: number;
    duration: number;
    casts: Array<{
      offsetBoss: number;
      /**
       * Instant du sort de boss auquel ce cast répond, ou `null` s'il n'en a aucun.
       *
       * En ms depuis le début de la fenêtre de boss, comme `offsetBoss` — malgré son nom,
       * ce n'est pas un timestamp absolu. Nomenclature reprise de l'addon ECP.
       *
       * S'AJOUTE à `offsetBoss`, ne le remplace pas : la bascule d'affichage a besoin des
       * deux, et l'instant réel reste la seule base valable pour tout calcul.
       */
      ecp_timestamp: number | null;
      offsetRun: number;
      sourceID: number;
      abilityGameID: number;
      /** 'applybuff' = cooldown activé sans incantation. */
      type: 'cast' | 'applybuff';
    }>;
  }>;
}

/** L'API renvoie `{ reason, message }` sur les refus attendus — on le remonte tel quel. */
export class ApiError extends Error {
  constructor(readonly reason: string, message: string) {
    super(message);
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const m = json['message'];
    throw new ApiError(
      String(json['reason'] ?? 'error'),
      typeof m === 'string' ? m : 'Le scan a échoué',
    );
  }
  return json as T;
}

export const scan = (url: string, force = false): Promise<ScanResponse> =>
  post<ScanResponse>('/api/scan', { url, force });

export async function fetchRun(reportCode: string, fightID: number): Promise<RunDetail> {
  const res = await fetch(`/api/runs/${reportCode}/${fightID}`);
  if (!res.ok) throw new ApiError('not-found', 'Run introuvable en base');
  return (await res.json()) as RunDetail;
}

/**
 * Récupère l'export ECP d'une run, prêt à coller dans l'addon.
 *
 * `encounterID` restreint le plan à un seul boss (`kind=boss`), qui ÉCRASE côté addon le
 * plan de ce boss dans la variante ouverte. Sans lui, c'est le donjon entier.
 *
 * Rend aussi l'empreinte que le serveur a calculée : elle permet de vérifier après coup
 * qu'aucun caractère n'a été mangé en chemin, ce que le `k;` du format ne détecte pas.
 */
export interface EcpExport {
  wire: string;
  fingerprint: string | null;
}

export async function fetchEcpExport(
  reportCode: string,
  fightID: number,
  encounterID?: number,
): Promise<EcpExport> {
  const qs = encounterID === undefined ? '' : `?boss=${encounterID}`;
  const res = await fetch(`/api/runs/${reportCode}/${fightID}/ecp${qs}`);
  const body = await res.text();
  if (!res.ok) {
    // L'API rend du JSON sur erreur, du texte brut sur succès.
    let message = "L'export a échoué";
    try {
      const m = (JSON.parse(body) as { message?: unknown }).message;
      if (typeof m === 'string') message = m;
    } catch { /* corps non JSON : on garde le message générique */ }
    throw new ApiError('ecp-export', message);
  }
  return { wire: body, fingerprint: res.headers.get('X-Ecp-Fingerprint') };
}
