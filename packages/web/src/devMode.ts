/**
 * Outils de développement : scans forcés et tiroir d'historique. Lu dans `APP_MODE`
 * (`.env` de la racine), figé au build par Vite.
 *
 * L'API vérifie le même mode de son côté : ce drapeau ne fait que masquer l'interface.
 */
export const DEV_MODE = import.meta.env.APP_MODE === 'DEV';
