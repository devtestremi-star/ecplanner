/**
 * Parsing d'URL WCL, étage 1 de la validation (plan §4.7).
 *
 * L'unité soumise est une RUN, jamais un rapport : un rapport contient couramment
 * plusieurs runs — le log témoin en porte 9 sur 2 donjons. Une URL nue est donc refusée
 * ici, avant tout appel réseau, donc à coût nul.
 */

const REPORT_CODE = /^[a-zA-Z0-9]{16}$/;

export interface ParsedRunUrl {
  reportCode: string;
  /** Numéro de fight, ou 'last' à résoudre côté API sur le dernier fight À KEYSTONE. */
  fight: number | 'last';
}

export class InvalidRunUrlError extends Error {
  override readonly name = 'InvalidRunUrlError';
  constructor(readonly reason: 'no-fight' | 'bad-url' | 'bad-fight' | 'bad-code', message: string) {
    super(message);
  }
}

export function parseRunUrl(input: string): ParsedRunUrl {
  const trimmed = input.trim();

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new InvalidRunUrlError(
      'bad-url',
      REPORT_CODE.test(trimmed)
        ? 'A report code alone is not enough: specify the run with ?fight=N'
        : `Unrecognized Warcraft Logs URL: ${trimmed.slice(0, 80)}`,
    );
  }

  const match = url.pathname.match(/\/reports\/([a-zA-Z0-9]+)/);
  if (!match?.[1]) {
    throw new InvalidRunUrlError('bad-url', 'The URL does not contain /reports/<code>');
  }
  const reportCode = match[1];
  if (!REPORT_CODE.test(reportCode)) {
    throw new InvalidRunUrlError('bad-code', `Malformed report code: ${reportCode}`);
  }

  // WCL utilise tantôt la query string, tantôt le fragment.
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const raw = url.searchParams.get('fight') ?? hash.get('fight');

  if (raw === null) {
    throw new InvalidRunUrlError(
      'no-fight',
      'URL without a `fight` parameter: a report contains several runs, you must pick one.',
    );
  }
  if (raw === 'last') return { reportCode, fight: 'last' };
  if (!/^\d+$/.test(raw)) {
    throw new InvalidRunUrlError('bad-fight', `Unsupported fight parameter: ${raw}`);
  }
  return { reportCode, fight: Number(raw) };
}

/** Ne lève pas — pour distinguer « invalide » de « valide » sans try/catch. */
export function tryParseRunUrl(input: string): ParsedRunUrl | InvalidRunUrlError {
  try {
    return parseRunUrl(input);
  } catch (err) {
    if (err instanceof InvalidRunUrlError) return err;
    throw err;
  }
}
