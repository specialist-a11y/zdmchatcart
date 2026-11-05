import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/business";
import { shortUrl } from "@/lib/links";
import PrintButton from "../../orders/slips/PrintButton";

const CSS = `
.qrc { width: min(420px, 100%); margin: 0 auto; border-radius: 24px; padding: 28px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; color: #fff; }
.qrc img.qr { width: 240px; height: 240px; background: #fff; border-radius: 16px; padding: 10px; }
.qrc h1 { font-size: 40px; line-height: 1; margin: 0; text-transform: uppercase; }
.qrc .logo { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; background: #fff; }
@media print { body * { visibility: hidden !important; } .qrc, .qrc * { visibility: visible !important; } .qrc { position: absolute; left: 0; right: 0; top: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

/** A printable QR card for one short link: counter signs, flyers, packaging. */
export default async function QrCard({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ code?: string }> }) {
  const { slug } = await params;
  const { code } = await searchParams;
  const { supabase, business } = await requireMembership(slug);
  const { data: link } = code ? await supabase.from("short_links").select("code, label").eq("business_id", business.id).eq("code", code).maybeSingle() : { data: null };
  const { data: dom } = await supabase.from("business_domains").select("domain").eq("business_id", business.id).eq("status", "active").limit(1).maybeSingle();
  const url = link ? shortUrl(link.code, dom?.domain) : `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")}/s/${slug}`;
  if (code && !link) notFound();
  return (
    <div className="stack" style={{ alignItems: "center" }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="qrc" style={{ background: business.brand_color || "#0B0F0E" }}>
        {business.logo_url && <img className="logo" src={business.logo_url} alt="" />}
        <h1>{business.name}</h1>
        <span style={{ fontSize: 18, fontWeight: 700 }}>Scan to order on WhatsApp</span>
        <img className="qr" src={`/api/qr?text=${encodeURIComponent(url)}`} alt={`QR code for ${url}`} />
        <b style={{ fontSize: 20 }}>{url.replace(/^https?:\/\//, "")}</b>
        {link?.label && <span style={{ opacity: .85 }}>{link.label}</span>}
      </div>
      <PrintButton />
    </div>
  );
}
