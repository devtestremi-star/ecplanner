import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatLocale } from '../i18n/index.js';
import { api } from './api.js';
import type { Stat } from './types.js';

export function AdminHome() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stat[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.stats().then(setStats).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <div className="page-head">
        <h2>{t('admin.home.title')}</h2>
        <p>
          <Trans i18nKey="admin.home.intro" components={{ code: <code /> }} />
        </p>
      </div>

      {error && <div className="error">{error}</div>}
      {!stats && !error && <p className="null">{t('admin.loading')}</p>}

      <div className="cards">
        {stats?.map((s) => {
          const body = (
            <>
              <div className="n">{s.count.toLocaleString(formatLocale())}</div>
              <div className="l">{s.label}</div>
              <div className="t">{s.key.replace(/-/g, '_')}</div>
            </>
          );
          return s.pivot
            ? <div className="card pivot" key={s.key} title={t('admin.home.pivotHelp')}>{body}</div>
            : <Link className="card" key={s.key} to={`/admin/${s.key}`}>{body}</Link>;
        })}
      </div>
    </>
  );
}
