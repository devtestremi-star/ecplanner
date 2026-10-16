import { Box, type SxProps, type Theme } from '@mui/material';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Conteneur à défilement horizontal, barre masquée, piloté par la molette.
 *
 * La molette verticale fait avancer la piste dans le temps, et la timeline la garde pour
 * elle EN ENTIER : même arrivée au bout, la page ne défile pas tant que le pointeur est
 * sur la piste. Choix délibéré — la page qui part sous la souris en fin de piste gênait
 * plus qu'elle n'aidait.
 *
 * Les gestes déjà horizontaux (pavé tactile, Maj + molette) gardent leur comportement
 * natif, contenus par `overscroll-behavior` pour ne pas déclencher le « page précédente »
 * du navigateur au bord. Ctrl + molette reste le zoom du navigateur.
 */
export function PanScroll({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      // Toujours consommé, bord atteint ou non : la page ne défile jamais depuis la piste.
      e.preventDefault();

      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      // `deltaMode` 1 = lignes (Firefox avec une souris) : on convertit en pixels.
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      el.scrollLeft = Math.min(max, Math.max(0, el.scrollLeft + delta));
    };

    // `passive: false` obligatoire : l'`onWheel` de React est passif et ne peut pas
    // empêcher la page de défiler en même temps que la piste.
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <Box
      ref={ref}
      sx={[
        {
          overflowX: 'auto',
          overflowY: 'hidden',
          overscrollBehavior: 'contain',
          // Barre masquée, défilement conservé : Firefox, puis Chromium / WebKit.
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
