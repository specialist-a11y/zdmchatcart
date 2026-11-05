"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/business";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { TEMPLATES } from "@/lib/catalog";

/** Save the website template and cover photo. Owners and admins only. */
export async function saveLook(slug: string, input: { template: string; heroUrl: string; headline: string; subheadline: string; text: string }) {
  const { supabase, business, role } = await requireMembership(slug);
  if (role !== "owner" && role !== "admin") return { error: "Only owners and admins can change the website." };
  if (!TEMPLATES.some((t) => t.id === input.template)) return { error: "Unknown template" };
  const hero = input.heroUrl.trim();
  if (hero && !/^https:\/\//.test(hero)) return { error: "The cover photo link must start with https://" };
  const headline = input.headline.trim(), subheadline = input.subheadline.trim(), text = input.text.trim();
  if (headline.length > 120) return { error: "Keep the headline under 120 characters." };
  if (subheadline.length > 200) return { error: "Keep the sub-headline under 200 characters." };
  if (text.length > 600) return { error: "Keep the paragraph under 600 characters." };
  const client = hasServiceRoleKey() ? createAdminClient() : supabase;
  const { error } = await client.from("businesses").update({
    site_template: input.template, hero_image_url: hero || null,
    hero_headline: headline || null, hero_subheadline: subheadline || null, hero_text: text || null,
  }).eq("id", business.id);
  if (error) {
    const m = error.message;
    if (/hero_headline|hero_subheadline|hero_text/i.test(m)) return { error: "The database needs updating first: run supabase/migrations/0013_hero_text.sql." };
    if (/site_template|hero_image_url|schema cache/i.test(m)) return { error: "The database needs updating first: run supabase/migrations/0012_templates_variants.sql." };
    return { error: m };
  }
  revalidatePath(`/dashboard/${slug}/website`);
  revalidatePath(`/s/${slug}`);
  return { ok: true };
}
