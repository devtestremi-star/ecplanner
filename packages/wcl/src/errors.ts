/**
 * Cette API échoue presque toujours en silence (plan §2.2bis, §7.1).
 * Chaque mode d'échec constaté en Phase 0 a son type, pour qu'un `catch` puisse
 * distinguer le transitoire du permanent — et pour qu'aucun ne soit pris pour un
 * résultat vide légitime.
 */

export class WclError extends Error {
  override readonly name: string = 'WclError';
}

/** Erreurs GraphQL explicites — les seules qui parlent. */
export class WclGraphQLError extends WclError {
  override readonly name = 'WclGraphQLError';
  constructor(readonly errors: unknown, message?: string) {
    super(message ?? `GraphQL: ${JSON.stringify(errors)}`);
  }
}

/** HTTP non-2xx. `retryable` distingue le transitoire (5xx, 429) du permanent. */
export class WclHttpError extends WclError {
  override readonly name = 'WclHttpError';
  constructor(readonly status: number, readonly body: string) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`);
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

/**
 * ☠️ `events: null` en HTTP 200, sans tableau `errors`.
 * Cause connue : liste d'ids trop longue (NOTES E8/E11). Ne JAMAIS traiter comme vide.
 */
export class WclNullResultError extends WclError {
  override readonly name = 'WclNullResultError';
  constructor(readonly path: string) {
    super(
      `${path} est null en HTTP 200 sans erreur GraphQL — cause probable : filterExpression ` +
        `au-delà du budget (Σ chiffres+4,23 ≲ 7215). Ne pas interpréter comme « aucun résultat ».`,
    );
  }
}

/** Garde-fou du budget de filtre, levé AVANT l'envoi. */
export class FilterTooLargeError extends WclError {
  override readonly name = 'FilterTooLargeError';
  constructor(readonly count: number, readonly cost: number, readonly budget: number) {
    super(`filterExpression : ${count} ids, coût ${cost.toFixed(0)} > budget ${budget}`);
  }
}

/** Curseur de pagination non progressif, ou plafond de pages atteint. */
export class PaginationError extends WclError {
  override readonly name = 'PaginationError';
}

/** Budget de points proche de la limite — le job doit être remis en file. */
export class RateLimitError extends WclError {
  override readonly name = 'RateLimitError';
  constructor(readonly resetInSeconds: number, readonly spent: number, readonly limit: number) {
    super(`Budget à ${((spent / limit) * 100).toFixed(0)}% — reset dans ${resetInSeconds}s`);
  }
}

/** Rapport inaccessible : privé, supprimé, ou code invalide. Permanent. */
export class ReportNotAccessibleError extends WclError {
  override readonly name = 'ReportNotAccessibleError';
  constructor(readonly reportCode: string) {
    super(`Rapport ${reportCode} inaccessible (privé, supprimé, ou code invalide)`);
  }
}
