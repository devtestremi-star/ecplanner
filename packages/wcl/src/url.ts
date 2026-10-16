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
        ? 'Un code de rapport ne suffit pas : préciser la run avec ?fight=N'
        : `URL Warcraft Logs non reconnue : ${trimmed.slice(0, 80)}`,
    );
  }

  const match = url.pathname.match(/\/reports\/([a-zA-Z0-9]+)/);
  if (!match?.[1]) {
    throw new InvalidRunUrlError('bad-url', "L'URL ne contient pas de /reports/<code>");
  }
  const reportCode = match[1];
  if (!REPORT_CODE.test(reportCode)) {
    throw new InvalidRunUrlError('bad-code', `Code de rapport malformé : ${reportCode}`);
  }

  // WCL utilise tantôt la query string, tantôt le fragment.
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const raw = url.searchParams.get('fight') ?? hash.get('fight');

  if (raw === null) {
    throw new InvalidRunUrlError(
      'no-fight',
      'URL sans paramètre `fight` : un rapport contient plusieurs runs, il faut désigner laquelle.',
    );
  }
  if (raw === 'last') return { reportCode, fight: 'last' };
  if (!/^\d+$/.test(raw)) {
    throw new InvalidRunUrlError('bad-fight', `Paramètre fight non géré : ${raw}`);
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
