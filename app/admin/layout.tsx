import Link from "next/link";
import { CrmShell } from "@/components/CrmShell";
import { Icon } from "@/components/Icon";
import { ADMIN_NAV } from "@/lib/crm-nav";
import { requireStaff } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";

import { redirect } from "next/navigation";

export const metadata = { title: "ZDMINC admin · ZDM ChatCart" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { staff } = await requireStaff();
  const admin = createAdminClient();
  const [{ count: clients }, { count: openTickets }, { count: unreadWa }, { count: overdue }, { count: waitingAds }] = await Promise.all([
    admin.from("subscriptions").select("business_id", { count: "exact", head: true }).neq("status", "cancelled"),
    admin.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
    admin.from("zdm_wa_messages").select("id", { count: "exact", head: true }).eq("direction", "in").is("read_at", null),
    admin.from("invoices").select("id", { count: "exact", head: true }).eq("status", "overdue"),
    admin.from("ad_campaigns").select("id", { count: "exact", head: true }).in("status", ["approved", "changes_requested"]),
  ]);
  const badge: Record<string, number | null> = {
    "/admin": clients ?? null, "/admin/support": openTickets || null, "/admin/whatsapp": unreadWa || null,
    "/admin/ads": waitingAds || null, "/admin/billing": overdue || null,
  };
  return (
    <CrmShell
      switcher={{ initials: "ZD", name: "ZDMINC Studio", sub: `${staff.name} · ${staff.role}`, href: "/admin" }}
      nav={ADMIN_NAV.map(([href, label, icon]) => ({ href, label, icon, badge: badge[href] ?? null, exact: href === "/admin" }))}
      footer={<>
        <Link href="/dashboard" className="crm-outline"><Icon name="customers" />Your client dashboards</Link>
        <small style={{ opacity: .6 }}>A ZDMINC product · zdminc.com</small>
      </>}
    >
      {children}
    </CrmShell>
  );
}
