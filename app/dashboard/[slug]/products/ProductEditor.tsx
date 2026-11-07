"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { preparePhoto } from "@/lib/media-prep";
import { displayPrice, PRESETS, readVariants } from "@/lib/catalog";
import { money } from "@/lib/order-text";
import { deleteProduct, getProductPhotoUrl, reorder, saveProduct, setActive, setFeatured, type ProductInput } from "./actions";

export type Item = {
  id: string; kind: "product" | "service"; name: string; description: string | null; category: string | null;
  price: number; price_note: string | null; stock: number | null; image_url: string | null; active: boolean; variants: unknown; featured?: boolean;
  images?: string[]; ready_days?: string[]; lead_days?: number; pairs_with?: string | null; badge?: string | null; slug?: string | null;
  rental?: boolean; rental_unit?: string | null; deposit?: number | null; min_days?: number | null;
  includes?: { id: string; qty: number }[];
};
const WEEK = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]] as const;

/** Category ideas per website template, shown as suggestions. */
const CATEGORY_IDEAS: Record<string, string[]> = {
  caterer: ["Mains", "Sides", "Desserts", "Drinks", "Party trays"],
  artist: ["Originals", "Prints", "Commissions", "Workshops"],
  beauty: ["Hair", "Nails", "Lashes and brows", "Skin", "Packages"],
  trades: ["Repairs", "Installations", "Maintenance", "Emergency call-outs"],
  classic: ["Bestsellers", "New in", "Gifts"],
};

const CSS = `
.pe-top { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
.pe-list { display: flex; flex-direction: column; gap: 10px; }
.pe-item { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; gap: 14px; align-items: center; background: #fff; border: 1.5px solid var(--line); border-radius: 14px; padding: 10px 14px 10px 10px; }
.pe-item.off { opacity: .6; }
.pe-img { width: 72px; height: 72px; border-radius: 10px; overflow: hidden; background: var(--sand); display: grid; place-items: center; font-family: "Barlow Condensed", sans-serif; font-size: 28px; color: #b9c2be; }
.pe-img img { width: 100%; height: 100%; object-fit: cover; }
.pe-meta { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pe-meta b { font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pe-meta small { color: var(--muted); font-size: 13px; }
.pe-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.pe-chips span { font-size: 11.5px; padding: 2px 8px; border-radius: 999px; background: var(--sand); color: var(--ink-soft); font-weight: 600; }
.pe-acts { display: flex; align-items: center; gap: 6px; }
.pe-icon { width: 34px; height: 34px; border-radius: 9px; border: 1.5px solid var(--line); background: #fff; cursor: pointer; font-weight: 700; color: var(--ink-soft); }
.pe-icon:disabled { opacity: .35; cursor: default; }
.pe-back { position: fixed; inset: 0; z-index: 60; background: rgba(11,15,14,.55); display: flex; justify-content: flex-end; }
.pe-drawer { width: min(560px, 100%); height: 100%; background: #fff; overflow-y: auto; padding: 22px; display: flex; flex-direction: column; gap: 16px; animation: pe-in .2s ease-out; }
@keyframes pe-in { from { transform: translateX(30px); opacity: 0; } }
.pe-seg { display: inline-flex; border: 1.5px solid var(--line); border-radius: 12px; padding: 3px; gap: 3px; align-self: flex-start; }
.pe-seg button { border: 0; background: none; padding: 8px 16px; border-radius: 9px; font-weight: 700; cursor: pointer; color: var(--ink-soft); }
.pe-seg button[aria-pressed="true"] { background: var(--ink); color: #fff; }
.pe-drop { position: relative; border: 2px dashed var(--line); border-radius: 14px; min-height: 170px; display: grid; place-items: center; text-align: center; cursor: pointer; overflow: hidden; background: #fafbfa; }
.pe-drop.over { border-color: var(--teal); background: var(--teal-soft); }
.pe-drop img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.pe-drop .pe-change { position: absolute; bottom: 10px; right: 10px; display: flex; gap: 6px; }
.pe-switch { flex-direction: row !important; align-items: center; gap: 10px !important; cursor: pointer; }
.pe-switch input { width: 40px; height: 22px; appearance: none; background: #cfd6d3; border-radius: 999px; position: relative; cursor: pointer; transition: background .15s; border: 0; padding: 0; flex: none; }
.pe-switch input::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .15s; }
.pe-switch input:checked { background: var(--teal); }
.pe-switch input:checked::after { transform: translateX(18px); }
.pe-opts { display: flex; flex-direction: column; gap: 8px; }
.pe-opt { display: grid; grid-template-columns: minmax(0, 1fr) 120px auto auto; gap: 8px; align-items: center; }
.pe-opt input[type=checkbox] { width: 18px; height: 18px; }
.pe-presets { display: flex; flex-wrap: wrap; gap: 6px; }
.pe-presets button { border: 1.5px dashed var(--line); background: #fff; border-radius: 999px; padding: 4px 10px; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.pe-foot { position: sticky; bottom: -22px; background: #fff; padding: 14px 0 0; margin-top: auto; display: flex; gap: 8px; justify-content: space-between; border-top: 1px solid var(--line); }
@media (max-width: 640px) { .pe-item { grid-template-columns: 56px minmax(0, 1fr); } .pe-img { width: 56px; height: 56px; } .pe-acts { grid-column: 1 / -1; justify-content: flex-end; } .pe-opt { grid-template-columns: minmax(0, 1fr) 90px auto auto; } }
`;

