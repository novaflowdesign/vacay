import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatMoney } from '../../lib/format';
import type { Expense, ExpenseCategory, ExpensePayment, TripParticipant } from '../../lib/types';
import ExpenseForm from './ExpenseForm';

const FALLBACK_CURRENCIES = ['PLN'];

interface ExpenseWithJoins extends Expense {
  expense_categories: { name: string; icon: string | null } | null;
  expense_payments: ExpensePayment[];
}

interface ExpensesTabProps {
  tripId: string;
  participants: TripParticipant[];
  isAdmin: boolean;
}

type FormMode = { mode: 'create' } | { mode: 'edit'; expense: ExpenseWithJoins } | null;

function payerName(payment: ExpensePayment): string {
  return payment.payer_label ?? 'Nieznany';
}

export default function ExpensesTab({ tripId, participants, isAdmin }: ExpensesTabProps) {
  const [expenses, setExpenses] = useState<ExpenseWithJoins[] | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [currencies, setCurrencies] = useState<string[]>(FALLBACK_CURRENCIES);
  const [error, setError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>(null);

  async function loadExpenses() {
    const { data, error: fetchError } = await supabase
      .from('expenses')
      .select('*, expense_categories(name, icon), expense_payments(*)')
      .eq('trip_id', tripId)
      .order('expense_date', { ascending: false });

    if (fetchError) {
      setError('Nie udało się wczytać wydatków.');
      return;
    }
    setExpenses((data as unknown as ExpenseWithJoins[]) ?? []);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [{ data: categoriesData }, { data: currenciesData }] = await Promise.all([
        supabase.from('expense_categories').select('*').order('name'),
        supabase.from('currencies').select('code').order('code'),
      ]);
      if (cancelled) return;
      setCategories((categoriesData as ExpenseCategory[]) ?? []);
      const codes = (currenciesData ?? []).map((c) => c.code);
      setCurrencies(codes.length > 0 ? codes : FALLBACK_CURRENCIES);
      await loadExpenses();
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  async function handleDelete(expenseId: string) {
    if (!window.confirm('Usunąć ten wydatek?')) return;
    const { error: deleteError } = await supabase.from('expenses').delete().eq('id', expenseId);
    if (deleteError) {
      setError('Nie udało się usunąć wydatku.');
      return;
    }
    setExpenses((prev) => prev?.filter((e) => e.id !== expenseId) ?? null);
  }

  if (formMode) {
    return (
      <ExpenseForm
        tripId={tripId}
        participants={participants}
        categories={categories}
        currencies={currencies}
        expense={formMode.mode === 'edit' ? formMode.expense : undefined}
        existingPayments={formMode.mode === 'edit' ? formMode.expense.expense_payments : undefined}
        onDone={() => {
          setFormMode(null);
          loadExpenses();
        }}
        onCancel={() => setFormMode(null)}
      />
    );
  }

  return (
    <div>
      {isAdmin && (
        <button className="btn-primary trip-list__add" type="button" onClick={() => setFormMode({ mode: 'create' })}>
          + Dodaj wydatek
        </button>
      )}

      {error && <p className="state-message">{error}</p>}

      {!error && expenses === null && <p className="state-message">Wczytywanie…</p>}

      {!error && expenses && expenses.length === 0 && (
        <p className="state-message">Brak wydatków w tym wyjeździe.</p>
      )}

      {!error &&
        expenses &&
        expenses.map((exp) => (
          <div key={exp.id} className="card expense-tile">
            <div className="expense-tile__top">
              <span className="expense-tile__name">{exp.description}</span>
              <span className="expense-tile__amount">{formatMoney(exp.total_amount, exp.currency)}</span>
            </div>
            <div className="expense-tile__badges">
              <span className="expense-tile__category-pill">
                {exp.expense_categories?.icon ?? '🛒'} {exp.expense_categories?.name ?? 'Inne'}
              </span>
              {exp.is_personal && <span className="expense-tile__badge">osobisty</span>}
            </div>
            <div className="expense-tile__meta">
              {new Date(exp.expense_date).toLocaleDateString('pl-PL')}
              {!exp.is_personal && <> · {exp.total_people} os.</>}
            </div>
            <div className="expense-tile__payers">
              {exp.is_personal ? (
                <span className="expense-tile__payer">Kupujący: {payerName(exp.expense_payments[0])}</span>
              ) : (
                exp.expense_payments.map((p) => (
                  <span key={p.id} className="expense-tile__payer">
                    {payerName(p)}: {formatMoney(p.amount_paid, exp.currency)}
                  </span>
                ))
              )}
            </div>
            {isAdmin && (
              <div className="trip-tile__actions">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setFormMode({ mode: 'edit', expense: exp });
                  }}
                >
                  Edytuj
                </a>
                <button type="button" onClick={() => handleDelete(exp.id)}>
                  Usuń
                </button>
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
