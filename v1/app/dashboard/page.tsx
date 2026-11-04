import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function createBusiness(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const prefix = String(formData.get("prefix") ?? "").trim().toUpperCase();
  const whatsapp = String(formData.get("whatsapp") ?? "");
  const { error } = await supabase.rpc("create_business", {
    p_name: name,
    p_slug: slug,
    p_prefix: prefix,
    p_whatsapp: whatsapp,
  });
  if (error) redirect(`/dashboard?error=${encodeURIComponent(error.message)}`);
  redirect(`/dashboard/${slug}`);
}

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

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
        <span className="logo">ChatCart</span>
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
        <p className="muted">No businesses yet. Create your first one below.</p>
      )}

      <form action={createBusiness} className="card stack">
        <h2 style={{ fontSize: 24 }}>Add a business</h2>
        <label>Business name<input name="name" required placeholder="Zephirin's Bakery" /></label>
        <label>
          Shop address (letters, numbers and dashes)
          <input name="slug" required pattern="[a-z0-9][a-z0-9-]{1,40}" placeholder="zephirins-bakery" />
        </label>
        <label>
          Order code prefix (1 to 4 capital letters)
          <input name="prefix" required pattern="[A-Za-z]{1,4}" placeholder="ZB" />
        </label>
        <label>
          WhatsApp number customers message (with country code)
          <input name="whatsapp" placeholder="1 246 555 1234" />
        </label>
        <button className="btn">Create business</button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
