import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { money } from "@/lib/order-text";
import { productsFromCsv, type ImportedProduct } from "@/lib/product-import";
import { productsFromSite } from "@/lib/product-import-server";

const go = (slug: string, q: string) => redirect(`/dashboard/${slug}/products/import${q}`);
const msg = (slug: string, m: string, id?: string) => go(slug, `?${id ? `id=${id}&` : ""}msg=${encodeURIComponent(m)}`);

async function saveParsed(slug: string, source: string, items: ImportedProduct[], warnings: string[]) {
  const { business, user } = await requireMembership(slug);
  if (!items.length) msg(slug, warnings[0] ?? "No products found.");
  const { data } = await createAdminClient().from("product_imports")
    .insert({ business_id: business.id, source, items, warnings, created_by: user.id }).select("id").single();
  go(slug, `?id=${data!.id}`);
}

async function fromCsv(f: FormData) {
  "use server";
  const slug = String(f.get("slug"));
  await requireMembership(slug);
  const file = f.get("file");
  if (!(file instanceof File) || !file.size) msg(slug, "Choose your CSV file first");
  if ((file as File).size > 10 * 1024 * 1024) msg(slug, "That file is over 10 MB. Export fewer products at a time.");
  const r = productsFromCsv(await (file as File).text());
  await saveParsed(slug, r.source, r.products, r.warnings.concat(r.skipped ? [`${r.skipped} rows skipped (extra images, empty rows or variable-product parents).`] : []));
}

async function fromSite(f: FormData) {
  "use server";
  const slug = String(f.get("slug"));
  await requireMembership(slug);
  const r = await productsFromSite(String(f.get("url") ?? ""));
  await saveParsed(slug, r.source, r.products, r.warnings);
}

async function applyImport(f: FormData) {
  "use server";
  const slug = String(f.get("slug"));
  const { business } = await requireMembership(slug);
  const admin = createAdminClient();
  const { data: imp } = await admin.from("product_imports").select("*").eq("id", String(f.get("id"))).eq("business_id", business.id).maybeSingle();
  if (!imp || imp.applied_at) msg(slug, "That import was already done or has expired");
  const showNew = f.get("show_new") === "on";
  const updatePrices = f.get("update_prices") === "on";
  const pick = new Set(f.getAll("pick").map(String));
  // Only the first 500 rows are shown with tick boxes; the rest always come in.
  const items = (imp!.items as ImportedProduct[]).filter((p, i) => i >= 500 || pick.has(p.key));
  if (!items.length) msg(slug, "Tick at least one product", imp!.id);
  const { data: existing } = await admin.from("products").select("id, name, import_key").eq("business_id", business.id);
  const byKey = new Map((existing ?? []).filter((p) => p.import_key).map((p) => [p.import_key as string, p.id]));
  const byName = new Map((existing ?? []).map((p) => [p.name.trim().toLowerCase(), p.id]));
  const { count: already } = await admin.from("products").select("id", { count: "exact", head: true }).eq("business_id", business.id);
  const now = new Date().toISOString();
  let added = 0, updated = 0, sort = already ?? 0;
  const inserts: Record<string, unknown>[] = [];
  for (const p of items) {
    const id = byKey.get(p.key) ?? byName.get(p.name.trim().toLowerCase());
    if (id) {
      if (!updatePrices) continue;
      await admin.from("products").update({ price: p.price, stock: p.stock, sku: p.sku, import_key: p.key, imported_at: now, ...(p.image_url ? { image_url: p.image_url } : {}) }).eq("id", id).eq("business_id", business.id);
      updated++;
    } else {
      inserts.push({ business_id: business.id, name: p.name, description: p.description, price: p.price, image_url: p.image_url, stock: p.stock, sku: p.sku, import_key: p.key, imported_at: now, active: showNew && p.active && p.price > 0, sort_order: sort++ });
    }
  }
  for (let i = 0; i < inserts.length; i += 200) {
    const { error, count } = await admin.from("products").insert(inserts.slice(i, i + 200), { count: "exact" });
    if (!error) added += count ?? 0;
  }
  const result = `${added} added${showNew ? "" : " (hidden until you switch them on)"}, ${updated} updated`;
  await admin.from("product_imports").update({ applied_at: now, result }).eq("id", imp!.id);
  revalidatePath(`/dashboard/${slug}/products`);
  redirect(`/dashboard/${slug}/products?msg=${encodeURIComponent(`Import done: ${result}.`)}`);
}

