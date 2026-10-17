import { Box, Skeleton, Tooltip } from '@mui/material';
import DOMPurify from 'dompurify';
import { useEffect, useState, type ReactNode } from 'react';
import { iconFallbackUrl, iconSizeFor, iconUrl, loadTooltip, type SpellSummary } from './catalog.js';

/**
 * Le HTML vient de Wowhead : contenu tiers injecté dans notre page. On l'assainit
 * plutôt que de lui faire confiance — c'est du texte statique, il n'a besoin d'aucun
 * script ni gestionnaire d'événement.
 */
const clean = (html: string): string =>
  DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['table', 'tr', 'td', 'th', 'div', 'span', 'b', 'i', 'br', 'a', 'small'],
    ALLOWED_ATTR: ['class', 'href', 'width'],
  });

function TooltipBody({ spellId, name }: { spellId: number; name: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadTooltip(spellId).then((h) => {
      if (!alive) return;
      if (h) setHtml(clean(h));
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [spellId]);

  // Le nom vient de notre base : le tooltip peut échouer sans laisser un vide.
  if (failed) return <Box sx={{ p: 0.5 }}>{name}</Box>;
  if (!html) return <Skeleton variant="rectangular" width={220} height={64} />;

  return (
    <Box
      className="wh-tooltip"
      dangerouslySetInnerHTML={{ __html: html }}
      sx={{
        fontSize: '.8rem',
        lineHeight: 1.45,
        maxWidth: 320,
        '& table': { borderCollapse: 'collapse', width: '100%' },
        '& td, & th': { p: 0, verticalAlign: 'top', textAlign: 'left' },
        '& th': { textAlign: 'right', color: 'text.secondary', whiteSpace: 'nowrap' },
        '& a': { color: 'inherit', textDecoration: 'none' },
        '& .whtt-name': { fontSize: '.9rem' },
        '& .q0': { color: '#9d9d9d' },
        '& .q, & .q1': { color: '#ffd100' },
        '& .q2': { color: '#1eff00' },
        '& .wowhead-tooltip-requirements': { color: '#ff2020' },
      }}
    />
  );
}

export interface SpellIconProps {
  spell: SpellSummary;
  /** Taille d'AFFICHAGE en px, libre. La taille demandée au CDN est déduite. */
  size?: number;
  /** Bordure colorée, pour teinter par catégorie ou par classe du lanceur. */
  borderColor?: string;
  /** Ligne ajoutée en tête du tooltip (l'instant du cast, dans la timeline). */
  caption?: ReactNode;
}

/** L'icône seule dans la timeline ; le tooltip n'est chargé qu'au survol. */
export function SpellIcon({ spell, size = 36, borderColor, caption }: SpellIconProps) {
  // L'affichage et la taille servie sont découplés : demander /icons/32/ rendrait un 403.
  const served = iconSizeFor(size);
  // 0 = CDN Blizzard, 1 = repli Wowhead, 2 = les deux ont échoué → « ? ».
  const [attempt, setAttempt] = useState(0);
  const url = attempt === 0 ? iconUrl(spell.icon, served) : iconFallbackUrl(spell.icon, served);
  const broken = attempt >= 2;
  return (
    <Tooltip
      title={
        caption ? (
          <>
            <Box sx={{ fontSize: '.78rem', fontWeight: 700, color: '#ffd100', mb: .75, fontVariantNumeric: 'tabular-nums' }}>
              {caption}
            </Box>
            <TooltipBody spellId={spell.spellId} name={spell.name} />
          </>
        ) : <TooltipBody spellId={spell.spellId} name={spell.name} />
      }
      enterDelay={250}
      slotProps={{ tooltip: { sx: { bgcolor: '#0b0d11', border: '1px solid #3a4152', maxWidth: 'none', p: 1 } } }}
    >
      {/* Une icône cassée reste VISIBLE : la masquer ferait disparaître un cast réel
          de la timeline sans que personne s'en aperçoive. */}
      <Box
        component={broken || !url ? 'div' : 'img'}
        {...(broken || !url ? {} : { src: url, alt: spell.name, loading: 'lazy' as const })}
        onError={() => setAttempt((a) => a + 1)}
        sx={{
          width: size,
          height: size,
          display: 'block',
          borderRadius: '4px',
          border: borderColor ? `2px solid ${borderColor}` : '1px solid rgba(255,255,255,.12)',
          cursor: 'help',
          ...(broken || !url
            ? {
                bgcolor: 'rgba(255,255,255,.06)',
                display: 'grid',
                placeItems: 'center',
                fontSize: size * 0.5,
                color: 'text.secondary',
              }
            : {}),
        }}
      >
        {broken || !url ? '?' : null}
      </Box>
    </Tooltip>
  );
}
