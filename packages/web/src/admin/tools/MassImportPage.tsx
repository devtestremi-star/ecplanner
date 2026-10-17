import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { formatLocale } from '../../i18n/index.js';
import { iconUrl } from '../../spells/catalog.js';
import { api } from '../api.js';
import { batchLabel, characterLabel, type ImportBatchSummary, type ImportOptions } from './imports.js';

/**
 * Import de masse, étape 1 : trouver les clés d'un personnage sur Warcraft Logs et les
 * ranger dans un lot. Rien n'est scanné ici ; l'import se fait clé par clé, dans le lot.
 */
export function MassImportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [options, setOptions] = useState<ImportOptions | null>(null);
  const [batches, setBatches] = useState<ImportBatchSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [character, setCharacter] = useState('');
  const [dungeons, setDungeons] = useState<Set<number>>(new Set());
  const [minLevel, setMinLevel] = useState(20);
  const [name, setName] = useState('');
  const [healerSpecId, setHealerSpecId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.imports.options()
      .then((o) => {
        setOptions(o);
        setDungeons(new Set(o.dungeons.map((d) => d.gameZoneId)));
      })
      .catch((e: Error) => setError(e.message));
    api.imports.list().then(setBatches).catch((e: Error) => setError(e.message));
  }, []);

  const toggleDungeon = (id: number) => {
    const next = new Set(dungeons);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDungeons(next);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.imports.create({
        character, dungeons: [...dungeons], minLevel, name: name.trim() || null, healerSpecId,
      });
      navigate(`/admin/tools/imports/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const specById = new Map(options?.healerSpecs.map((s) => [s.id, s]));

  return (
    <>
      <div className="page-head">
        <h2>{t('admin.tools.imports.title')}</h2>
        <p>{t('admin.tools.imports.intro')}</p>
      </div>

      {error && <div className="error">{error}</div>}

      <form className="tool-form" onSubmit={(e) => void submit(e)}>
        <div className="field">
          <label htmlFor="imp-character">{t('admin.tools.imports.character')}</label>
          <input
            id="imp-character"
            value={character}
            onChange={(e) => setCharacter(e.target.value)}
            placeholder="Eiiko-Sylvanas-EU"
            autoComplete="off"
          />
        </div>

        <div className="field">
          <label>{t('admin.tools.imports.dungeons')}</label>
          <div className="chips">
            {options?.dungeons.map((d) => (
              <button
                key={d.gameZoneId}
                type="button"
                className={`chip ${dungeons.has(d.gameZoneId) ? 'on' : ''}`}
                onClick={() => toggleDungeon(d.gameZoneId)}
              >
                {d.name}
              </button>
            ))}
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="imp-level">{t('admin.tools.imports.minLevel')}</label>
            <input id="imp-level" type="number" min={2} max={40} value={minLevel} onChange={(e) => setMinLevel(Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="imp-spec">{t('admin.tools.imports.healerSpec')}</label>
            <select
              id="imp-spec"
              value={healerSpecId ?? ''}
              onChange={(e) => setHealerSpecId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t('admin.tools.imports.healerSpecAuto')}</option>
              {options?.healerSpecs.map((s) => (
                <option key={s.id} value={s.id}>{s.name} {s.className}</option>
              ))}
            </select>
          </div>
          <div className="field grow">
            <label htmlFor="imp-name">{t('admin.tools.imports.customName')}</label>
            <input id="imp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('admin.tools.imports.customNamePlaceholder')} />
          </div>
        </div>

        <button type="submit" className="btn primary" disabled={busy || !character.trim() || dungeons.size === 0}>
          {busy ? t('admin.tools.imports.searching') : t('admin.tools.imports.find')}
        </button>
      </form>

      <h3 className="tool-section">{t('admin.tools.imports.batches', { count: batches?.length ?? 0 })}</h3>
      {batches?.length === 0 ? (
        <div className="empty">{t('admin.tools.imports.noBatch')}</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('admin.tools.imports.colBatch')}</th>
                <th>{t('admin.tools.imports.colCharacter')}</th>
                <th>{t('admin.tools.imports.colHealer')}</th>
                <th>{t('admin.tools.imports.colSeason')}</th>
                <th>{t('admin.tools.imports.colMinLevel')}</th>
                <th>{t('admin.tools.imports.colImported')}</th>
                <th>{t('admin.tools.imports.colCreated')}</th>
              </tr>
            </thead>
            <tbody>
              {batches?.map((b) => {
                const spec = b.healerSpecId !== null ? specById.get(b.healerSpecId) : undefined;
                const icon = spec ? iconUrl(spec.icon, 18) : null;
                return (
                  <tr key={b.id}>
                    <td><Link to={`/admin/tools/imports/${b.id}`}>{batchLabel(b)}</Link></td>
                    <td className="mono">{characterLabel(b)}</td>
                    <td>
                      {spec ? (
                        <span className="spec" style={{ color: spec.color ?? undefined }}>
                          {icon && <img src={icon} alt="" width={18} height={18} />}
                          {spec.name} {spec.className}
                        </span>
                      ) : <span className="null">-</span>}
                    </td>
                    <td>{b.season}</td>
                    <td className="num">+{b.minLevel}</td>
                    <td className="num">{b.imported} / {b.total}</td>
                    <td>{new Date(b.createdAt).toLocaleString(formatLocale())}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
