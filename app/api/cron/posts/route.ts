import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDuePosts } from "@/lib/publish";
import { runSummaries } from "@/lib/summary";

export const maxDuration = 60;

/** Publishes scheduled Instagram/Facebook posts and sends daily owner summaries. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const [posts, summaries] = await Promise.all([runDuePosts(admin), runSummaries(admin)]);
  return NextResponse.json({ ok: true, ...posts, summaries });
}
