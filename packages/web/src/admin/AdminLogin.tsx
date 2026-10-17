import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, session } from './api.js';

/** Formulaire de connexion : un seul champ, le mot de passe `ADMIN_PASSWORD`. */
export function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await session.login(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin login">
      <form className="login-box" onSubmit={(e) => void submit(e)}>
        <h1>{t('app.name')}</h1>
        <p className="sub">{t('admin.login.subtitle')}</p>
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label htmlFor="admin-password">{t('admin.login.password')}</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="btn primary" disabled={busy || !password}>
          {busy ? t('admin.login.signingIn') : t('admin.login.signIn')}
        </button>
      </form>
    </div>
  );
}
