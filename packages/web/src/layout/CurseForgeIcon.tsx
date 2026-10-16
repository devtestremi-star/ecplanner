import { SvgIcon, type SvgIconProps } from '@mui/material';

/**
 * Logo CurseForge, tiré de Simple Icons (simple-icons@13.21.0, `icons/curseforge.svg`),
 * sous licence CC0 : domaine public, aucune attribution requise.
 */
export function CurseForgeIcon(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="0 0 24 24" {...props}>
      <path d="M18.326 9.2145S23.2261 8.4418 24 6.1882h-7.5066V4.4H0l2.0318 2.3576V9.173s5.1267-.2665 7.1098 1.2372c2.7146 2.516-3.053 5.917-3.053 5.917L5.0995 19.6c1.5465-1.4726 4.494-3.3775 9.8983-3.2857-2.0565.65-4.1245 1.6651-5.7344 3.2857h10.9248l-1.0288-3.2726s-7.918-4.6688-.8336-7.1127z" />
    </SvgIcon>
  );
}

/** Orange de la marque CurseForge. */
export const CURSEFORGE_ORANGE = '#F16436';
