import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { formatMoney } from '../../lib/format';
import type { Expense, ExpenseCategory, ExpensePayment, TripParticipant } from '../../lib/types';

interface PayerRow {
  localId: string;
  participantId: string;
  amountPaid: string;
  peopleCovered: string;
}

interface ExpenseFormProps {
  tripId: string;
  participants: TripParticipant[];
  categories: ExpenseCategory[];
  currencies: string[];
  expense?: Expense;
  existingPayments?: ExpensePayment[];
  onDone: () => void;
  onCancel: () => void;
}

let localIdCounter = 0;
function nextLocalId() {
  localIdCounter += 1;
  return `row-${localIdCounter}`;
}

// expense_payments przechowuje płatnika jako wolny tekst (payer_label) — jedyne
// konto w systemie to admin, uczestnicy to tylko imiona, nie konta. Dopasowanie
// po imieniu pozwala przy edycji z powrotem zaznaczyć właściwego uczestnika na liście.
function toPayerRows(payments: ExpensePayment[], participants: TripParticipant[], fallbackId: string): PayerRow[] {
  return payments.map((p) => ({
    localId: nextLocalId(),
    participantId: participants.find((participant) => participant.name === p.payer_label)?.id ?? fallbackId,
    amountPaid: String(p.amount_paid),
    peopleCovered: String(p.people_covered),
  }));
}

