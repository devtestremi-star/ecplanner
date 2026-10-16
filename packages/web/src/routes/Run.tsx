import { Alert, Box, Chip, CircularProgress, Container, FormControlLabel, Stack, Switch, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { fetchRun, type RunDetail } from '../api.js';
import { loadCatalog, type SpellSummary } from '../spells/catalog.js';
import {
  CATEGORIES, CATEGORY_COLOR, CATEGORY_LABEL, countByCategory, parseCategories, type Category,
} from '../timeline/categories.js';
import {
  BossSpellFilter, resolveHiddenBossSpells, serializeIds,
} from '../timeline/BossSpellFilter.js';
import { ExportButtons } from '../ecp/ExportButtons.js';
import { Timeline } from '../timeline/Timeline.js';

const mmss = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function Run() {
  const { reportCode, fightID } = useParams();
  const [params, setParams] = useSearchParams();
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [catalog, setCatalog] = useState<Map<number, SpellSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reportCode || !fightID) return;
    // Le catalogue et la run se chargent en parallèle : ni l'un ni l'autre ne dépend
    // de l'autre, et la timeline a besoin des deux.
    Promise.all([fetchRun(reportCode, Number(fightID)), loadCatalog()])
      .then(([d, c]) => {
        setDetail(d);
        setCatalog(c);
      })
      .catch((e) => setError(String(e)));
  }, [reportCode, fightID]);

  if (error) return <Container sx={{ py: 5 }}><Alert severity="error">{error}</Alert></Container>;
  if (!detail || !catalog) return <Container sx={{ py: 5 }}><CircularProgress size={20} /></Container>;

  const missing = new Set(
    detail.bosses.flatMap((b) => b.casts.map((c) => c.abilityGameID)).filter((id) => !catalog.has(id)),
  );

  /**
   * `?boss=N` sélectionne un boss par son orderIndex. Il y a TOUJOURS un boss courant :
   * absent ou invalide retombe sur le premier, jamais sur « tous ».
   *
   * C'est ce qui donne son sens au filtre de sorts de boss juste en dessous — il ne
   * propose que les sorts du combat affiché. Sans boss courant, il listerait ceux des
   * quatre combats et l'utilisateur masquerait des sorts qu'il ne voit pas.
   *
   * L'état vit dans l'URL, donc un lien vers un boss précis reste partageable.
   */
  const raw = params.get('boss');
  const first = detail.bosses[0]?.orderIndex ?? 0;
  const selected = raw !== null && detail.bosses.some((b) => String(b.orderIndex) === raw)
    ? Number(raw)
    : first;
  const shown = detail.bosses.filter((b) => b.orderIndex === selected);

  /** Les autres paramètres sont recopiés : changer d'onglet ne perd ni `cat` ni `bossOff`. */
  const selectBoss = (value: number) => {
    const next = new URLSearchParams(params);
    next.set('boss', String(value));
    setParams(next, { replace: true });
  };

  // `?cat=DEFENSIVE,HEALING` — même principe que `?boss` : l'état vit dans l'URL,
  // donc un lien vers « les défensifs sur Crawth » est partageable.
  const active = parseCategories(params.get('cat'));
  const specBySource = new Map(detail.participants.map((p) => [p.sourceID, p.specId]));
  const counts = countByCategory(shown, catalog, specBySource);

  // Tout est affiché par défaut : seul l'utilisateur masque, via `?bossOff`.
  const shownDetail = { ...detail, bosses: shown };
  const hiddenBossSpells = resolveHiddenBossSpells(params.get('bossOff'));

  const toggleBossSpell = (spellId: number) => {
    const next = new Set(hiddenBossSpells);
    if (next.has(spellId)) next.delete(spellId);
    else next.add(spellId);
    const p = new URLSearchParams(params);
    next.size ? p.set('bossOff', serializeIds(next)) : p.delete('bossOff');
    setParams(p, { replace: true });
  };

  /**
   * `?align=1` — recale les cooldowns de réaction sur le sort de boss qui les a provoqués.
   * Comme les autres filtres, l'état vit dans l'URL : la vue alignée est partageable, et
   * elle survit au changement d'onglet.
   */
  const aligned = params.get('align') === '1';
  const toggleAligned = () => {
    const p = new URLSearchParams(params);
    aligned ? p.delete('align') : p.set('align', '1');
    setParams(p, { replace: true });
  };

  const toggleCategory = (cat: Category) => {
    const next = new Set(active);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    const p = new URLSearchParams(params);
    // Tout sélectionné = pas de filtre : on retire le param plutôt que de le lister.
    if (next.size === 0 || next.size === CATEGORIES.length) p.delete('cat');
    else p.set('cat', [...next].join(','));
    setParams(p, { replace: true });
  };

  return (
    <Container maxWidth={false} sx={{ py: 4, maxWidth: 1600 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline', flexWrap: 'wrap', mb: .5 }}>
        <Typography variant="h1">{detail.run.dungeon.name}</Typography>
        <Typography sx={{ color: 'primary.main', fontWeight: 600 }}>+{detail.run.keystoneLevel}</Typography>
        <Chip
          size="small" variant="outlined"
          label={detail.run.kill ? 'terminée' : 'abandonnée'}
          color={detail.run.kill ? 'success' : 'error'}
        />
      </Stack>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
        {new Date(detail.run.startedAt).toLocaleString('fr-CA')} · {mmss(detail.run.duration)} ·{' '}
        {detail.run.season} · {detail.run.reportCode}
      </Typography>

      {missing.size > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {missing.size} sort(s) castés mais absents du catalogue, non affichés :{' '}
          <Box component="span" sx={{ fontFamily: 'ui-monospace, monospace' }}>
            {[...missing].join(', ')}
          </Box>
          . Soit ils ont quitté le catalogue depuis le scan, soit le catalogue chargé est périmé —
          un rechargement forcé tranche entre les deux.
        </Alert>
      )}

      {/* Un onglet par boss, sans « Tous » : le filtre de sorts en dessous n'a de sens
          que face à un combat unique. */}
      <Tabs
        value={selected}
        onChange={(_, v) => selectBoss(Number(v))}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider', minHeight: 40 }}
      >
        {detail.bosses.map((b) => (
          <Tab
            key={b.orderIndex}
            value={b.orderIndex}
            label={`${b.orderIndex + 1}. ${b.name}`}
            sx={{ minHeight: 40, textTransform: 'none' }}
          />
        ))}
      </Tabs>

      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
        {CATEGORIES.map((cat) => {
          const on = active.has(cat);
          const n = counts[cat];
          return (
            <Chip
              key={cat}
              label={`${CATEGORY_LABEL[cat]} · ${n}`}
              onClick={() => toggleCategory(cat)}
              variant={on ? 'filled' : 'outlined'}
              disabled={n === 0}
              sx={{
                fontWeight: 600,
                ...(on
                  ? { bgcolor: CATEGORY_COLOR[cat], color: '#0b0d11', '&:hover': { bgcolor: CATEGORY_COLOR[cat] } }
                  : { borderColor: CATEGORY_COLOR[cat], color: CATEGORY_COLOR[cat] }),
              }}
            />
          );
        })}
        {active.size < CATEGORIES.length && (
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Chip label="tout afficher" size="small" variant="outlined" onClick={() => {
              const p = new URLSearchParams(params);
              p.delete('cat');
              setParams(p, { replace: true });
            }} />
          </Box>
        )}
      </Stack>

      <ExportButtons
        reportCode={detail.run.reportCode}
        fightID={detail.run.fightID}
        bossEncounterID={shown[0]?.encounterID}
        bossName={shown[0]?.name}
      />

      <Tooltip
        title="Recale les défensifs, externes et cooldowns de soin sur le sort de boss auquel ils répondent, dans une fenêtre de −1 s à +6 s. Les tanks et les casts sans sort de boss correspondant gardent leur instant réel."
        placement="right"
      >
        <FormControlLabel
          sx={{ mb: 1 }}
          control={<Switch size="small" checked={aligned} onChange={toggleAligned} />}
          label={
            <Typography variant="body2" sx={{ color: aligned ? 'text.primary' : 'text.secondary' }}>
              Aligner sur les sorts de boss
            </Typography>
          }
        />
      </Tooltip>

      <BossSpellFilter
        detail={shownDetail}
        catalog={catalog}
        hidden={hiddenBossSpells}
        onToggle={toggleBossSpell}
      />

      <Timeline
        detail={shownDetail}
        catalog={catalog}
        categories={active}
        hiddenBossSpells={hiddenBossSpells}
        aligned={aligned}
      />
    </Container>
  );
}
