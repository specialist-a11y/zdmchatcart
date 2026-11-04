import "server-only";
import { notFound, redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export type Staff = { user_id: string; name: string; role: "owner" | "manager" | "support" | "editor" };

/** The ZDMINC team only. Everyone else gets a 404 so /admin is not advertised. */
export async function requireStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: staff } = await supabase
    .from("platform_staff")
    .select("user_id, name, role")
    .eq("user_id", user.id)
    .maybeSingle<Staff>();
  if (staff) return { supabase, user, staff };

  // In development, automatically grant the logged-in developer owner access:
  if (process.env.NODE_ENV !== "production") {
    const devStaff: Staff = {
      user_id: user.id,
      name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Katrina",
      role: "owner",
    };
    return { supabase, user, staff: devStaff };
  }

  notFound();
}

export async function requireStaffManager() {
  const ctx = await requireStaff();
  if (ctx.staff.role !== "owner" && ctx.staff.role !== "manager") redirect("/admin?msg=Only owners and managers can do that");
  return ctx;
}

/** True when the signed-in user is ZDMINC staff. Used by "View as client". */
export async function getStaff(): Promise<Staff | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("platform_staff").select("user_id, name, role").eq("user_id", user.id).maybeSingle<Staff>();
  if (data) return data;
  if (process.env.NODE_ENV !== "production") {
    return {
      user_id: user.id,
      name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Katrina",
      role: "owner",
    };
  }
  return null;
}

export const money = (n: number | string, currency = "BBD") =>
  `${currency} $${Number(n).toLocaleString("en-US", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export const ago = (iso: string, now = Date.now()) => {
  const m = Math.round((now - Date.parse(iso)) / 60000);
  if (m < 60) return `${Math.max(m, 1)}m`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
};
