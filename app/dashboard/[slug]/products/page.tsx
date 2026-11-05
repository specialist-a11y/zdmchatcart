import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import { requireMembership } from "@/lib/business";
import ProductEditor, { type Item } from "./ProductEditor";

export default async function ProductsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, business, role } = await requireMembership(slug);
  let { data: products, error } = await supabase.from("products").select("*").eq("business_id", business.id).order("sort_order").order("created_at");
  if (error) products = [];
  const { data: biz } = await supabase.from("businesses").select("site_template").eq("id", business.id).maybeSingle();

  const items: Item[] = (products ?? []).map((p: any) => ({
    id: p.id, kind: p.kind ?? "product", name: p.name, description: p.description, category: p.category ?? null,
    price: Number(p.price), price_note: p.price_note ?? null, stock: p.stock, image_url: p.image_url, active: p.active, variants: p.variants ?? [],
  }));

  return (
    <div className="stack">
      <PageHeader n={num("products")} title="Products and services" sub="What's on your website. Add photos, sizes, flavours or service lengths, and hide anything that's sold out." />
      {!("kind" in ((products ?? [])[0] ?? { kind: 1 })) && (
        <p className="error" style={{ margin: 0 }}>Options and photo uploads need a database update: run <code>supabase/migrations/0012_templates_variants.sql</code>.</p>
      )}
      <ProductEditor slug={slug} currency={business.currency} items={items} canDelete={role === "owner" || role === "admin"}
        template={(biz as any)?.site_template ?? "classic"} />
    </div>
  );
}
