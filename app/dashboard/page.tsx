import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: memberships } = await supabase
    .from("business_members")
    .select("role, businesses(name, slug)")
    .eq("user_id", user.id);

  return (
    <main className="container stack" style={{ maxWidth: 760 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="logo">ZDM ChatCart</span>
        <form action={signOut}><button className="btn secondary small">Sign out</button></form>
      </div>
      <h1>Your businesses</h1>
      {memberships && memberships.length > 0 ? (
        <div className="stack">
          {memberships.map((m: any) => (
            <Link key={m.businesses.slug} href={`/dashboard/${m.businesses.slug}`} className="card row" style={{ justifyContent: "space-between", textDecoration: "none", color: "inherit" }}>
              <strong>{m.businesses.name}</strong>
              <span className="badge">{m.role}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="muted">No businesses yet. <Link href="/signup">Pick a plan to get started</Link>.</p>
      )}

      <div className="card stack">
        <h2 style={{ fontSize: 24 }}>Add a business</h2>
        <p className="muted" style={{ margin: 0 }}>Pick a plan, add your business details, then pay the setup invoice by card or bank transfer.</p>
        <Link href="/signup" className="btn" style={{ alignSelf: "flex-start" }}>Choose a plan</Link>
        {error && <p className="error">{error}</p>}
      </div>
    </main>
  );
}
