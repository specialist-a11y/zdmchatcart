import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runBilling } from "@/lib/zdm-billing";

/** Daily renewals, overdue marking and reminders. Vercel Cron calls this with the CRON_SECRET bearer token. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runBilling(createAdminClient());
  return NextResponse.json({ ok: true, ...result });
}
