import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runBilling } from "@/lib/zdm-billing";
import { runNightly } from "@/lib/nightly";

export const maxDuration = 60;

/** Daily renewals, overdue marking, reminders, and nightly cart/customer maintenance. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const [billing, nightly] = await Promise.all([runBilling(admin), runNightly(admin)]);
  return NextResponse.json({ ok: true, ...billing, nightly });
}