const blank = (kind: "product" | "service"): ProductInput => ({
  kind, name: "", description: "", category: "", price: "", price_note: kind === "service" ? "" : "", stock: "", image_url: "", active: true, hasOptions: false,
  variants: [{ name: "", price: "", available: true }], images: [], ready_days: [], lead_days: "", pairs_with: "", badge: "",
  rental: false, rental_unit: "day", deposit: "", min_days: "1", includes: [],
});

function toInput(p: Item): ProductInput {
  const vs = readVariants(p.variants);
  return {
    id: p.id, kind: p.kind, name: p.name, description: p.description ?? "", category: p.category ?? "",
    price: String(p.price ?? ""), price_note: p.price_note ?? "", stock: p.stock == null ? "" : String(p.stock),
    image_url: p.image_url ?? "", active: p.active, hasOptions: vs.length > 0,
    variants: vs.length ? vs.map((v) => ({ id: v.id, name: v.name, price: String(v.price), available: v.available })) : [{ name: "", price: "", available: true }],
    images: p.images ?? [], ready_days: p.ready_days ?? [], lead_days: p.lead_days ? String(p.lead_days) : "", pairs_with: p.pairs_with ?? "", badge: p.badge ?? "",
    rental: !!p.rental, rental_unit: p.rental_unit === "night" ? "night" : "day", deposit: p.deposit ? String(p.deposit) : "", min_days: String(p.min_days ?? 1),
    includes: (p.includes ?? []).map((c) => ({ id: c.id, qty: String(c.qty) })),
  };
}

