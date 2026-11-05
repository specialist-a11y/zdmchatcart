"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/business";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { TEMPLATES } from "@/lib/catalog";

/** Save the website template and cover photo. Owners and admins only. */
export async function saveLook(slug: string, input: { template: string; heroUrl: string }) {
  const { supabase, business, role } = await requireMembership(slug);
  if (role !== "owner" && role !== "admin") return { error: "Only owners and admins can change the website." };
  if (!TEMPLATES.some((t) => t.id === input.template)) return { error: "Unknown template" };
  const hero = input.heroUrl.trim();
  if (hero && !/^https:\/\//.test(hero)) return { error: "The cover photo link must start with https://" };
  const client = hasServiceRoleKey() ? createAdminClient() : supabase;
  const { error } = await client.from("businesses").update({ site_template: input.template, hero_image_url: hero || null }).eq("id", business.id);
  if (error) return { error: /site_template|hero_image_url|schema cache/i.test(error.message) ? "The database needs updating first: run supabase/migrations/0012_templates_variants.sql." : error.message };
  revalidatePath(`/dashboard/${slug}/website`);
  revalidatePath(`/s/${slug}`);
  return { ok: true };
}
