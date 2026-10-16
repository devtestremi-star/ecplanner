import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

/**
 * Textes de l'interface, centralisés dans `locales/en.json`.
 *
 * L'anglais est la seule langue du site. L'outil reste en place pour en ajouter une sans
 * repasser sur les composants : un JSON de plus ici, avec les mêmes clés — le typage
 * (`i18next.d.ts`) se cale sur l'anglais.
 *
 * Hors périmètre : les noms de sorts, de boss et de donjons, qui viennent de Warcraft Logs.
 */
export const resources = { en: { translation: en } } as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  // React échappe déjà le texte : un second échappement afficherait `&amp;` et consorts.
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Locale des dates et des nombres pour chaque langue. */
const FORMAT_LOCALE: Record<string, string> = { en: 'en-US' };
export const formatLocale = (): string => FORMAT_LOCALE[i18n.language] ?? i18n.language;

export default i18n;
