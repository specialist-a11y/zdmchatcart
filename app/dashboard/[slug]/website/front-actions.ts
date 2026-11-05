"use server";

import { revalidatePath } from "next/cache";
import { back, requireEditor, str } from "@/lib/crm-actions";
import { slugifyCode, validCode } from "@/lib/links";

const page = (slug: string) => `/dashboard/${slug}/website`;

/** Theme, specials strip and announcement bar. */
export async function saveShopFront(f: FormData) {
  const slug = str(f, "slug");
  const { db, business } = await requireEditor(slug, page(slug));
  const theme = str(f, "theme");
  const ends = str(f, "special_ends");
  const { error } = await db.from("businesses").update({
    shop_theme: ["warm", "fresh", "bold", "minimal"].includes(theme) ? theme : null,
    special_text: str(f, "special_text").slice(0, 160) || null,
    // The date picker gives Barbados time; store it as UTC (UTC-4, no daylight saving).
    special_ends_at: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(ends) ? new Date(`${ends}:00-04:00`).toISOString() : null,
    announcement: f.get("announce_on") === "on" ? str(f, "announcement").slice(0, 160) || null : null,
  }).eq("id", business.id);
  revalidatePath(page(slug));
  revalidatePath(`/s/${slug}`);
  back(`${page(slug)}#front`, error ? "This needs a database update: run supabase/migrations/0016_shop_front.sql." : "Saved. Your shop shows it now.");
}

/** "Make a link for today's post": one short name, tracked as its own code. */
export async function quickLink(f: FormData) {
  const slug = str(f, "slug");
  const { db, business } = await requireEditor(slug, page(slug));
  let code = slugifyCode(str(f, "code"));
  if (!validCode(code)) back(`${page(slug)}#today`, "Use 2 to 40 letters, numbers or dashes, like rumcake");
  const label = str(f, "label").slice(0, 80) || `Post ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "America/Barbados" })}`;
  for (let i = 2; i < 30; i++) {
    const { error } = await db.from("short_links").insert({ business_id: business.id, code, label, ref: code.toUpperCase().slice(0, 40) });
    if (!error) {
      revalidatePath(page(slug));
      back(`${page(slug)}?made=${code}#today`, null);
    }
    if (error.code !== "23505") back(`${page(slug)}#today`, error.message);
    code = `${code.replace(/-\d+$/, "").slice(0, 36)}-${i}`;
  }
  back(`${page(slug)}#today`, "Try a different short name");
}
