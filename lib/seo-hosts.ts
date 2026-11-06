import "server-only";
import { headers } from "next/headers";
import { createClient } from "./supabase/server";

const hostOf = (u?: string) => { try { return u ? new URL(u).host : null; } catch { return null; } };

/** The shop slug when this request is on a shop's own domain, else null (the ZDM ChatCart site). */
export async function shopForThisHost() {
  const host = ((await headers()).get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  const app = hostOf(process.env.NEXT_PUBLIC_SITE_URL);
  if (!host || host === app || host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.endsWith(".vercel.app")) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("shop_for_domain", { p_domain: host });
  return typeof data === "string" && data ? { slug: data, host } : null;
}
