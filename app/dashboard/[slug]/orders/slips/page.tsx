import Link from "next/link";
import { requireMembership } from "@/lib/business";
import { money } from "@/lib/order-text";
import PrintButton from "./PrintButton";

const CSS = `
.slips { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.slip { border: 2px dashed #9aa7a2; border-radius: 12px; padding: 14px 16px; background: #fff; break-inside: avoid; display: flex; flex-direction: column; gap: 6px; }
.slip h2 { font-size: 30px; margin: 0; }
.slip table { width: 100%; border-collapse: collapse; font-size: 15px; }
.slip td { padding: 3px 0; border-bottom: 1px solid #eef2f1; vertical-align: top; }
.slip .big { font-size: 18px; font-weight: 800; }
@media print {
  body * { visibility: hidden !important; }
  .slips, .slips * { visibility: visible !important; }
  .slips { position: absolute; left: 0; top: 0; width: 100%; grid-template-columns: 1fr 1fr; gap: 8mm; }
  .slip { border-color: #000; }
}`;

/** Packing slips for the ticked orders (or every paid and ready order). */
export default async function SlipsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ code?: string | string[] }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { supabase, business } = await requireMembership(slug);
  const wanted = (Array.isArray(sp.code) ? sp.code : sp.code ? [sp.code] : []).filter((c) => /^[A-Z]{1,4}-\d{3,}$/.test(c)).slice(0, 100);
  let q = supabase.from("orders").select("*, customers(name, phone), order_items(name, quantity, unit_price)")
    .eq("business_id", business.id).order("created_at");
  q = wanted.length ? q.in("code", wanted) : q.in("status", ["paid", "ready"]);
  const { data: orders } = await q.limit(100);
  return (
    <div className="stack">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><h1 style={{ fontSize: 34 }}>Packing slips</h1><span className="muted">{orders?.length ?? 0} order{orders?.length === 1 ? "" : "s"}{wanted.length ? "" : ": everything paid and not yet collected"}</span></div>
        <div className="row"><Link className="btn secondary" href={`/dashboard/${slug}/orders`}>Back to orders</Link><PrintButton /></div>
      </div>
      <div className="slips">
        {(orders ?? []).map((o: any) => (
          <article key={o.code} className="slip">
            <div className="row" style={{ justifyContent: "space-between" }}><h2>{o.code}</h2><b>{business.name}</b></div>
            <span className="big">{o.customers?.name ?? "Customer"}{o.customers?.phone ? ` · +${o.customers.phone}` : ""}</span>
            <span><b>{o.fulfillment === "delivery" ? "DELIVERY" : o.fulfillment === "pickup" ? "PICKUP" : "Pickup or delivery not set"}</b>{o.slot_at ? ` · ${new Date(o.slot_at).toLocaleString("en-GB", { timeZone: "America/Barbados", weekday: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}` : ""} · {o.paid_at ? "PAID" : "NOT PAID"}</span>
            {o.delivery_address && <span>To: <b>{o.delivery_address}</b>{o.delivery_zone ? ` (${o.delivery_zone})` : ""}</span>}
            <table><tbody>
              {(o.order_items ?? []).map((i: any, k: number) => <tr key={k}><td style={{ width: 40 }}><b>{i.quantity} x</b></td><td>{i.name}</td><td style={{ textAlign: "right" }}>☐</td></tr>)}
            </tbody></table>
            {o.note && <span>Note: <b>{o.note}</b></span>}
            <span className="muted" style={{ fontSize: 13 }}>Total {money(o.total, o.currency)} · ordered {new Date(o.created_at).toLocaleDateString("en-GB", { timeZone: "America/Barbados", weekday: "short", day: "numeric", month: "short" })}</span>
          </article>
        ))}
        {!orders?.length && <p className="muted">No orders to pack.</p>}
      </div>
    </div>
  );
}