export default function ExpenseForm({
  tripId,
  participants,
  categories,
  currencies,
  expense,
  existingPayments,
  onDone,
  onCancel,
}: ExpenseFormProps) {
  const session = useSession();
  const firstParticipantId = participants[0]?.id ?? '';

  const [expenseName, setExpenseName] = useState(expense?.description ?? '');
  const [categoryId, setCategoryId] = useState(expense?.category_id ?? '');
  const [currency, setCurrency] = useState(expense?.currency ?? currencies[0] ?? 'PLN');
  const [totalAmount, setTotalAmount] = useState(expense ? String(expense.total_amount) : '');
  const [expenseDate, setExpenseDate] = useState(
    expense?.expense_date ?? new Date().toISOString().slice(0, 10)
  );
  const [isPersonal, setIsPersonal] = useState(expense?.is_personal ?? false);
  const [personalPayerId, setPersonalPayerId] = useState(
    (isPersonal &&
      participants.find((p) => p.name === existingPayments?.[0]?.payer_label)?.id) ||
      firstParticipantId
  );
  const [payers, setPayers] = useState<PayerRow[]>(
    existingPayments && existingPayments.length > 0 && !expense?.is_personal
      ? toPayerRows(existingPayments, participants, firstParticipantId)
      : [{ localId: nextLocalId(), participantId: firstParticipantId, amountPaid: '', peopleCovered: '1' }]
  );

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totalAmountNum = Number(totalAmount) || 0;
  const amountSum = Math.round(payers.reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0) * 100) / 100;
  const amountDiff = Math.round((totalAmountNum - amountSum) * 100) / 100;
  const amountMismatch = Math.abs(amountDiff) > 0.01;
  // Liczba osób, na które dzielony jest wydatek, wynika z sumy "za ile osób"
  // zadeklarowanych przez płatników — nie jest osobnym polem do wypełnienia.
  const totalPeople = payers.reduce((sum, p) => sum + (Number(p.peopleCovered) || 0), 0);

  function updatePayer(localId: string, patch: Partial<PayerRow>) {
    setPayers((prev) => prev.map((p) => (p.localId === localId ? { ...p, ...patch } : p)));
  }

  function addPayer() {
    setPayers((prev) => [
      ...prev,
      { localId: nextLocalId(), participantId: firstParticipantId, amountPaid: '', peopleCovered: '1' },
    ]);
  }

  function nameFor(participantId: string): string {
    return participants.find((p) => p.id === participantId)?.name ?? 'Nieznany';
  }

  function removePayer(localId: string) {
    setPayers((prev) => prev.filter((p) => p.localId !== localId));
  }

  function shareFor(row: PayerRow) {
    if (totalPeople <= 0) return 0;
    return Math.round((totalAmountNum * (Number(row.peopleCovered) || 0)) / totalPeople * 100) / 100;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!expenseName.trim()) {
      setError('Nazwa wydatku jest wymagana.');
      return;
    }
    if (totalAmountNum <= 0) {
      setError('Kwota całkowita musi być większa od zera.');
      return;
    }
    if (participants.length === 0) {
      setError('Ten wyjazd nie ma przypisanych uczestników — dodaj ich w edycji wyjazdu.');
      return;
    }
    if (!isPersonal) {
      if (payers.length === 0) {
        setError('Dodaj co najmniej jedną osobę.');
        return;
      }
      if (totalPeople < 1) {
        setError('Liczba osób musi wynosić co najmniej 1.');
        return;
      }
      if (amountMismatch) {
        setError('Suma wpłat musi być równa kwocie całkowitej.');
        return;
      }
    }

    setSaving(true);

    const payload = {
      trip_id: tripId,
      description: expenseName.trim(),
      category_id: categoryId || null,
      total_amount: totalAmountNum,
      currency,
      total_people: isPersonal ? 1 : totalPeople,
      is_personal: isPersonal,
      expense_date: expenseDate,
    };

    let expenseId = expense?.id ?? null;

    if (expenseId) {
      const { error: updateError } = await supabase.from('expenses').update(payload).eq('id', expenseId);
      if (updateError) {
        setSaving(false);
        setError('Nie udało się zapisać zmian.');
        return;
      }
      await supabase.from('expense_payments').delete().eq('expense_id', expenseId);
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('expenses')
        .insert({ ...payload, created_by: session?.user.id })
        .select()
        .single();

      if (insertError || !inserted) {
        setSaving(false);
        setError('Nie udało się dodać wydatku.');
        return;
      }
      expenseId = inserted.id;
    }

    const paymentRows = isPersonal
      ? [{ expense_id: expenseId, payer_profile_id: null, payer_label: nameFor(personalPayerId), amount_paid: totalAmountNum, people_covered: 1 }]
      : payers.map((p) => ({
          expense_id: expenseId,
          payer_profile_id: null,
          payer_label: nameFor(p.participantId),
          amount_paid: Number(p.amountPaid) || 0,
          people_covered: Number(p.peopleCovered) || 1,
        }));

    const { error: paymentsError } = await supabase.from('expense_payments').insert(paymentRows);

    setSaving(false);

    if (paymentsError) {
      setError('Wydatek zapisany, ale nie udało się zapisać osób.');
      return;
    }

    onDone();
  }

  if (participants.length === 0) {
    return <p className="state-message">Ten wyjazd nie ma przypisanych uczestników — dodaj ich w edycji wyjazdu.</p>;
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="expenseName">Nazwa wydatku</label>
        <input
          id="expenseName"
          type="text"
          required
          placeholder="np. Kolacja w restauracji"
          value={expenseName}
          onChange={(e) => setExpenseName(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="category">Kategoria</label>
        <select id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Brak kategorii</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon ? `${c.icon} ` : ''}
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="amount-row">
        <div>
          <label htmlFor="amount">Kwota całkowita</label>
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            required
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="currency">Waluta</label>
          <select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="date">Data</label>
        <input id="date" type="date" required value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
      </div>

      <label className={`personal-toggle ${isPersonal ? 'personal-toggle--active' : ''}`}>
        <input type="checkbox" checked={isPersonal} onChange={(e) => setIsPersonal(e.target.checked)} />
        Wydatek osobisty
      </label>

      {isPersonal ? (
        <div>
          <label htmlFor="personalPayer">Kto kupił</label>
          <select
            id="personalPayer"
            value={personalPayerId}
            onChange={(e) => setPersonalPayerId(e.target.value)}
          >
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="payer-section">
          <label>Osoby</label>
          <div className="payer-list">
            {payers.map((row) => (
              <div key={row.localId} className="payer-row">
                <select
                  value={row.participantId}
                  onChange={(e) => updatePayer(row.localId, { participantId: e.target.value })}
                >
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <div className="payer-row__numbers">
                  <label>
                    Wpłacił
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={row.amountPaid}
                      onChange={(e) => updatePayer(row.localId, { amountPaid: e.target.value })}
                    />
                  </label>
                  <label>
                    Liczba osób
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="1"
                      value={row.peopleCovered}
                      onChange={(e) => updatePayer(row.localId, { peopleCovered: e.target.value })}
                    />
                  </label>
                </div>

                <div className="payer-row__share">
                  jego udział: {formatMoney(shareFor(row), currency)}
                  {' · '}
                  {(Number(row.amountPaid) || 0) - shareFor(row) >= 0 ? (
                    <>nadpłacił: {formatMoney(Math.round(((Number(row.amountPaid) || 0) - shareFor(row)) * 100) / 100, currency)}</>
                  ) : (
                    <>jeszcze musi oddać: {formatMoney(Math.round((shareFor(row) - (Number(row.amountPaid) || 0)) * 100) / 100, currency)}</>
                  )}
                </div>

                <button type="button" className="payer-row__remove" onClick={() => removePayer(row.localId)}>
                  Usuń osobę
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn-secondary" onClick={addPayer}>
            + Dodaj osobę
          </button>

          <p className="form-hint">Wydatek dzielony na: {totalPeople} {totalPeople === 1 ? 'osobę' : 'osób'}</p>

          <p className={amountMismatch ? 'amount-summary amount-summary--error' : 'amount-summary amount-summary--ok'}>
            Suma wpłat: {formatMoney(amountSum, currency)} / {formatMoney(totalAmountNum, currency)}
            {amountMismatch
              ? amountDiff > 0
                ? ` (brakuje ${formatMoney(amountDiff, currency)})`
                : ` (nadwyżka ${formatMoney(-amountDiff, currency)})`
              : ' ✓'}
          </p>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? 'Zapisywanie…' : expense ? 'Zapisz zmiany' : 'Dodaj wydatek'}
        </button>
        <button className="btn-secondary" type="button" onClick={onCancel} disabled={saving}>
          Anuluj
        </button>
      </div>
    </form>
  );
}
