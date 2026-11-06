import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensurePaymentLink } from "@/lib/payments";
import { money } from "@/lib/order-text";
import { qrSvg } from "@/lib/qr";

/** Full-screen QR for in-person card payments: the customer scans with their phone and pays; the order confirms itself. */
export default async function OrderQrPage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  const { business } = await requireMembership(slug);
  const admin = createAdminClient();
  const { data: o } = await admin.from("orders").select("id, code, total, currency, status, paid_at").eq("business_id", business.id).eq("code", code).maybeSingle();
  if (!o) notFound();
  const back = `/dashboard/${slug}/orders/${code}`;
  const url = o.paid_at ? null : await ensurePaymentLink(admin, o.id);
  const svg = url ? await qrSvg(url) : null;
  return (
    <div className="stack" style={{ alignItems: "center", textAlign: "center", padding: "12px 0 40px" }}>
      <Link href={back} className="btn secondary small" style={{ alignSelf: "flex-start" }}>‹ Back to order</Link>
      {o.paid_at ? (
        <div className="card stack" style={{ alignItems: "center", maxWidth: 420 }}><h1 style={{ margin: 0 }}>Paid ✓</h1><p className="muted">Order {o.code} is already paid.</p></div>
      ) : svg ? (
        <div className="card stack" style={{ alignItems: "center", maxWidth: 440, width: "100%", gap: 10 }}>
          <span className="muted" style={{ fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", fontSize: 13 }}>{business.name}</span>
          <b style={{ fontSize: 34 }}>{money(o.total, o.currency)}</b>
          <span>Order {o.code}</span>
          <div style={{ width: "min(340px, 80vw)" }} aria-label={`QR code to pay order ${o.code} by card`} role="img" dangerouslySetInnerHTML={{ __html: svg.replace("<svg", '<svg width="100%" height="100%"') }} />
          <b style={{ fontSize: 20 }}>Scan with your phone camera to pay by card</b>
          <span className="muted">Secure payment page. Your receipt arrives on WhatsApp.</span>
        </div>
      ) : (
        <div className="card stack" style={{ maxWidth: 440 }}><b>No card payment link yet.</b><span className="muted">Connect payments in Settings, or ask ZDMINC to set it up.</span></div>
      )}
      <span className="muted" style={{ fontSize: 13 }}>This page refreshes when you reopen it. The order turns Paid on its own once the payment goes through.</span>
    </div>
  );
}
