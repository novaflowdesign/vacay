export interface Balance {
  id: string;
  label: string;
  amount: number; // positive = nadpłacił (wierzyciel), negative = jest winien (dłużnik)
}

export interface Transfer {
  fromId: string;
  fromLabel: string;
  toId: string;
  toLabel: string;
  amount: number;
}

const EPSILON = 0.01;

// Zachłanny algorytm netowania długów: dopasuj największego dłużnika
// z największym wierzycielem, przelew = min(|dług|, wierzytelność), powtarzaj.
export function simplifyDebts(balances: Balance[]): Transfer[] {
  const creditors = balances
    .filter((b) => b.amount > EPSILON)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.amount - a.amount);

  const debtors = balances
    .filter((b) => b.amount < -EPSILON)
    .map((b) => ({ ...b, amount: -b.amount }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.round(Math.min(debtor.amount, creditor.amount) * 100) / 100;

    if (amount > EPSILON) {
      transfers.push({
        fromId: debtor.id,
        fromLabel: debtor.label,
        toId: creditor.id,
        toLabel: creditor.label,
        amount,
      });
    }

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount <= EPSILON) i++;
    if (creditor.amount <= EPSILON) j++;
  }

  return transfers;
}
