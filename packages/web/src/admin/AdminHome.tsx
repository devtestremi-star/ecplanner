import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import type { Stat } from './types.js';

export function AdminHome() {
  const [stats, setStats] = useState<Stat[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.stats().then(setStats).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <div className="page-head">
        <h2>Tableau de bord</h2>
        <p>
          Les 9 tables du schéma. Les deux tables pivot (en pointillé) n'ont pas de page à elles :
          elles s'éditent depuis la fiche de leur parent — un <code>spell_spec</code> sans son sort
          ne veut rien dire.
        </p>
      </div>

      {error && <div className="error">{error}</div>}
      {!stats && !error && <p className="null">Chargement…</p>}

      <div className="cards">
        {stats?.map((s) => {
          const body = (
            <>
              <div className="n">{s.count.toLocaleString('fr-CA')}</div>
              <div className="l">{s.label}</div>
              <div className="t">{s.key.replace(/-/g, '_')}</div>
            </>
          );
          return s.pivot
            ? <div className="card pivot" key={s.key} title="Éditée depuis sa table parente">{body}</div>
            : <Link className="card" key={s.key} to={`/admin/${s.key}`}>{body}</Link>;
        })}
      </div>
    </>
  );
}
