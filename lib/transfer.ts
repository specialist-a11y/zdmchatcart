/** Bank transfer rules (pure, tested). The owner always confirms; a screenshot is never proof by itself. */

/** `amount` is already formatted, e.g. money(total, currency). */
export function transferInstructions(o: { code: string; amount: string }, bankDetails: string, cardLink?: string | null) {
  const lines = [
    `To pay order ${o.code} by bank transfer (1st Pay or any bank):`,
    "",
    bankDetails.trim(),
    "",
    `Amount: ${o.amount}`,
    `Reference: ${o.code}`,
    "",
    "When it's sent, reply here with the screenshot or the transfer reference number. We'll confirm once it shows in our account and send your receipt.",
  ];
  if (cardLink) lines.push("", `Prefer card? Pay here instead: ${cardLink}`);
  return lines.join("\n");
}

/** Customer asks to pay by transfer: "transfer", "bank transfer", "1st pay", "first pay". */
export const wantsTransfer = (t: string) => /^\s*(bank\s+)?transfer\b|\b(1st|first)\s*pay\b/i.test(t);

/** "Done", "paid", "sent it" with no reference. */
export const claimsPaid = (t: string) => /^\s*(done|paid|sent|i('ve| have)? (paid|sent)|transferred|sent it|it'?s sent)\b/i.test(t);

/** A transfer reference: a run of 5 to 30 letters and digits containing at least 4 digits, e.g. "Ref 88231-AB" or "TRX0042183". */
export function findReference(t: string): string | null {
  for (const m of t.matchAll(/[A-Za-z0-9][A-Za-z0-9-]{4,29}/g)) {
    const s = m[0];
    if ((s.match(/\d/g) ?? []).length >= 4 && !/^\d{1,3}(\.\d{2})?$/.test(s)) return s.toUpperCase();
  }
  return null;
}

export const proofPath = (businessId: string, orderId: string, ext: string) =>
  `${businessId}/${orderId}/${Date.now()}.${ext.replace(/[^a-z0-9]/gi, "").slice(0, 5) || "jpg"}`;
