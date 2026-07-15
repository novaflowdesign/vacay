import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Currency } from '../../lib/types';

function isRealCurrencyCode(code: string): boolean {
  try {
    new Intl.NumberFormat('pl-PL', { style: 'currency', currency: code }).format(0);
    return true;
  } catch {
    return false;
  }
}

export default function CurrenciesManager() {
  const [currencies, setCurrencies] = useState<Currency[] | null>(null);
  const [newCode, setNewCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from('currencies').select('*').order('code');
    setCurrencies((data as Currency[]) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const code = newCode.trim().toUpperCase();
    if (!code) return;

    if (code.length !== 3 || !isRealCurrencyCode(code)) {
      setError(`"${code}" nie jest prawidłowym kodem waluty (ISO 4217, np. EUR, USD, GBP).`);
      return;
    }

    const { error: insertError } = await supabase.from('currencies').insert({ code });

    if (insertError) {
      setError('Nie udało się dodać waluty (może już istnieje?).');
      return;
    }

    setNewCode('');
    load();
  }

  async function handleDelete(code: string) {
    if (!window.confirm(`Usunąć walutę ${code}?`)) return;

    const { error: deleteError } = await supabase.from('currencies').delete().eq('code', code);

    if (deleteError) {
      setError('Nie można usunąć tej waluty — jest używana w wydatkach.');
      return;
    }

    load();
  }

  if (currencies === null) {
    return <p className="state-message">Wczytywanie…</p>;
  }

  return (
    <div>
      <div className="card settings-list">
        {currencies.length === 0 && <p className="state-message">Brak walut.</p>}
        {currencies.map((c) => (
          <div key={c.code} className="settings-row">
            <span className="settings-row__label">{c.code}</span>
            <button type="button" onClick={() => handleDelete(c.code)}>
              Usuń
            </button>
          </div>
        ))}
      </div>

      <form className="form settings-add-form settings-add-form--inline" onSubmit={handleAdd}>
        <input
          type="text"
          className="settings-row__currency-input"
          placeholder="EUR"
          maxLength={3}
          value={newCode}
          onChange={(e) => setNewCode(e.target.value.toUpperCase())}
        />
        <button className="btn-primary" type="submit">
          + Dodaj walutę
        </button>
      </form>

      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
