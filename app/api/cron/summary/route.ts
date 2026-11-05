import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSummaries } from "@/lib/summary";

export const maxDuration = 60;

/** 8pm Barbados: the daily WhatsApp summary to each owner. Vercel Cron calls this with the CRON_SECRET bearer token. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runSummaries(createAdminClient());
  return NextResponse.json({ ok: true, ...result });
}
