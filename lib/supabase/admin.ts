import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

export function hasServiceRoleKey() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return Boolean(k && k !== SUPABASE_ANON_KEY && !k.startsWith("sb_publishable_"));
}

/**
 * Service-role client. Bypasses RLS, so only use it in server code that has
 * already decided which business it is acting for (webhooks, public order API).
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || SUPABASE_ANON_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
