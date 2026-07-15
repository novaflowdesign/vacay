import { useEffect, useState } from 'react';
import { formatMoney } from '../lib/format';

const CURRENCIES = ['PLN', 'EUR', 'USD', 'GBP'] as const;
type CurrencyCode = (typeof CURRENCIES)[number];

function formatAmount(n: number): string {
  return n.toFixed(2);
}

export default function CurrencyCalculator() {
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [tableDate, setTableDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [amountA, setAmountA] = useState('100');
  const [amountB, setAmountB] = useState('');
  const [currencyA, setCurrencyA] = useState<CurrencyCode>('EUR');
  const [currencyB, setCurrencyB] = useState<CurrencyCode>('PLN');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('https://api.nbp.pl/api/exchangerates/tables/A/?format=json');
        if (!res.ok) throw new Error('NBP request failed');
        const data = await res.json();
        const table = data[0];

        const map: Record<string, number> = { PLN: 1 };
        for (const r of table.rates as { code: string; mid: number }[]) {
          if (CURRENCIES.includes(r.code as CurrencyCode)) {
            map[r.code] = r.mid;
          }
        }

        if (cancelled) return;
        setRates(map);
        setTableDate(table.effectiveDate);
      } catch {
        if (!cancelled) setError('Nie udało się pobrać kursów walut z NBP. Spróbuj ponownie później.');
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  function convert(amount: number, from: CurrencyCode, to: CurrencyCode): number {
    if (!rates) return 0;
    const pln = from === 'PLN' ? amount : amount * (rates[from] ?? 0);
    return to === 'PLN' ? pln : pln / (rates[to] ?? 1);
  }

  // Recompute the dependent field whenever rates arrive or a currency changes.
  // Amount inputs are handled directly in their own onChange to keep the
  // conversion live on every keystroke without fighting this effect.
  useEffect(() => {
    if (!rates) return;
    const num = Number(amountA);
    if (Number.isFinite(num)) {
      setAmountB(formatAmount(convert(num, currencyA, currencyB)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates, currencyA, currencyB]);

  function handleAmountAChange(value: string) {
    setAmountA(value);
    const num = Number(value);
    if (value === '') {
      setAmountB('');
    } else if (rates && Number.isFinite(num)) {
      setAmountB(formatAmount(convert(num, currencyA, currencyB)));
    }
  }

  function handleAmountBChange(value: string) {
    setAmountB(value);
    const num = Number(value);
    if (value === '') {
      setAmountA('');
    } else if (rates && Number.isFinite(num)) {
      setAmountA(formatAmount(convert(num, currencyB, currencyA)));
    }
  }

  function handleSwap() {
    setCurrencyA(currencyB);
    setCurrencyB(currencyA);
    setAmountA(amountB);
    setAmountB(amountA);
  }

  return (
    <div>
      <div className="card converter">
        <div className="converter__row">
          <input
            type="text"
            inputMode="decimal"
            value={amountA}
            onChange={(e) => handleAmountAChange(e.target.value)}
          />
          <select value={currencyA} onChange={(e) => setCurrencyA(e.target.value as CurrencyCode)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <button type="button" className="converter__swap" onClick={handleSwap} aria-label="Zamień waluty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 4v16M7 20l-3-3M7 20l3-3" />
            <path d="M17 20V4M17 4l3 3M17 4l-3 3" />
          </svg>
        </button>

        <div className="converter__row">
          <input
            type="text"
            inputMode="decimal"
            value={amountB}
            onChange={(e) => handleAmountBChange(e.target.value)}
          />
          <select value={currencyB} onChange={(e) => setCurrencyB(e.target.value as CurrencyCode)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="state-message">{error}</p>}

      <h2 className="section-title">Aktualne kursy</h2>
      <div className="card">
        {!error && !rates && <p className="state-message">Wczytywanie…</p>}
        {rates &&
          CURRENCIES.filter((c) => c !== 'PLN').map((code) => (
            <div key={code} className="info-row">
              <span>{code}</span>
              <span>{formatMoney(rates[code], 'PLN')}</span>
            </div>
          ))}
        {tableDate && <p className="form-hint converter__date">Kurs z dnia: {tableDate} (NBP, tabela A)</p>}
      </div>
    </div>
  );
}
