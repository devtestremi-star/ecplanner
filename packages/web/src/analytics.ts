/**
 * Google Analytics 4, en Consent Mode v2.
 *
 * Rien n'est chargé sans `VITE_GA_ID` (figé au build par Vite) : en local, l'ID est
 * absent et GA n'existe pas. En prod, gtag.js se charge d'office mais avec TOUS les
 * consentements refusés : aucun cookie n'est posé tant que le visiteur n'a pas accepté
 * le bandeau. Le choix vit dans le navigateur.
 *
 * Les pages vues sont envoyées à la main (`send_page_view: false`) : l'application est
 * une SPA, gtag ne verrait que le premier chargement.
 */
export const GA_ID = import.meta.env.VITE_GA_ID?.trim() || null;

export type Consent = 'granted' | 'denied';
const STORAGE_KEY = 'ecp-analytics-consent';

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

/** Stockage indisponible (navigation privée, données bloquées) : on redemande, sans planter. */
export function storedConsent(): Consent | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

const gtag: Gtag = (...args) => window.gtag?.(...args);

let started = false;

/** À appeler une fois, avant le premier rendu. */
export function initAnalytics(): void {
  if (!GA_ID || started) return;
  started = true;
  window.dataLayer = window.dataLayer ?? [];
  // gtag attend l'objet `arguments` lui-même, pas un tableau : d'où la `function`.
  window.gtag = function gtagShim() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  const granted = storedConsent() === 'granted';
  gtag('consent', 'default', {
    analytics_storage: granted ? 'granted' : 'denied',
    // Le site n'affiche aucune publicité : ces trois-là restent refusés quoi qu'il arrive.
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  gtag('js', new Date());
  gtag('config', GA_ID, { send_page_view: false });

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);
}

export function setConsent(consent: Consent): void {
  try {
    localStorage.setItem(STORAGE_KEY, consent);
  } catch { /* le choix vaut pour cette visite seulement */ }
  gtag('consent', 'update', { analytics_storage: consent });
  for (const fn of listeners) fn();
}

export function trackPageView(path: string): void {
  if (!GA_ID) return;
  gtag('event', 'page_view', { page_path: path, page_location: window.location.href, page_title: document.title });
}

/**
 * Réouverture du bandeau depuis le pied de page : le visiteur doit pouvoir retirer son
 * consentement aussi facilement qu'il l'a donné.
 */
const listeners = new Set<() => void>();
let reopenRequested = false;
export const consentStore = {
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  reopen(): void {
    reopenRequested = true;
    for (const fn of listeners) fn();
  },
  /** Bandeau visible : aucun choix enregistré, ou réouverture demandée. */
  isOpen(): boolean {
    return GA_ID !== null && (reopenRequested || storedConsent() === null);
  },
  close(): void {
    reopenRequested = false;
  },
};
