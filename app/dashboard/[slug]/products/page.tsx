import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/business";
import { money } from "@/lib/order-text";

function parseProduct(formData: FormData) {
  const stockRaw = String(formData.get("stock") ?? "").trim();
  return {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    price: Math.max(0, Number(formData.get("price") ?? 0)),
    image_url: String(formData.get("image_url") ?? "").trim() || null,
    stock: stockRaw === "" ? null : Math.max(0, Math.floor(Number(stockRaw))),
  };
}

export default async function ProductsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, business } = await requireMembership(slug);
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("business_id", business.id)
    .order("sort_order")
    .order("created_at");
  const path = `/dashboard/${slug}/products`;

  async function addProduct(formData: FormData) {
    "use server";
    const { supabase, business } = await requireMembership(slug);
    const p = parseProduct(formData);
    if (!p.name) return;
    await supabase.from("products").insert({ ...p, business_id: business.id });
    revalidatePath(path);
  }

  async function updateProduct(formData: FormData) {
    "use server";
    const { supabase, business } = await requireMembership(slug);
    const id = String(formData.get("id"));
    await supabase
      .from("products")
      .update({ ...parseProduct(formData), active: formData.get("active") === "on" })
      .eq("id", id)
      .eq("business_id", business.id);
    revalidatePath(path);
  }

  return (
    <div className="stack">
      <PageHeader n={num("products")} title="Products" sub="What's on your shop page. Hide items that are sold out." />
      <form action={addProduct} className="card stack">
        <h2 style={{ fontSize: 22 }}>Add a product</h2>
        <div className="grid">
          <label>Name<input name="name" required /></label>
          <label>Price ({business.currency})<input name="price" type="number" min="0" step="0.01" required /></label>
          <label>Stock (leave blank if not tracked)<input name="stock" type="number" min="0" step="1" /></label>
          <label>Image URL<input name="image_url" type="url" placeholder="https://..." /></label>
        </div>
        <label>Description<textarea name="description" rows={2} /></label>
        <button className="btn" style={{ alignSelf: "flex-start" }}>Add product</button>
      </form>

      <div className="stack">
        {(products ?? []).map((p) => (
          <form key={p.id} action={updateProduct} className="card stack">
            <input type="hidden" name="id" value={p.id} />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{p.name}</strong>
              <span className="muted">{money(p.price, business.currency)}{p.stock !== null ? ` · ${p.stock} in stock` : ""}</span>
            </div>
            <div className="grid">
              <label>Name<input name="name" defaultValue={p.name} required /></label>
              <label>Price<input name="price" type="number" min="0" step="0.01" defaultValue={p.price} required /></label>
              <label>Stock<input name="stock" type="number" min="0" step="1" defaultValue={p.stock ?? ""} /></label>
              <label>Image URL<input name="image_url" type="url" defaultValue={p.image_url ?? ""} /></label>
            </div>
            <label>Description<textarea name="description" rows={2} defaultValue={p.description ?? ""} /></label>
            <div className="row">
              <label style={{ flexDirection: "row", alignItems: "center" }}>
                <input type="checkbox" name="active" defaultChecked={p.active} /> Show in shop
              </label>
              <button className="btn small">Save</button>
            </div>
          </form>
        ))}
        {(!products || products.length === 0) && <p className="muted">No products yet.</p>}
      </div>
    </div>
  );
}
