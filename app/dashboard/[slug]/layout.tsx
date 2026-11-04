import Link from "next/link";
import { requireMembership } from "@/lib/business";
import { CLIENT_NAV } from "@/lib/crm-nav";
import { CrmShell, Dot } from "@/components/CrmShell";
import { Icon } from "@/components/Icon";
import { getStaff } from "@/lib/staff";

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export default async function BusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, business, viewingAsStaff } = await requireMembership(slug);
  const base = `/dashboard/${slug}`;
  const week = new Date(Date.now() - 7 * 864e5).toISOString();
  const [{ data: msgs }, { count: toAct }, { count: adsOk }, { count: toChoose }, { data: integ }, { data: sub }, staff] = await Promise.all([
    supabase.from("messages").select("customer_id, direction, created_at").eq("business_id", business.id).gte("created_at", week).order("created_at", { ascending: false }).limit(400),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("business_id", business.id).in("status", ["awaiting_confirmation", "awaiting_payment"]),
    supabase.from("ad_campaigns").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("status", "needs_approval"),
    supabase.from("video_clips").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("status", "published").eq("chosen", false),
    supabase.from("integrations").select("provider, status").eq("business_id", business.id),
    supabase.from("subscriptions").select("plans!subscriptions_plan_id_fkey(name)").eq("business_id", business.id).maybeSingle(),
    getStaff(),
  ]);
  // A chat is "waiting" when the customer wrote last.
  const latest = new Map<string, string>();
  for (const m of msgs ?? []) if (m.customer_id && !latest.has(m.customer_id)) latest.set(m.customer_id, m.direction);
  const waiting = [...latest.values()].filter((d) => d === "in").length;
  const badge: Record<string, number | null> = { inbox: waiting, orders: toAct ?? 0, ads: adsOk ?? 0, videos: toChoose ?? 0 };
  const on = (p: string) => integ?.some((i) => i.provider === p && i.status === "connected") ?? false;

  return (
    <CrmShell
      switcher={{ initials: initials(business.name), name: business.name, sub: (sub as any)?.plans?.name ?? "ZDM ChatCart", href: "/dashboard" }}
      nav={CLIENT_NAV.map(([k, label, icon]) => ({ href: k ? `${base}/${k}` : base, label, icon, badge: badge[k] || null, exact: !k }))}
      footer={<>
        <div className="crm-conn">
          <span><Dot ok={on("whatsapp")} />WhatsApp {on("whatsapp") ? "connected" : "not connected"}</span>
          <span><Dot ok={on("fygaro")} />Payments {on("fygaro") ? "connected" : "not connected"}</span>
          <span><Dot ok={on("instagram")} />Instagram {on("instagram") ? "connected" : "not connected"}</span>
          <span><Dot ok={on("meta")} />Meta ads tracking {on("meta") ? "on" : "off"}</span>
        </div>
        {staff && <Link href="/admin" className="crm-outline"><Icon name="studio" />ZDMINC Studio</Link>}
      </>}
    >
      {viewingAsStaff && <div className="notice" style={{ borderRadius: 12 }}>You're viewing {business.name} as ZDMINC staff. Changes you make here are real. <Link href="/admin">Back to admin</Link></div>}
      {children}
    </CrmShell>
  );
}