export default async function ImportPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ id?: string; msg?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { business } = await requireMembership(slug);
  const admin = createAdminClient();
  const imp = sp.id ? (await admin.from("product_imports").select("*").eq("id", sp.id).eq("business_id", business.id).maybeSingle()).data : null;
  const items = (imp?.items ?? []) as ImportedProduct[];
  let isUpdate = new Set<string>();
  if (imp) {
    const { data: existing } = await admin.from("products").select("name, import_key").eq("business_id", business.id);
    const keys = new Set((existing ?? []).map((p) => p.import_key).filter(Boolean));
    const names = new Set((existing ?? []).map((p) => p.name.trim().toLowerCase()));
    isUpdate = new Set(items.filter((p) => keys.has(p.key) || names.has(p.name.trim().toLowerCase())).map((p) => p.key));
  }
  const noPrice = items.filter((p) => !p.price).length;

  return (
    <div className="stack">
      <PageHeader n={num("products")} title="Import products" sub="Bring your products in from the website you already have. Nothing changes until you check the preview and press Import." />
      <Link href={`/dashboard/${slug}/products`}>‹ Back to products</Link>
      {sp.msg && <p className={imp ? "ok" : "error"}>{sp.msg}</p>}

      {!imp || imp.applied_at ? (
        <div className="cols">
          <form action={fromSite} className="card stack">
            <h2>From your website link</h2>
            <p className="muted" style={{ margin: 0 }}>Works with Shopify and WooCommerce shops, and most Wix, Squarespace and other sites that show product details on their pages.</p>
            <input type="hidden" name="slug" value={slug} />
            <label>Your shop or products page<input name="url" required placeholder="islandcrumb.com/shop" inputMode="url" /></label>
            <button className="btn blue small" style={{ alignSelf: "flex-start" }}>Find my products</button>
          </form>
          <form action={fromCsv} className="card stack">
            <h2>From a CSV export</h2>
            <p className="muted" style={{ margin: 0 }}>Best for stock levels and large catalogs. Any spreadsheet with a name and price column works too.</p>
            <input type="hidden" name="slug" value={slug} />
            <label>CSV file<input name="file" type="file" accept=".csv,text/csv" required /></label>
            <button className="btn blue small" style={{ alignSelf: "flex-start" }}>Read the file</button>
            <details style={{ fontSize: 13.5 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>How to export your products</summary>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                <li><strong>Shopify:</strong> Products, Export, All products, CSV for Excel.</li>
                <li><strong>WooCommerce:</strong> Products, Export, Generate CSV.</li>
                <li><strong>Wix:</strong> Store Products, More Actions, Export.</li>
                <li><strong>Square:</strong> Items, Actions, Export library.</li>
                <li><strong>Squarespace:</strong> Commerce, Inventory, Export.</li>
                <li><strong>Excel or Google Sheets:</strong> columns Name, Price, and optionally Description, Image URL, Stock. Save as CSV.</li>
              </ul>
            </details>
          </form>
        </div>
      ) : (
        <form action={applyImport} className="stack">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="id" value={imp.id} />
          <section className="card stack">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2>{items.length} product{items.length === 1 ? "" : "s"} found · {imp.source}</h2>
              <Link href={`/dashboard/${slug}/products/import`}>Start over</Link>
            </div>
            <p style={{ margin: 0 }}><strong>{items.length - isUpdate.size}</strong> new, <strong>{isUpdate.size}</strong> already in your products (matched by name or the id from your old site).</p>
            {(imp.warnings ?? []).map((w: string) => <p key={w} className="muted" style={{ margin: 0 }}>{w}</p>)}
            {noPrice > 0 && <p className="error" style={{ margin: 0 }}>{noPrice} without a price. They come in hidden so you can add the price first.</p>}
            <label className="row" style={{ fontWeight: 400, gap: 8 }}><input type="checkbox" name="show_new" /> Show new products on my shop straight away (otherwise they come in hidden so you can check them)</label>
            <label className="row" style={{ fontWeight: 400, gap: 8 }}><input type="checkbox" name="update_prices" defaultChecked /> Update price, stock and photo of products I already have</label>
            <button className="btn blue" style={{ alignSelf: "flex-start" }}>Import selected products</button>
          </section>
          <div className="card table-wrap" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Import</th><th>Photo</th><th>Product</th><th>Price</th><th>Stock</th><th /></tr></thead>
              <tbody>
                {items.slice(0, 500).map((p) => (
                  <tr key={p.key}>
                    <td><input type="checkbox" name="pick" value={p.key} defaultChecked aria-label={`Import ${p.name}`} /></td>
                    <td>{p.image_url ? <img src={p.image_url} alt="" width={44} height={44} style={{ objectFit: "cover", borderRadius: 8 }} loading="lazy" /> : <span className="muted">none</span>}</td>
                    <td><strong>{p.name}</strong>{p.description ? <><br /><span className="muted" style={{ fontSize: 12.5 }}>{p.description.slice(0, 90)}{p.description.length > 90 ? "…" : ""}</span></> : null}</td>
                    <td>{p.price ? money(p.price, business.currency) : <span className="error">add price</span>}</td>
                    <td>{p.stock == null ? <span className="muted">not tracked</span> : p.stock}</td>
                    <td>{isUpdate.has(p.key) ? <span className="badge sent">Update</span> : <span className="badge paid">New</span>}{!p.active ? <span className="badge" style={{ marginLeft: 4 }}>Hidden on old site</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {items.length > 500 && <p className="muted">Showing the first 500. All {items.length} are imported.</p>}
        </form>
      )}
    </div>
  );
}
