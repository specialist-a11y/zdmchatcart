import Link from "next/link";
import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import { requireMembership } from "@/lib/business";
import ProductEditor, { type Item } from "./ProductEditor";

export default async function ProductsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { slug } = await params;
  const { msg } = await searchParams;
  const { supabase, business, role } = await requireMembership(slug);
  let { data: products, error } = await supabase.from("products").select("*").eq("business_id", business.id).order("sort_order").order("created_at");
  if (error) products = [];
  const { data: biz } = await supabase.from("businesses").select("site_template").eq("id", business.id).maybeSingle();

  const items: Item[] = (products ?? []).map((p: any) => ({
    id: p.id, kind: p.kind ?? "product", name: p.name, description: p.description, category: p.category ?? null,
    price: Number(p.price), price_note: p.price_note ?? null, stock: p.stock, image_url: p.image_url, active: p.active, variants: p.variants ?? [], featured: !!p.featured,
    images: p.images ?? [], ready_days: p.ready_days ?? [], lead_days: p.lead_days ?? 0, pairs_with: p.pairs_with ?? null, badge: p.badge ?? null, slug: p.slug ?? null,
    rental: !!p.rental, rental_unit: p.rental_unit ?? "day", deposit: p.deposit == null ? null : Number(p.deposit), min_days: p.min_days ?? 1,
    includes: Array.isArray(p.includes) ? p.includes : [],
  }));

  return (
    <div className="stack">
      <PageHeader n={num("products")} title="Products and services" sub="What's on your website. Add photos, sizes, flavours or service lengths, and hide anything that's sold out."
        actions={<Link className="btn secondary small" href={`/dashboard/${slug}/products/import`}>Import from my website</Link>} />
      {msg && <p className="ok">{msg}</p>}
      {!items.length && (
        <div className="card row" style={{ justifyContent: "space-between", background: "var(--teal-soft)" }}>
          <span><strong>Already selling on a website?</strong> Bring your products in from Shopify, WooCommerce, Wix, Square or a spreadsheet.</span>
          <Link className="btn blue small" href={`/dashboard/${slug}/products/import`}>Import products</Link>
        </div>
      )}
      {!("kind" in ((products ?? [])[0] ?? { kind: 1 })) && (
        <p className="error" style={{ margin: 0 }}>Options and photo uploads need a database update: run <code>supabase/migrations/0012_templates_variants.sql</code>.</p>
      )}
      <ProductEditor slug={slug} currency={business.currency} items={items} canDelete={role === "owner" || role === "admin"}
        template={(biz as any)?.site_template ?? "classic"} />
    </div>
  );
}
