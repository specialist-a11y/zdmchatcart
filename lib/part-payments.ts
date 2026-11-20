/**
 * Part payments: the owner records what actually arrived. Amounts in cents to avoid rounding drift.
 * Pure (no server imports) so it can be tested.
 */
export type PaymentMethod = "transfer" | "cash" | "card";
export const METHOD_LABEL: Record<PaymentMethod, string> = { transfer: "1st Pay / bank transfer", cash: "Cash", card: "Card" };

const c = (n: number | string | null | undefined) => Math.round(Number(n ?? 0) * 100);

/** What's left to pay on an order. */
export function balanceDue(total: number | string, paid: number | string | null | undefined) {
  return Math.max(0, c(total) - c(paid)) / 100;
}

/** Check an amount the owner typed against the balance, and work out the new totals. */
export function applyPayment(total: number | string, paidSoFar: number | string | null | undefined, raw: string | number) {
  const amount = c(String(raw).replace(/[^0-9.]/g, ""));
  const due = c(total) - c(paidSoFar);
  if (!(amount > 0)) return { error: "Enter the amount you received" } as const;
  if (due <= 0) return { error: "This order is already paid in full" } as const;
  if (amount > due) return { error: `That's more than the balance of ${(due / 100).toFixed(2)}. Enter ${(due / 100).toFixed(2)} or less.` } as const;
  const paid = c(paidSoFar) + amount;
  return { amount: amount / 100, paid: paid / 100, balance: (c(total) - paid) / 100, full: paid >= c(total) } as const;
}
