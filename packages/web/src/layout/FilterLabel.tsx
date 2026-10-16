import { Typography } from '@mui/material';
import type { ReactNode } from 'react';

/**
 * Étiquette d'une ligne de filtres. Largeur fixe : les contrôles des différentes lignes
 * démarrent tous à la même abscisse.
 */
export function FilterLabel({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="body2"
      sx={{ color: 'text.secondary', fontWeight: 600, width: 132, flexShrink: 0, pt: .5 }}
    >
      {children}
    </Typography>
  );
}
