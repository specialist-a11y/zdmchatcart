import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

async function claimStaffAccess() {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin-login");
  const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Kat";
  if (hasServiceRoleKey()) {
    await createAdminClient()
      .from("platform_staff")
      .upsert({ user_id: user.id, name, role: "owner" }, { onConflict: "user_id" });
    redirect("/admin");
  }
}

export default async function AdminSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; email?: string; missingKey?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin-login");
  }

  const userId = params.userId || user.id;
  const email = params.email || user.email || "your account";
  const missingKey = params.missingKey === "1" || !hasServiceRoleKey();

  const sqlInsert = `insert into public.platform_staff (user_id, name, role)
values ('${userId}', 'Kat', 'owner')
on conflict (user_id) do update set role = 'owner';`;

  return (
    <main className="container stack" style={{ maxWidth: 740, paddingTop: 60, paddingBottom: 80 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="logo">ZDM ChatCart · Admin Setup</span>
        <Link href="/dashboard" className="btn secondary small">Go to Business Dashboard</Link>
      </div>

      <div className="card stack" style={{ border: "2px solid var(--blue, #3d8bff)", borderRadius: 18, padding: 32 }}>
        <div className="row" style={{ alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 32 }}>🔒</span>
          <div>
            <h1 style={{ fontSize: 26, margin: 0 }}>ZDMINC Studio Admin Setup</h1>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Logged in as <strong>{email}</strong>
            </p>
          </div>
        </div>

        <p style={{ fontSize: 15, lineHeight: 1.6 }}>
          In production, <code>/admin</code> returns a <strong>404</strong> to keep the admin portal hidden from customers and uninvited visitors. To access the admin studio, your account must be registered in the <code>platform_staff</code> table.
        </p>

        <hr style={{ border: "none", borderTop: "1px solid var(--line, #e5e7eb)", margin: "8px 0" }} />

        <div className="stack" style={{ gap: 18 }}>
          <div className="stack" style={{ gap: 6 }}>
            <h3 style={{ fontSize: 16, margin: 0 }}>Step 1: Run the Admin Migration</h3>
            <p className="muted" style={{ fontSize: 14, margin: 0 }}>
              If you haven't already, run <code>supabase/migrations/0002_admin.sql</code> in your <strong>Supabase Dashboard &gt; SQL Editor</strong>.
            </p>
          </div>

          <div className="stack" style={{ gap: 6 }}>
            <h3 style={{ fontSize: 16, margin: 0 }}>Step 2: Grant Staff Permissions to Your Account</h3>
            <p className="muted" style={{ fontSize: 14, margin: 0 }}>
              Copy and run this SQL query in your <strong>Supabase SQL Editor</strong>:
            </p>
            <pre style={{
              background: "#1e2724",
              color: "#5dd39e",
              padding: 16,
              borderRadius: 10,
              fontSize: 13,
              overflowX: "auto",
              lineHeight: 1.5,
              userSelect: "all",
            }}>
              {sqlInsert}
            </pre>
          </div>

          {missingKey && (
            <div className="stack" style={{ gap: 6, background: "#fff8ec", padding: 16, borderRadius: 12, border: "1px solid #fed7aa" }}>
              <h3 style={{ fontSize: 15, margin: 0, color: "#9a3412" }}>⚠️ Step 3: Add SUPABASE_SERVICE_ROLE_KEY to .env.local</h3>
              <p style={{ fontSize: 13, margin: 0, color: "#7c2d12", lineHeight: 1.5 }}>
                The admin studio uses the service role key to manage subscriptions, tickets, and clients.
                Go to <strong>Supabase Dashboard &gt; Project Settings &gt; API &gt; service_role (secret key)</strong>, paste it into <code>.env.local</code> as <code>SUPABASE_SERVICE_ROLE_KEY=...</code>, and restart the dev server.
              </p>
            </div>
          )}

          <div className="row" style={{ marginTop: 12, gap: 12 }}>
            {!missingKey && (
              <form action={claimStaffAccess}>
                <button type="submit" className="btn">
                  Activate My Admin Owner Access →
                </button>
              </form>
            )}
            <Link href="/admin" className="btn secondary">
              Open Admin (/admin) →
            </Link>
            <Link href="/dashboard" className="btn secondary">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
