import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runNightly } from "@/lib/nightly";

export const maxDuration = 60;

/** Nightly: abandoned carts, Quiet customers, cart reminders and owner alerts. Vercel Cron calls this with the CRON_SECRET bearer token. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runNightly(createAdminClient());
  return NextResponse.json({ ok: true, ...result });
}
