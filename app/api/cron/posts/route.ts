import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDuePosts } from "@/lib/publish";

export const maxDuration = 300;

/** Publishes scheduled Instagram and Facebook posts. Vercel Cron calls this every 5 minutes with the CRON_SECRET bearer token. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runDuePosts(createAdminClient());
  return NextResponse.json({ ok: true, ...result });
}
