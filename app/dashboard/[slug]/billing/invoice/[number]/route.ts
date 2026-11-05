import { NextResponse } from "next/server";
import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { invoicePdf } from "@/lib/invoice-pdf";

/** Download a ZDMINC invoice as a PDF. Owners and admins only. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; number: string }> }) {
  const { slug, number } = await params;
  const { business, role } = await requireMembership(slug);
  if (role !== "owner" && role !== "admin") return new NextResponse("Only the owner or an admin can download invoices", { status: 403 });
  const admin = createAdminClient();
  const [{ data: inv }, { data: b }] = await Promise.all([
    admin.from("invoices").select("number, description, amount, currency, status, created_at, due_date, paid_at, payment_url").eq("business_id", business.id).eq("number", number).maybeSingle(),
    admin.from("businesses").select("name, billing_name, billing_email, billing_address, contact_email").eq("id", business.id).single(),
  ]);
  if (!inv || inv.status === "draft") return new NextResponse("Invoice not found", { status: 404 });
  const pdf = await invoicePdf({
    ...inv, amount: Number(inv.amount),
    billTo: { name: b?.billing_name || b?.name || business.name, email: b?.billing_email || b?.contact_email, address: b?.billing_address },
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${inv.number}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
