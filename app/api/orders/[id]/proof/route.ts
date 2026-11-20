import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkOrderToken } from "@/lib/order-link";
import { findReference, proofPath } from "@/lib/transfer";
import { notifyClient } from "@/lib/zdm-billing";

export const runtime = "nodejs";
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" };

/** Public: a shopper without WhatsApp uploads their 1st Pay / bank transfer screenshot from their order page. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  if (!form || !checkOrderToken(id, String(form.get("t") ?? ""))) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  const file = form.get("file");
  const typed = String(form.get("reference") ?? "").trim().slice(0, 80);
  const ref = typed ? findReference(typed) ?? typed.toUpperCase().slice(0, 30) : null;
  const hasFile = file instanceof File && file.size > 0;
  if (!hasFile && !ref) return NextResponse.json({ error: "Add a screenshot or the transfer reference number." }, { status: 400 });
  if (hasFile && (file.size > 8_000_000 || !TYPES[file.type])) return NextResponse.json({ error: "Send a photo or PDF under 8 MB." }, { status: 400 });

  const admin = createAdminClient();
  const { data: o } = await admin.from("orders").select("id, business_id, code, status").eq("id", id).maybeSingle<any>();
  if (!o) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  if (!["awaiting_confirmation", "awaiting_payment", "transfer_pending"].includes(o.status)) return NextResponse.json({ error: "This order doesn't need a payment right now." }, { status: 409 });

  const patch: Record<string, unknown> = { status: "transfer_pending", payment_method: "transfer", transfer_submitted_at: new Date().toISOString() };
  if (ref) patch.transfer_reference = ref;
  if (hasFile) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = proofPath(o.business_id, o.id, TYPES[file.type]);
    const up = await admin.storage.from("transfer-proofs").upload(path, bytes, { contentType: file.type, upsert: false });
    if (up.error) return NextResponse.json({ error: "Couldn't upload that. Please try again." }, { status: 500 });
    patch.transfer_proof_path = path;
    patch.transfer_proof_hash = createHash("sha256").update(bytes).digest("hex");
  }
  await admin.from("orders").update(patch).eq("id", o.id);
  const { data: b } = await admin.from("businesses").select("slug").eq("id", o.business_id).maybeSingle();
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  await notifyClient(admin, o.business_id, `Order ${o.code}: the customer sent their transfer ${hasFile ? "screenshot" : `reference ${ref}`}. Check your account, then record the payment: ${site}/dashboard/${b?.slug}/orders/${o.code}`).catch(() => null);
  return NextResponse.json({ ok: true });
}
