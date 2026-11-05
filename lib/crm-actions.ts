import "server-only";
import { redirect } from "next/navigation";
import { requireMembership } from "./business";
import { createAdminClient, hasServiceRoleKey } from "./supabase/admin";

/** For server actions that change data: owner, admin or ZDMINC staff only. Returns a client that can write. */
export async function requireEditor(slug: string, back?: string) {
  const ctx = await requireMembership(slug);
  if (ctx.role === "staff") redirect(`${back ?? `/dashboard/${slug}`}${(back ?? "").includes("?") ? "&" : "?"}msg=${encodeURIComponent("Only the owner or an admin can change this")}`);
  return { ...ctx, db: hasServiceRoleKey() ? createAdminClient() : ctx.supabase };
}

export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Redirect back with a short message. */
export function back(path: string, msg?: string | null): never {
  if (!msg) redirect(path);
  const [base, hash] = path.split("#");
  redirect(`${base}${base.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}${hash ? `#${hash}` : ""}`);
}

/** Turn "column does not exist" style errors into the migration to run. */
export function migrationHint(msg: string | undefined | null, file = "0014_journeys_quickwins.sql") {
  if (!msg) return msg;
  return /column|relation|schema cache|does not exist|Could not find/i.test(msg) ? `The database needs updating first: run supabase/migrations/${file}.` : msg;
}
