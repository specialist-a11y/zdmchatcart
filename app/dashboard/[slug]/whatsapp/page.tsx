import Link from "next/link";
import { requireMembership } from "@/lib/business";
import { PageHeader, Dot } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";

const LIVE = [
  ["Order codes", "When a customer sends a code like IC-1048, the bot replies with the order summary and a secure payment link for the exact total."],
  ["Pickup or delivery", "The same reply asks how they want it, and records PICKUP or DELIVERY on the order."],
  ["Payment receipts", "When the payment comes through, the customer gets a receipt on WhatsApp and the order turns Paid."],
  ["First-time hello", "Someone messaging for the first time gets your shop link."],
  ["You can step in", "Every chat lands in your Inbox, and you can reply any time."],
];
const NEXT = ["Visual automation builder (welcome, opening hours, FAQs)", "Catalog sync to WhatsApp's own catalog", "Approved templates and broadcasts", "Unpaid-cart reminders on a schedule"];

export default async function WhatsAppPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, business } = await requireMembership(slug);
  const { data: wa } = await supabase.from("integrations").select("status, config").eq("business_id", business.id).eq("provider", "whatsapp").maybeSingle();
  const on = wa?.status === "connected";
  return (
    <div className="stack">
      <PageHeader n={num("whatsapp")} title="WhatsApp" sub={`Your ordering bot on ${business.whatsapp_number ? "+" + business.whatsapp_number : "your WhatsApp number"}.`}
        actions={<Link className="btn secondary small" href={`/dashboard/${slug}/settings`}>Connection settings</Link>} />
      <div className="card row" style={{ justifyContent: "space-between" }}>
        <span className="row"><Dot ok={on} /><b>{on ? "Connected to the WhatsApp Cloud API" : "Not connected yet"}</b></span>
        {!on && <span className="muted">ZDMINC connects this during setup, or add it in Settings.</span>}
      </div>
      <h2>What your bot does now</h2>
      <div className="grid">
        {LIVE.map(([t, d]) => <div key={t} className="card stack" style={{ gap: 6 }}><span className="badge paid" style={{ alignSelf: "flex-start" }}>Live</span><b>{t}</b><span className="muted">{d}</span></div>)}
      </div>
      <div className="soon stack" style={{ gap: 8 }}>
        <b>Coming next</b>
        <ul style={{ margin: 0, paddingLeft: 18 }}>{NEXT.map((x) => <li key={x}>{x}</li>)}</ul>
        <span className="muted">Want one of these set up by hand now? <Link href={`/dashboard/${slug}/support`}>Ask ZDMINC</Link>.</span>
      </div>
    </div>
  );
}
