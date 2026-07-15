import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatMoney } from '../../lib/format';
import { simplifyDebts, type Balance, type Transfer } from '../../lib/debtSimplify';
import { colorForCategory } from '../../lib/categoricalPalette';
import type { TripBalanceRow } from '../../lib/types';
import DonutChart from './DonutChart';

interface SummaryTabProps {
  tripId: string;
}

interface CategorySlice {
  name: string;
  icon: string | null;
  total: number;
}

interface CurrencySummary {
  currency: string;
  totalSpent: number;
  balances: Balance[];
  transfers: Transfer[];
  categorySlices: CategorySlice[];
}

export default function SummaryTab({ tripId }: SummaryTabProps) {
  const [summaries, setSummaries] = useState<CurrencySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [{ data: balanceRows, error: balanceError }, { data: expenseRows }] = await Promise.all([
        supabase.from('trip_balances').select('*').eq('trip_id', tripId),
        supabase.from('expenses').select('total_amount, currency, expense_categories(name, icon)').eq('trip_id', tripId),
      ]);

      if (cancelled) return;

      if (balanceError) {
        setError('Nie udało się wczytać podsumowania.');
        return;
      }

      const currencies = new Set<string>();
      for (const row of (balanceRows ?? []) as TripBalanceRow[]) currencies.add(row.currency);
      for (const row of (expenseRows ?? []) as any[]) currencies.add(row.currency);

      const result: CurrencySummary[] = [...currencies].sort().map((currency) => {
        const namedBalances: Balance[] = ((balanceRows ?? []) as TripBalanceRow[])
          .filter((b) => b.currency === currency)
          .map((b) => {
            const label = b.payer_label ?? 'Nieznany płatnik';
            return { id: label, label, amount: b.total_balance };
          });

        const slicesMap = new Map<string, CategorySlice>();
        let totalSpent = 0;
        for (const row of (expenseRows ?? []) as any[]) {
          if (row.currency !== currency) continue;
          totalSpent += row.total_amount;
          const name = row.expense_categories?.name ?? 'Inne';
          const icon = row.expense_categories?.icon ?? null;
          const existing = slicesMap.get(name);
          if (existing) {
            existing.total += row.total_amount;
          } else {
            slicesMap.set(name, { name, icon, total: row.total_amount });
          }
        }

        return {
          currency,
          totalSpent,
          balances: namedBalances,
          transfers: simplifyDebts(namedBalances),
          categorySlices: [...slicesMap.values()].sort((a, b) => b.total - a.total),
        };
      });

      setSummaries(result);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  if (error) {
    return <p className="state-message">{error}</p>;
  }

  if (summaries === null) {
    return <p className="state-message">Wczytywanie…</p>;
  }

  if (summaries.length === 0) {
    return <p className="state-message">Brak wydatków w tym wyjeździe.</p>;
  }

  return (
    <div>
      {summaries.map((s) => (
        <div key={s.currency} className="currency-summary">
          <h2 className="currency-summary__title">{s.currency}</h2>

          <DonutChart
            total={s.totalSpent}
            currency={s.currency}
            slices={s.categorySlices.map((c) => ({
              label: c.name,
              icon: c.icon,
              value: c.total,
              color: colorForCategory(c.name),
            }))}
          />

          <div className="card summary-total">
            <span>Suma całkowita</span>
            <strong>{formatMoney(s.totalSpent, s.currency)}</strong>
          </div>

          <h3 className="section-title">Kto komu ile</h3>
          {s.transfers.length === 0 ? (
            <p className="state-message">Wszystkie salda są wyrównane.</p>
          ) : (
            <div className="card">
              {s.transfers.map((t, i) => (
                <div key={i} className="transfer-row">
                  <span>{t.fromLabel}</span>
                  <span className="transfer-row__arrow">→</span>
                  <span>{t.toLabel}</span>
                  <strong className="transfer-row__amount">{formatMoney(t.amount, s.currency)}</strong>
                </div>
              ))}
            </div>
          )}

          <h3 className="section-title">Salda</h3>
          <div className="card">
            {s.balances.map((b) => (
              <div key={b.id} className="balance-row">
                <span>{b.label}</span>
                <span className={b.amount >= 0 ? 'balance-row__positive' : 'balance-row__negative'}>
                  {b.amount >= 0 ? '+' : ''}
                  {formatMoney(b.amount, s.currency)}
                </span>
              </div>
            ))}
          </div>

          <h3 className="section-title">Wg kategorii</h3>
          {s.categorySlices.length === 0 ? (
            <p className="state-message">Brak wydatków.</p>
          ) : (
            <div className="card category-bars">
              {s.categorySlices.map((c) => {
                const max = Math.max(1, ...s.categorySlices.map((slice) => slice.total));
                return (
                  <div key={c.name} className="category-bar">
                    <div className="category-bar__label">
                      <span>
                        {c.icon ?? '🛒'} {c.name}
                      </span>
                      <span>{formatMoney(c.total, s.currency)}</span>
                    </div>
                    <div className="category-bar__track">
                      <div className="category-bar__fill" style={{ width: `${(c.total / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
