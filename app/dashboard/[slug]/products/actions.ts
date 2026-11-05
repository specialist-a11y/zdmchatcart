"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/business";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { cleanVariants } from "@/lib/catalog";

const page = (slug: string) => `/dashboard/${slug}/products`;
const safeName = (n: string) => n.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "photo.jpg";
const newId = () => randomBytes(4).toString("hex");
const db = (supabase: Awaited<ReturnType<typeof requireMembership>>["supabase"]) => (hasServiceRoleKey() ? createAdminClient() : supabase);
const needsMigration = (msg?: string) =>
  msg && /column .*(kind|category|price_note|variants)|schema cache/i.test(msg) ? "The database needs updating first: run supabase/migrations/0012_templates_variants.sql." : msg;

export type ProductInput = {
  id?: string;
  kind: "product" | "service";
  name: string;
  description: string;
  category: string;
  price: string;
  price_note: string;
  stock: string;
  image_url: string;
  active: boolean;
  hasOptions: boolean;
  variants: { id?: string; name: string; price: string; available: boolean }[];
};

/** A one-time signed URL so the browser uploads the product photo straight to storage. */
export async function getProductPhotoUrl(slug: string, fileName: string) {
  const { supabase, business } = await requireMembership(slug);
  const path = `${business.id}/${Date.now()}-${safeName(fileName)}`;
  const store = db(supabase).storage.from("product-images");
  const { data, error } = await store.createSignedUploadUrl(path);
  if (error || !data) return { error: /not found/i.test(error?.message ?? "") ? "Photo storage isn't set up yet: run migration 0012." : error?.message ?? "Couldn't start the upload" };
  return { path, token: data.token, publicUrl: store.getPublicUrl(path).data.publicUrl };
}

export async function saveProduct(slug: string, input: ProductInput) {
  const { supabase, business } = await requireMembership(slug);
  const name = input.name.trim().slice(0, 120);
  if (!name) return { error: "Give it a name." };
  const image = input.image_url.trim();
  if (image && !/^https:\/\//.test(image)) return { error: "Photo links must start with https://" };

  let variants: ReturnType<typeof cleanVariants> = [];
  if (input.hasOptions) {
    variants = cleanVariants(input.variants, newId);
    if ("error" in variants) return { error: variants.error };
    if (!variants.length) return { error: "Add at least one option, or switch options off." };
  }
  const vs = Array.isArray(variants) ? variants : [];
  const basePrice = vs.length ? Math.min(...vs.map((v) => v.price)) : Number(input.price || 0);
  if (!Number.isFinite(basePrice) || basePrice < 0) return { error: "Price must be a number, 0 or more." };
  const stockText = input.stock.trim();
  const stock = input.kind === "service" || stockText === "" ? null : Math.max(0, Math.floor(Number(stockText)));
  if (stock !== null && !Number.isFinite(stock)) return { error: "Stock must be a whole number, or leave it blank." };

  const row = {
    name, kind: input.kind === "service" ? "service" : "product",
    description: input.description.trim().slice(0, 1000) || null,
    category: input.category.trim().slice(0, 40) || null,
    price_note: input.price_note.trim().slice(0, 30) || null,
    price: Math.round(basePrice * 100) / 100, stock, image_url: image || null, active: input.active, variants: vs,
  };
  const client = db(supabase);
  if (input.id) {
    const { error } = await client.from("products").update(row).eq("id", input.id).eq("business_id", business.id);
    if (error) return { error: needsMigration(error.message) };
  } else {
    // New items go to the end of the list.
    const { data: last } = await client.from("products").select("sort_order").eq("business_id", business.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const { error } = await client.from("products").insert({ ...row, business_id: business.id, sort_order: (last?.sort_order ?? 0) + 1 });
    if (error) return { error: needsMigration(error.message) };
  }
  revalidatePath(page(slug));
  revalidatePath(`/s/${slug}`);
  return { ok: true };
}

export async function setActive(slug: string, id: string, active: boolean) {
  const { supabase, business } = await requireMembership(slug);
  await db(supabase).from("products").update({ active }).eq("id", id).eq("business_id", business.id);
  revalidatePath(page(slug));
  revalidatePath(`/s/${slug}`);
}

export async function deleteProduct(slug: string, id: string) {
  const { supabase, business, role } = await requireMembership(slug);
  if (role !== "owner" && role !== "admin") return { error: "Only owners and admins can delete. You can hide it instead." };
  const { error } = await db(supabase).from("products").delete().eq("id", id).eq("business_id", business.id);
  if (error) return { error: error.message };
  revalidatePath(page(slug));
  revalidatePath(`/s/${slug}`);
  return { ok: true };
}

/** Featured items show first on the website, with a Featured label. */
export async function setFeatured(slug: string, id: string, featured: boolean) {
  const { supabase, business } = await requireMembership(slug);
  const { error } = await db(supabase).from("products").update({ featured }).eq("id", id).eq("business_id", business.id);
  if (error) return { error: /featured|schema cache/i.test(error.message) ? "Run supabase/migrations/0014_journeys_quickwins.sql to turn on Featured." : error.message };
  revalidatePath(page(slug));
  revalidatePath(`/s/${slug}`);
  return { ok: true };
}

/** Save the new order after moving items up or down. */
export async function reorder(slug: string, ids: string[]) {
  const { supabase, business } = await requireMembership(slug);
  const client = db(supabase);
  await Promise.all(ids.slice(0, 500).map((id, i) => client.from("products").update({ sort_order: i + 1 }).eq("id", id).eq("business_id", business.id)));
  revalidatePath(page(slug));
  revalidatePath(`/s/${slug}`);
}
