import 'i18next';
import type en from './locales/en.json';

/** Clés typées sur l'anglais : une clé absente ou mal orthographiée casse le typecheck. */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
    returnNull: false;
  }
}
