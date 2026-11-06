import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { transferReminders } from "@/lib/transfer-reminders";

/** Bank transfer reminders. Not scheduled on its own (Vercel Hobby allows 2 daily crons): the billing and posts crons run it. Kept for manual or external triggers. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await transferReminders(createAdminClient())) });
}
