"use server";

import { revalidatePath } from "next/cache";
import { back, requireEditor } from "@/lib/crm-actions";
import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendReadyMessage } from "@/lib/followups";

const codes = (f: FormData) => [...new Set(f.getAll("code").map(String).filter((c) => /^[A-Z]{1,4}-\d{3,}$/.test(c)))].slice(0, 100);

/** Mark the ticked orders ready and tell each customer. Only paid orders move to Ready. */
export async function bulkReady(f: FormData) {
  const slug = String(f.get("slug"));
  const path = `/dashboard/${slug}/orders${f.get("status") ? `?status=${f.get("status")}` : ""}`;
  const { business } = await requireMembership(slug);
  const list = codes(f);
  if (!list.length) back(path, "Tick the orders first");
  const admin = createAdminClient();
  const { data: rows } = await admin.from("orders").update({ status: "ready" }).eq("business_id", business.id).in("code", list).eq("status", "paid").select("id, code");
  let told = 0;
  if (f.get("notify") !== "off") for (const r of rows ?? []) if ((await sendReadyMessage(admin, r.id)).ok) told++;
  revalidatePath(`/dashboard/${slug}/orders`);
  const moved = rows?.length ?? 0;
  back(path, `${moved} marked ready${f.get("notify") !== "off" ? `, ${told} customer${told === 1 ? "" : "s"} messaged` : ""}.${moved < list.length ? ` ${list.length - moved} skipped because they aren't paid yet.` : ""}`);
}

/** Mark the ticked orders collected or delivered. */
export async function bulkFulfilled(f: FormData) {
  const slug = String(f.get("slug"));
  const path = `/dashboard/${slug}/orders${f.get("status") ? `?status=${f.get("status")}` : ""}`;
  const { db, business } = await requireEditor(slug, path);
  const list = codes(f);
  if (!list.length) back(path, "Tick the orders first");
  const { data: rows } = await db.from("orders").update({ status: "fulfilled" }).eq("business_id", business.id).in("code", list).in("status", ["paid", "ready"]).select("id");
  revalidatePath(`/dashboard/${slug}/orders`);
  back(path, `${rows?.length ?? 0} marked collected.${(rows?.length ?? 0) < list.length ? " Unpaid ones were skipped." : ""}`);
}
