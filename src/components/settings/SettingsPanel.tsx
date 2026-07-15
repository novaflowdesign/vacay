import { useEffect } from 'react';
import { useSession } from '../../lib/useSession';
import { useProfile } from '../../lib/useProfile';
import { withBase } from '../../lib/url';
import CategoriesManager from './CategoriesManager';
import CurrenciesManager from './CurrenciesManager';

export default function SettingsPanel() {
  const session = useSession();
  const profile = useProfile();

  useEffect(() => {
    if (session === null) {
      window.location.replace(withBase('/login'));
    }
  }, [session]);

  if (session === undefined || profile === undefined) {
    return <p className="state-message">Wczytywanie…</p>;
  }

  if (!session) {
    return null;
  }

  return (
    <div>
      <div className="card">
        <div className="info-row">
          <span>Zalogowany jako</span>
          <span>{profile?.display_name ?? session.user.email}</span>
        </div>
        <div className="info-row">
          <span>Rola</span>
          <span>{profile?.role === 'admin' ? 'Administrator' : 'Podgląd'}</span>
        </div>
      </div>

      {profile?.role === 'admin' && (
        <>
          <h2 className="section-title">Kategorie wydatków</h2>
          <CategoriesManager />

          <h2 className="section-title">Waluty</h2>
          <CurrenciesManager />
        </>
      )}
    </div>
  );
}
