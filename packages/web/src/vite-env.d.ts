/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `DEV` active les outils de développement. Voir `devMode.ts`. */
  readonly APP_MODE?: string;
  /** ID de mesure GA4 (`G-XXXXXXXXXX`). Absent : pas d'analytics. Voir `analytics.ts`. */
  readonly VITE_GA_ID?: string;
}
