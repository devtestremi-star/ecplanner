/**
 * Fonds de donjon repris de l'addon (`Media/Background/1210/bg-<abbr>.tga`, associés par
 * `Core/Assets.lua`), convertis en WebP et nommés par `gameZoneId`, l'identité stable du
 * donjon.
 *
 * L'addon n'en a que pour les donjons de la saison en cours. Les autres retombent sur son
 * fond générique `bg-2`, celui de ses fenêtres de plan.
 */
const WITH_ART: ReadonlySet<number> = new Set([
  2993, // Altar of Fangs
  2825, // Den of Nalorakk
  1762, // Kings' Rest
  2813, // Murder Row
  2521, // Ruby Life Pools
  1877, // Temple of Sethraliss
  2859, // The Blinding Vale
  2923, // Voidscar Arena
]);

export const dungeonArt = (gameZoneId: number): string =>
  WITH_ART.has(gameZoneId) ? `/dungeons/${gameZoneId}.webp` : '/bg-2.webp';
