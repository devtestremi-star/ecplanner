/**
 * Mode de l'application, lu dans `APP_MODE`. `DEV` ouvre les outils de développement :
 * scans forcés, tiroir d'historique. Absent ou autre valeur = production.
 *
 * Le front lit la même variable (exposée par Vite) pour afficher ces outils ; le serveur
 * la vérifie de son côté, car masquer un bouton n'empêche pas d'appeler l'API.
 */
export const isDevMode = (): boolean => process.env.APP_MODE === 'DEV';
