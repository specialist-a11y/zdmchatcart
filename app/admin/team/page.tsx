import { PageHeader } from "@/components/CrmShell";
import { adminNum } from "@/lib/crm-nav";
import { requireStaff } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { addStaff, removeStaff } from "../actions";

const ROLES = [
  ["owner", "Everything, including prices and team"],
  ["manager", "Everything, including prices and team"],
  ["support", "Clients, support, WhatsApp, invoices"],
  ["editor", "Same access; usually works in Video uploads"],
] as const;

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { staff } = await requireStaff();
  const { msg } = await searchParams;
  const manager = staff.role === "owner" || staff.role === "manager";
  const { data: team } = await createAdminClient().from("platform_staff").select("*").order("created_at");
  return (
    <>
      <PageHeader n={adminNum("/admin/team")} title="Team" sub={`Who at ZDMINC can open the admin. Everyone here can see every client.`} />
      {msg && <p className="ok">{msg}</p>}
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Since</th><th /></tr></thead>
          <tbody>
            {(team ?? []).map((m) => (
              <tr key={m.user_id}>
                <td><strong>{m.name}</strong>{m.user_id === staff.user_id ? " (you)" : ""}</td>
                <td>{m.role}</td>
                <td>{new Date(m.created_at).toLocaleDateString("en-GB")}</td>
                <td>{manager && m.user_id !== staff.user_id && <form action={removeStaff}><input type="hidden" name="user_id" value={m.user_id} /><button className="btn secondary small">Remove</button></form>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {manager && (
        <form action={addStaff} className="card stack" style={{ maxWidth: 560 }}>
          <h2>Add a team member</h2>
          <label>Name<input name="name" required /></label>
          <label>Email<input name="email" type="email" required /></label>
          <label>Role<select name="role" defaultValue="support">{ROLES.map(([r, d]) => <option key={r} value={r}>{r}: {d}</option>)}</select></label>
          <button className="btn blue" style={{ alignSelf: "flex-start" }}>Send invite</button>
        </form>
      )}
    </>
  );
}
