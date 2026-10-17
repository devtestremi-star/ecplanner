import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { Alert, Box, Button, Chip, CircularProgress, Container, Divider, Paper, Stack, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { ApiError, fetchRun, scan, type RunDetail } from '../api.js';
import { DEV_MODE } from '../devMode.js';
import { recordRun } from '../history.js';
import { formatLocale } from '../i18n/index.js';
import { PALETTE } from '../theme.js';
import { dungeonArt } from './dungeonArt.js';
import { loadCatalog, type SpellSummary } from '../spells/catalog.js';
import {
  CATEGORIES, CATEGORY_COLOR, countByCategory, parseCategories, type Category,
} from '../timeline/categories.js';
import {
  BossSpellFilter, resolveHiddenBossSpells, serializeIds,
} from '../timeline/BossSpellFilter.js';
import { ExportButtons } from '../ecp/ExportButtons.js';
import { FilterLabel } from '../layout/FilterLabel.js';
import {
  parsePlayers, parsePlayerSpells, PlayerSpellFilter, serializePlayerSpells,
} from '../timeline/PlayerSpellFilter.js';
import { Timeline } from '../timeline/Timeline.js';

const mmss = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function Run() {
  const { t } = useTranslation();
  const { reportCode, fightID } = useParams();
  const [params, setParams] = useSearchParams();
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [catalog, setCatalog] = useState<Map<number, SpellSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Incrémenté après un rescan forcé : relance le chargement de la run.
  const [version, setVersion] = useState(0);
  const [rescanning, setRescanning] = useState(false);
  const [rescanError, setRescanError] = useState<string | null>(null);

  useEffect(() => {
    if (!reportCode || !fightID) return;
    // Le catalogue et la run se chargent en parallèle : ni l'un ni l'autre ne dépend
    // de l'autre, et la timeline a besoin des deux.
    Promise.all([fetchRun(reportCode, Number(fightID)), loadCatalog()])
      .then(([d, c]) => {
        setDetail(d);
        setCatalog(c);
        recordRun(d);
      })
      .catch((e) => setError(String(e)));
  }, [reportCode, fightID, version]);

  /** Outil de dev : réinterroge Warcraft Logs pour CETTE run, puis recharge la page. */
  async function forceRescan() {
    if (!reportCode || !fightID) return;
    setRescanning(true);
    setRescanError(null);
    try {
      await scan(`https://www.warcraftlogs.com/reports/${reportCode}?fight=${fightID}`, true);
      setVersion((v) => v + 1);
    } catch (e) {
      setRescanError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setRescanning(false);
    }
  }

  if (error) return <Container sx={{ py: 6 }}><Alert severity="error">{error}</Alert></Container>;
  if (!detail || !catalog) return <Container sx={{ py: 6 }}><CircularProgress size={24} /></Container>;

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
   * `?spellOff=12-31884` — sorts masqués joueur par joueur (filtre avancé). Même principe
   * que `?bossOff` : l'état vit dans l'URL et vaut pour tous les boss de la run.
   */
  const hiddenPlayerSpells = parsePlayerSpells(params.get('spellOff'));
  const togglePlayerSpell = (key: string) => {
    const next = new Set(hiddenPlayerSpells);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const p = new URLSearchParams(params);
    next.size ? p.set('spellOff', serializePlayerSpells(next)) : p.delete('spellOff');
    setParams(p, { replace: true });
  };
  /** `?playerOff=12,15` — joueurs masqués en entier, l'œil à côté de leur nom. */
  const hiddenPlayers = parsePlayers(params.get('playerOff'));
  const togglePlayer = (sourceID: number) => {
    const next = new Set(hiddenPlayers);
    if (next.has(sourceID)) next.delete(sourceID);
    else next.add(sourceID);
    const p = new URLSearchParams(params);
    next.size ? p.set('playerOff', serializeIds(next)) : p.delete('playerOff');
    setParams(p, { replace: true });
  };
  const resetPlayers = () => {
    const p = new URLSearchParams(params);
    p.delete('spellOff');
    p.delete('playerOff');
    setParams(p, { replace: true });
  };
  const hiddenOnPlayers = hiddenPlayerSpells.size + hiddenPlayers.size;

  /**
   * Mode ECP (`?ecp=1`) : la timeline telle que l'export la lira.
   *
   * L'entrer applique un preset — soins et externes, sorts de boss hors plan masqués
   * (`allowedInPlan`) — et active l'ALIGNEMENT, qui n'existe que dans ce mode : l'export
   * rattache chaque cast à une capacité de boss et le place à son instant, la vue alignée
   * est donc le plan tel qu'il partira. Les filtres restent réglables dans le mode ; en
   * sortir coupe l'alignement et rend la vue complète. Les exclusions par joueur
   * (`spellOff`) ne sont jamais touchées.
   */
  const ecpMode = params.get('ecp') === '1';
  const aligned = ecpMode;
  const ecpBossOff = new Set(
    detail.bosses.flatMap((b) => b.casts)
      .filter((c) => !specBySource.has(c.sourceID) && catalog.get(c.abilityGameID)?.allowedInPlan === false)
      .map((c) => c.abilityGameID),
  );
  const ECP_CATEGORIES: readonly Category[] = CATEGORIES.filter((c) => c === 'EXTERNAL' || c === 'HEALER');
  const toggleEcpMode = () => {
    const p = new URLSearchParams(params);
    if (ecpMode) {
      p.delete('ecp');
      p.delete('cat');
      p.delete('bossOff');
    } else {
      p.set('ecp', '1');
      p.set('cat', ECP_CATEGORIES.join(','));
      ecpBossOff.size ? p.set('bossOff', serializeIds(ecpBossOff)) : p.delete('bossOff');
    }
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
    <Box>
      {/* Bandeau : le fond du donjon tiré de l'addon, voilé comme dans l'addon pour que le
          titre reste lisible même sur les illustrations claires, et fondu dans la page. */}
      <Box
        sx={{
          backgroundImage: `
            linear-gradient(180deg, rgba(20,18,43,.45) 0%, rgba(20,18,43,.72) 60%, ${PALETTE.bg} 100%),
            url(${dungeonArt(detail.run.dungeon.gameZoneId)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 40%',
        }}
      >
        <Container maxWidth={false} sx={{ pt: 12, pb: 6, px: 5, maxWidth: 1680 }}>
          {/* En-tête : identité de la run à gauche, actions à droite. */}
          <Stack direction="row" spacing={3} sx={{ justifyContent: 'space-between', alignItems: 'flex-end', textShadow: '0 2px 16px rgba(0,0,0,.6)' }}>
            <Box>
              <Typography variant="overline" sx={{ color: 'primary.light' }}>{detail.run.season}</Typography>
              <Stack direction="row" spacing={2} sx={{ alignItems: 'baseline', flexWrap: 'wrap', mt: .5 }}>
                <Typography variant="h1">{detail.run.dungeon.name}</Typography>
                <Typography sx={{ color: 'primary.main', fontWeight: 700, fontSize: '1.4rem' }}>
                  +{detail.run.keystoneLevel}
                </Typography>
                <Chip
                  size="small" variant="outlined"
                  label={detail.run.kill ? t('run.status.completed') : t('run.status.abandoned')}
                  color={detail.run.kill ? 'success' : 'error'}
                />
              </Stack>
              <Typography variant="body2" sx={{ color: 'rgba(238,236,251,.8)', mt: 1.5 }}>
                {new Date(detail.run.startedAt).toLocaleString(formatLocale())} · {mmss(detail.run.duration)} ·{' '}
                <Box component="span" sx={{ fontFamily: 'ui-monospace, monospace' }}>{detail.run.reportCode}</Box>
              </Typography>
            </Box>

            <Stack direction="row" spacing={1}>
              {DEV_MODE && (
                <Tooltip title={t('dev.rescanHelp')}>
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      color="warning"
                      disabled={rescanning}
                      startIcon={rescanning ? <CircularProgress size={14} color="inherit" /> : <RefreshRoundedIcon />}
                      onClick={() => void forceRescan()}
                    >
                      {rescanning ? t('dev.rescanning') : t('dev.rescan')}
                    </Button>
                  </span>
                </Tooltip>
              )}
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth={false} sx={{ pb: 6, px: 5, maxWidth: 1680 }}>

      {rescanError && <Alert severity="error" sx={{ mt: 4 }}>{rescanError}</Alert>}

      {missing.size > 0 && (
        <Alert severity="warning" sx={{ mt: 4 }}>
          <Trans
            i18nKey="run.missingSpells"
            values={{ count: missing.size, ids: [...missing].join(', ') }}
            components={{ mono: <Box component="span" sx={{ fontFamily: 'ui-monospace, monospace' }} /> }}
          />
        </Alert>
      )}

      {/* Un onglet par boss, sans « Tous » : le filtre de sorts en dessous n'a de sens
          que face à un combat unique. */}
      <Tabs
        value={selected}
        onChange={(_, v) => selectBoss(Number(v))}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mt: 1, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        {detail.bosses.map((b) => (
          <Tab key={b.orderIndex} value={b.orderIndex} label={`${b.orderIndex + 1}. ${b.name}`} />
        ))}
      </Tabs>

      {/* Tous les réglages d'affichage dans une seule carte, une ligne par filtre. */}
      <Paper variant="outlined" sx={{ mt: 4, p: 3.5, borderRadius: '14px' }}>
        <Stack spacing={3}>
          <Stack direction="row" spacing={2}>
            <FilterLabel>{t('run.filters.categories')}</FilterLabel>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
              {CATEGORIES.map((cat) => {
                const on = active.has(cat);
                const n = counts[cat];
                return (
                  <Chip
                    key={cat}
                    label={t('run.filters.categoryChip', { label: t(`categories.${cat}`), count: n })}
                    onClick={() => toggleCategory(cat)}
                    variant={on ? 'filled' : 'outlined'}
                    disabled={n === 0}
                    sx={on
                      ? { bgcolor: CATEGORY_COLOR[cat], color: '#0b0d11', '&:hover': { bgcolor: CATEGORY_COLOR[cat] } }
                      : { borderColor: CATEGORY_COLOR[cat], color: CATEGORY_COLOR[cat] }}
                  />
                );
              })}
              {active.size < CATEGORIES.length && (
                <Chip label={t('run.filters.showAll')} size="small" variant="outlined" onClick={() => {
                  const p = new URLSearchParams(params);
                  p.delete('cat');
                  setParams(p, { replace: true });
                }} />
              )}
            </Stack>
          </Stack>

          <BossSpellFilter
            detail={shownDetail}
            catalog={catalog}
            hidden={hiddenBossSpells}
            onToggle={toggleBossSpell}
          />

          {/* Toujours visible : une colonne par joueur, l'œil pour le masquer en entier. */}
          <Stack direction="row" spacing={2}>
            <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
              <FilterLabel>{t('run.filters.players')}</FilterLabel>
              {hiddenOnPlayers > 0 && (
                <>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {t('run.filters.hiddenCount', { count: hiddenOnPlayers })}
                  </Typography>
                  <Chip label={t('run.filters.showAll')} size="small" variant="outlined" onClick={resetPlayers} />
                </>
              )}
            </Stack>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <PlayerSpellFilter
                detail={shownDetail}
                catalog={catalog}
                categories={active}
                hidden={hiddenPlayerSpells}
                onToggle={togglePlayerSpell}
                hiddenPlayers={hiddenPlayers}
                onTogglePlayer={togglePlayer}
              />
            </Box>
          </Stack>

          {/* Actions, en bas à droite : le mode ECP puis l'export, qui lit ce que ce mode montre. */}
          <Divider />
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
            <Tooltip title={t('run.filters.ecpPresetHelp')} placement="top">
              <Button
                size="small"
                variant={ecpMode ? 'contained' : 'outlined'}
                onClick={toggleEcpMode}
                startIcon={<Box component="img" src="/favicon.png" alt="" sx={{ width: 18, height: 18 }} />}
              >
                {t('run.filters.ecpPreset')}
              </Button>
            </Tooltip>
            <ExportButtons
              reportCode={detail.run.reportCode}
              fightID={detail.run.fightID}
              bossEncounterID={shown[0]?.encounterID}
              bossName={shown[0]?.name}
            />
          </Stack>
        </Stack>
      </Paper>

      <Box sx={{ mt: 4 }}>
        <Timeline
          detail={shownDetail}
          catalog={catalog}
          categories={active}
          hiddenBossSpells={hiddenBossSpells}
          hiddenPlayerSpells={hiddenPlayerSpells}
          hiddenPlayers={hiddenPlayers}
          aligned={aligned}
        />
      </Box>
      </Container>
    </Box>
  );
}
