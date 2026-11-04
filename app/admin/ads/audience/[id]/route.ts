import { NextResponse } from "next/server";
import { getStaff } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { consentedCustomerCsv } from "@/lib/meta";
import { logEvent } from "@/lib/zdm-billing";

/** Hashed phone/email of customers who agreed to marketing, in Meta's customer-list format. Staff only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaff();
  if (!staff) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  const admin = createAdminClient();
  const { data: b } = await admin.from("businesses").select("slug").eq("id", id).maybeSingle();
  if (!b) return new NextResponse("Not found", { status: 404 });
  const { count, csv } = await consentedCustomerCsv(admin, id);
  await logEvent(admin, id, { id: staff.user_id, name: staff.name }, "ads", `Downloaded ${count} consented customers for a Meta audience`);
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${b.slug}-customers-meta.csv"`, "Cache-Control": "no-store" },
  });
}
