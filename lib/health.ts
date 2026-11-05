/** Token and connection health. Pure, no I/O. */

export type TokenInfo = { is_valid?: boolean; expires_at?: number; data_access_expires_at?: number; error?: string };
export type TokenState = { state: "ok" | "soon" | "expired" | "unknown"; days: number | null; label: string };

const DAY = 86_400_000;

/**
 * Meta's debug_token answer turned into a plain state. expires_at 0 means the token never expires;
 * data_access_expires_at is when Meta stops sharing data unless the owner logs in again (about 90 days).
 */
export function tokenState(info: TokenInfo | null | undefined, now = Date.now(), warnDays = 14): TokenState {
  if (!info || info.error) return { state: "unknown", days: null, label: "Couldn't check" };
  if (info.is_valid === false) return { state: "expired", days: 0, label: "Stopped working. Reconnect it." };
  const ends = [info.expires_at, info.data_access_expires_at].filter((t): t is number => !!t && t > 0).map((t) => t * 1000);
  if (!ends.length) return { state: "ok", days: null, label: "Working, doesn't expire" };
  const soonest = Math.min(...ends);
  const days = Math.floor((soonest - now) / DAY);
  if (soonest <= now) return { state: "expired", days: 0, label: "Expired. Reconnect it." };
  if (days <= warnDays) return { state: "soon", days, label: days <= 0 ? "Expires today" : `Expires in ${days} day${days === 1 ? "" : "s"}` };
  return { state: "ok", days, label: `Working, renews in ${days} days` };
}

/** Low wallet: under BBD 50, or less than 3 days of the monthly ad budget. */
export function walletLow(balance: number, monthlyBudget: number | null | undefined) {
  const threeDays = monthlyBudget ? (Number(monthlyBudget) / 30) * 3 : 0;
  return balance < Math.max(50, threeDays);
}