export default function ProductEditor({ slug, currency, items, canDelete, template }: { slug: string; currency: string; items: Item[]; canDelete: boolean; template: string }) {
  const router = useRouter();
  const [order, setOrder] = useState(items.map((i) => i.id));
  const [form, setForm] = useState<ProductInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  // Keep the local order in sync when the server list changes.
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const ordered = [...order.filter((id) => byId.has(id)), ...items.map((i) => i.id).filter((id) => !order.includes(id))].map((id) => byId.get(id)!);
  const categories = [...new Set([...items.map((i) => i.category).filter(Boolean) as string[], ...(CATEGORY_IDEAS[template] ?? CATEGORY_IDEAS.classic)])];
  const shown = ordered.filter((i) => !filter || i.name.toLowerCase().includes(filter.toLowerCase()) || (i.category ?? "").toLowerCase().includes(filter.toLowerCase()));
  const set = (patch: Partial<ProductInput>) => setForm((f) => (f ? { ...f, ...patch } : f));

  async function uploadExtra(file: File | undefined) {
    if (!file || !file.type.startsWith("image/") || !form) return;
    setUploading(true);
    setError("");
    try {
      const photo = await preparePhoto(file);
      const signed = await getProductPhotoUrl(slug, photo.file.name);
      if ("error" in signed) throw new Error(signed.error);
      const { error } = await createClient().storage.from("product-images").uploadToSignedUrl(signed.path, signed.token, photo.file, { contentType: "image/jpeg" });
      if (error) throw new Error(error.message);
      setForm((f) => (f ? { ...f, images: [...(f.images ?? []), signed.publicUrl].slice(0, 8) } : f));
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    }
    setUploading(false);
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    setError("");
    try {
      const photo = await preparePhoto(file);
      const signed = await getProductPhotoUrl(slug, photo.file.name);
      if ("error" in signed) throw new Error(signed.error);
      const { error } = await createClient().storage.from("product-images").uploadToSignedUrl(signed.path, signed.token, photo.file, { contentType: "image/jpeg" });
      if (error) throw new Error(error.message);
      set({ image_url: signed.publicUrl });
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    }
    setUploading(false);
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setError("");
    const res = await saveProduct(slug, form);
    setBusy(false);
    if ("error" in res && res.error) return setError(res.error);
    setForm(null);
    router.refresh();
  }

  async function remove() {
    if (!form?.id || !confirm(`Delete ${form.name || "this item"}? Past orders keep their details.`)) return;
    setBusy(true);
    const res = await deleteProduct(slug, form.id);
    setBusy(false);
    if ("error" in res && res.error) return setError(res.error);
    setForm(null);
    router.refresh();
  }

  async function move(id: string, dir: -1 | 1) {
    const ids = ordered.map((i) => i.id);
    const i = ids.indexOf(id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(ids);
    await reorder(slug, ids);
  }

  const optRows = form?.variants ?? [];
  const setOpt = (k: number, patch: Partial<ProductInput["variants"][number]>) => set({ variants: optRows.map((r, i) => (i === k ? { ...r, ...patch } : r)) });
  const presets = PRESETS.filter((p) => p.kind === "any" || p.kind === form?.kind);

  return (
    <div className="stack">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="pe-top">
        <div className="row">
          <button className="btn" onClick={() => { setError(""); setForm(blank("product")); }}>+ Add a product</button>
          <button className="btn secondary" onClick={() => { setError(""); setForm(blank("service")); }}>+ Add a service</button>
        </div>
        {items.length > 6 && <input type="search" placeholder="Search" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 220 }} aria-label="Search products" />}
      </div>

      <div className="pe-list">
        {shown.map((p, idx) => {
          const vs = readVariants(p.variants);
          const { amount, from } = displayPrice(p);
          return (
            <div key={p.id} className={`pe-item${p.active ? "" : " off"}`}>
              <div className="pe-img">{p.image_url ? <img src={p.image_url} alt="" /> : p.name.slice(0, 1)}</div>
              <div className="pe-meta">
                <b>{p.featured && <span style={{ color: "#c98a00" }} aria-label="Featured">★ </span>}{p.name}</b>
                <small>
                  {p.kind === "service" ? "Service" : "Product"}{p.category ? ` · ${p.category}` : ""} · {amount === 0 ? "Price on request" : `${from ? "from " : ""}${money(amount, currency)}`}{p.price_note ? ` ${p.price_note}` : ""}
                  {p.stock != null ? ` · ${p.stock} in stock` : ""}{p.active ? "" : " · Hidden"}
                </small>
                {vs.length > 0 && <div className="pe-chips">{vs.slice(0, 6).map((v) => <span key={v.id} style={v.available ? undefined : { textDecoration: "line-through" }}>{v.name}</span>)}{vs.length > 6 && <span>+{vs.length - 6}</span>}</div>}
              </div>
              <div className="pe-acts">
                {!filter && <>
                  <button className="pe-icon" disabled={idx === 0} onClick={() => move(p.id, -1)} aria-label={`Move ${p.name} up`}>↑</button>
                  <button className="pe-icon" disabled={idx === shown.length - 1} onClick={() => move(p.id, 1)} aria-label={`Move ${p.name} down`}>↓</button>
                </>}
                <button className="pe-icon" aria-pressed={!!p.featured} title={p.featured ? "Featured: shown first on your website" : "Feature this: show it first"}
                  aria-label={p.featured ? `Stop featuring ${p.name}` : `Feature ${p.name}`} style={p.featured ? { color: "#c98a00", borderColor: "#f2d9b8", background: "#fff8ec" } : undefined}
                  onClick={async () => { const r = await setFeatured(slug, p.id, !p.featured); if ("error" in r && r.error) setError(r.error); router.refresh(); }}>{p.featured ? "★" : "☆"}</button>
                <button className="btn secondary small" onClick={async () => { await setActive(slug, p.id, !p.active); router.refresh(); }}>{p.active ? "Hide" : "Show"}</button>
                <button className="btn small" onClick={() => { setError(""); setForm(toInput(p)); }}>Edit</button>
              </div>
            </div>
          );
        })}
        {!items.length && (
          <div className="soon">
            <b>Nothing on your website yet.</b>
            <p className="muted" style={{ margin: "6px 0 0" }}>Add what you sell or the services you offer. Snap a photo, add a price, and if it comes in sizes, flavours or lengths, add those as options.</p>
          </div>
        )}
      </div>

      {form && (
        <div className="pe-back" onClick={() => !busy && setForm(null)}>
          <div className="pe-drawer" role="dialog" aria-modal="true" aria-label={form.id ? `Edit ${form.name}` : "New item"} onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 style={{ fontSize: 26 }}>{form.id ? "Edit" : "New"} {form.kind}</h2>
              <button className="pe-icon" onClick={() => setForm(null)} aria-label="Close">✕</button>
            </div>

            <div className="pe-seg" role="group" aria-label="Type">
              <button type="button" aria-pressed={form.kind === "product"} onClick={() => set({ kind: "product" })}>Product</button>
              <button type="button" aria-pressed={form.kind === "service"} onClick={() => set({ kind: "service", stock: "" })}>Service</button>
            </div>

            <label className={`pe-drop${over ? " over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); uploadPhoto(e.dataTransfer.files[0]); }}>
              {form.image_url ? <img src={form.image_url} alt="" /> : (
                <span style={{ padding: 20, display: "flex", flexDirection: "column", gap: 4, fontWeight: 400 }}>
                  <strong>{uploading ? "Uploading…" : "Add a photo"}</strong>
                  <span className="muted">Drop it here or tap to choose. Phone photos are fine.</span>
                </span>
              )}
              {form.image_url && (
                <span className="pe-change">
                  <span className="btn secondary small">{uploading ? "Uploading…" : "Change"}</span>
                  <button type="button" className="btn secondary small" onClick={(e) => { e.preventDefault(); set({ image_url: "" }); }}>Remove</button>
                </span>
              )}
              <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploading} onChange={(e) => uploadPhoto(e.target.files?.[0])} />
            </label>

            {form.id && items.find((i) => i.id === form.id)?.slug && (
              <span className="muted" style={{ fontSize: 13 }}>Its own page: <a href={`/s/${slug}/p/${items.find((i) => i.id === form.id)!.slug}`} target="_blank" rel="noreferrer">/p/{items.find((i) => i.id === form.id)!.slug}</a>. Google can find it; share it in posts.</span>
            )}
            <label>Name<input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={form.kind === "service" ? "Gel manicure" : "Black cake"} autoFocus maxLength={120} /></label>
            <label>Description <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
              <textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={1000}
                placeholder={form.kind === "service" ? "What's included, how long it takes" : "Ingredients, size, what makes it special"} />
            </label>
            <label>Category <span className="muted" style={{ fontWeight: 400 }}>(groups items on your website)</span>
              <input list="pe-cats" value={form.category} onChange={(e) => set({ category: e.target.value })} maxLength={40} placeholder={categories[0]} />
              <datalist id="pe-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </label>

            <label className="pe-switch">
              <input type="checkbox" checked={form.hasOptions} onChange={(e) => set({ hasOptions: e.target.checked })} />
              <span>Comes in different {form.kind === "service" ? "options (lengths, durations, packages)" : "options (sizes, flavours, colours)"}</span>
            </label>

            {form.hasOptions ? (
              <div className="card stack" style={{ gap: 10, padding: 14 }}>
                <div className="pe-opts">
                  <div className="pe-opt muted" style={{ fontSize: 12, fontWeight: 700 }}><span>Option</span><span>Price ({currency})</span><span title="Available">On</span><span /></div>
                  {optRows.map((r, k) => (
                    <div key={k} className="pe-opt">
                      <input value={r.name} onChange={(e) => setOpt(k, { name: e.target.value })} placeholder={form.kind === "service" ? "60 min" : "8 inch"} aria-label={`Option ${k + 1} name`} maxLength={60} />
                      <input type="number" min="0" step="0.01" inputMode="decimal" value={r.price} onChange={(e) => setOpt(k, { price: e.target.value })} placeholder="0.00" aria-label={`Option ${k + 1} price`} />
                      <input type="checkbox" checked={r.available} onChange={(e) => setOpt(k, { available: e.target.checked })} aria-label={`Option ${k + 1} available`} title="Available" />
                      <button type="button" className="pe-icon" onClick={() => set({ variants: optRows.length > 1 ? optRows.filter((_, i) => i !== k) : [{ name: "", price: "", available: true }] })} aria-label={`Remove option ${k + 1}`}>✕</button>
                    </div>
                  ))}
                </div>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <button type="button" className="btn secondary small" onClick={() => set({ variants: [...optRows, { name: "", price: "", available: true }] })}>+ Add option</button>
                  <div className="pe-presets">
                    {presets.map((p) => (
                      <button key={p.label} type="button" onClick={() => set({ variants: [...optRows.filter((r) => r.name || r.price), ...p.names.map((name) => ({ name, price: "", available: true }))] })}>{p.label}</button>
                    ))}
                  </div>
                </div>
                <span className="muted" style={{ fontSize: 12.5 }}>Customers pick one before adding it. Untick an option when it's unavailable. Price 0 shows as "price on request".</span>
              </div>
            ) : (
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                <label>Price ({currency})<input type="number" min="0" step="0.01" inputMode="decimal" value={form.price} onChange={(e) => set({ price: e.target.value })} placeholder="0.00" /></label>
              </div>
            )}

            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              <label>Price note <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
                <input value={form.price_note} onChange={(e) => set({ price_note: e.target.value })} maxLength={30} placeholder={form.kind === "service" ? "per hour" : "per dozen"} />
              </label>
              {form.kind === "product" && (
                <label>Stock <span className="muted" style={{ fontWeight: 400 }}>(blank = not tracked)</span>
                  <input type="number" min="0" step="1" inputMode="numeric" value={form.stock} onChange={(e) => set({ stock: e.target.value })} />
                </label>
              )}
            </div>

            <details className="stack" style={{ gap: 10 }} open={!!(form.images?.length || form.ready_days?.length || form.lead_days || form.pairs_with || form.badge)}>
              <summary style={{ cursor: "pointer", fontWeight: 700, minHeight: 44, display: "flex", alignItems: "center" }}>More for the shop page: photos, ready days, pairing</summary>
              <div className="stack" style={{ gap: 10, marginTop: 6 }}>
                <div className="stack" style={{ gap: 6 }}>
                  <b style={{ fontSize: 14 }}>More photos <span className="muted" style={{ fontWeight: 400 }}>(customers swipe through them)</span></b>
                  <div className="row" style={{ gap: 6 }}>
                    {(form.images ?? []).map((u) => (
                      <span key={u} style={{ position: "relative" }}>
                        <img src={u} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10 }} />
                        <button type="button" aria-label="Remove photo" onClick={() => set({ images: (form.images ?? []).filter((x) => x !== u) })}
                          style={{ position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: "50%", border: 0, background: "#0b0f0e", color: "#fff", cursor: "pointer" }}>✕</button>
                      </span>
                    ))}
                    {(form.images?.length ?? 0) < 8 && (
                      <label className="btn secondary small" style={{ cursor: "pointer" }}>{uploading ? "Uploading…" : "+ Add photo"}
                        <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploading} onChange={(e) => { uploadExtra(e.target.files?.[0]); e.target.value = ""; }} />
                      </label>
                    )}
                  </div>
                </div>
                <div className="stack" style={{ gap: 6 }}>
                  <b style={{ fontSize: 14 }}>Ready on <span className="muted" style={{ fontWeight: 400 }}>(leave all off if it's any day)</span></b>
                  <div className="row" style={{ gap: 4 }}>
                    {WEEK.map(([d, l]) => {
                      const on = (form.ready_days ?? []).includes(d);
                      return <button key={d} type="button" className={`btn small ${on ? "" : "secondary"}`} aria-pressed={on} style={{ minWidth: 48 }}
                        onClick={() => set({ ready_days: on ? (form.ready_days ?? []).filter((x) => x !== d) : [...(form.ready_days ?? []), d] })}>{l}</button>;
                    })}
                  </div>
                </div>
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                  <label>Order ahead (days)<input type="number" min="0" max="60" inputMode="numeric" value={form.lead_days ?? ""} onChange={(e) => set({ lead_days: e.target.value })} placeholder="0" /></label>
                  <label>Badge
                    <select value={form.badge ?? ""} onChange={(e) => set({ badge: e.target.value })}>
                      <option value="">Automatic</option><option value="new">New</option><option value="bestseller">Bestseller</option><option value="preorder">Pre-order</option><option value="none">No badge</option>
                    </select>
                  </label>
                </div>
                <label>Pairs well with
                  <select value={form.pairs_with ?? ""} onChange={(e) => set({ pairs_with: e.target.value })}>
                    <option value="">Nothing</option>
                    {items.filter((i) => i.id !== form.id && i.active).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </label>
                <span className="muted" style={{ fontSize: 13 }}>Automatic badges: Bestseller from your paid orders in the last 30 days, Pre-order when it has ready days or an order-ahead time, Sold out at 0 stock.</span>
              </div>
            </details>

            {form.kind === "product" && (
              <details className="stack" style={{ gap: 10 }} open={!!form.rental}>
                <summary style={{ cursor: "pointer", fontWeight: 700, minHeight: 44, display: "flex", alignItems: "center" }}>Rental settings</summary>
                <div className="stack" style={{ gap: 10, marginTop: 6 }}>
                  <label className="pe-switch">
                    <input type="checkbox" checked={!!form.rental} onChange={(e) => set({ rental: e.target.checked })} />
                    <span>Rent this out (customers pick dates)</span>
                  </label>
                  {form.rental && (
                    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                      <label>Charged per
                        <select value={form.rental_unit ?? "day"} onChange={(e) => set({ rental_unit: e.target.value })}><option value="day">Day</option><option value="night">Night</option></select>
                      </label>
                      <label>Refundable deposit per booking ({currency})<input type="number" min="0" step="0.01" inputMode="decimal" value={form.deposit ?? ""} onChange={(e) => set({ deposit: e.target.value })} placeholder="0" /></label>
                      <label>Minimum {form.rental_unit === "night" ? "nights" : "days"}<input type="number" min="1" max="30" inputMode="numeric" value={form.min_days ?? "1"} onChange={(e) => set({ min_days: e.target.value })} /></label>
                    </div>
                  )}
                  {form.rental && (() => {
                    // Packages: the rental items inside it. Items that are packages themselves can't go inside another.
                    const parts = items.filter((i) => i.rental && i.active && i.id !== form.id && !(i.includes?.length));
                    if (!parts.length) return null;
                    const inc = form.includes ?? [];
                    const toggle = (id: string, on: boolean) => set({ includes: on ? [...inc, { id, qty: "1" }] : inc.filter((c) => c.id !== id) });
                    return (
                      <fieldset className="stack" style={{ gap: 6, border: "1px solid var(--line)", borderRadius: 10, padding: 12 }}>
                        <legend style={{ fontWeight: 700, padding: "0 4px" }}>Is this a package? Tick what&apos;s inside</legend>
                        {parts.map((i) => {
                          const c = inc.find((x) => x.id === i.id);
                          return (
                            <div key={i.id} className="row" style={{ gap: 8, minHeight: 44, flexWrap: "nowrap" }}>
                              <label className="pe-switch" style={{ flex: 1, minWidth: 0 }}>
                                <input type="checkbox" checked={!!c} onChange={(e) => toggle(i.id, e.target.checked)} />
                                <span style={{ overflowWrap: "anywhere" }}>{i.name}</span>
                              </label>
                              {c && <input aria-label={`How many ${i.name}`} type="number" min="1" max="20" inputMode="numeric" style={{ width: 72 }} value={c.qty}
                                onChange={(e) => set({ includes: inc.map((x) => (x.id === i.id ? { ...x, qty: e.target.value } : x)) })} />}
                            </div>
                          );
                        })}
                        <span className="muted" style={{ fontSize: 13 }}>Booking the package holds these items for the same dates, so nobody can rent them separately. If one is already booked, the package shows as booked too.</span>
                      </fieldset>
                    );
                  })()}
                  <span className="muted" style={{ fontSize: 13 }}>For rentals, Stock is how many you own (1 if blank). It doesn&apos;t go down when rented: each booking holds units for its dates. The price is per {form.rental_unit === "night" ? "night" : "day"}. One deposit per booking: when several items are booked together, the highest deposit is charged once.</span>
                </div>
              </details>
            )}

            <label className="pe-switch">
              <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
              <span>Show on my website</span>
            </label>

            {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}

            <div className="pe-foot">
              {form.id && canDelete ? <button type="button" className="btn secondary" style={{ color: "var(--coral)" }} disabled={busy} onClick={remove}>Delete</button> : <span />}
              <div className="row">
                <button type="button" className="btn secondary" disabled={busy} onClick={() => setForm(null)}>Cancel</button>
                <button type="button" className="btn" disabled={busy || uploading} onClick={save}>{busy ? "Saving…" : "Save"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
