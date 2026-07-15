import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { useProfile } from '../../lib/useProfile';
import { withBase } from '../../lib/url';
import CategoriesManager from './CategoriesManager';
import CurrenciesManager from './CurrenciesManager';
import ThemeToggle from './ThemeToggle';

export default function SettingsPanel() {
  const session = useSession();
  const profile = useProfile();
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (session === null) {
      window.location.replace(withBase('/login'));
    }
  }, [session]);

  async function handleLogout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    window.location.replace(withBase('/login'));
  }

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
          <span>{profile?.role === 'admin' ? 'Administrator' : 'Przeglądający'}</span>
        </div>
      </div>

      <ThemeToggle />

      {profile?.role === 'admin' && (
        <>
          <h2 className="section-title">Kategorie wydatków</h2>
          <CategoriesManager />

          <h2 className="section-title">Waluty</h2>
          <CurrenciesManager />
        </>
      )}

      <button className="btn-danger block-add" type="button" onClick={handleLogout} disabled={loggingOut}>
        {loggingOut ? 'Wylogowywanie…' : 'Wyloguj'}
      </button>
    </div>
  );
}
