import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInvoice, logEvent } from "@/lib/zdm-billing";
import { CORE, entitlementsFrom, featureLabel, firstInvoice } from "@/lib/plan-features";
import { todayIn } from "@/lib/billing";
import { money } from "@/lib/staff";
import { SignupEmail } from "./SignupEmail";

export const metadata = { title: "Sign up · ZDM ChatCart" };

const Form = z.object({
  plan: z.string().min(2),
  name: z.string().min(2, "Add your business name").max(80),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/, "Shop address: lowercase letters, numbers and dashes"),
  prefix: z.string().regex(/^[A-Z]{1,4}$/, "Order code prefix: 1 to 4 letters"),
  whatsapp: z.string().regex(/^\d{7,15}$/, "WhatsApp number: digits with the country code, e.g. 1 246 555 1234"),
  contact_name: z.string().min(2, "Add your name").max(80),
});

async function signUp(f: FormData) {
  "use server";
  const get = (k: string) => String(f.get(k) ?? "").trim();
  const plan = get("plan");
  const back = (msg: string): never => redirect(`/signup?plan=${encodeURIComponent(plan)}&error=${encodeURIComponent(msg)}`);
  const parsed = Form.safeParse({
    plan, name: get("name"), slug: get("slug").toLowerCase(), prefix: get("prefix").toUpperCase(),
    whatsapp: get("whatsapp").replace(/\D/g, ""), contact_name: get("contact_name"),
  });
  if (!parsed.success) back(parsed.error.issues[0].message);
  const v = parsed.data!;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/signup?plan=${encodeURIComponent(plan)}`);
  const admin = createAdminClient();
  const { data: p } = await admin.from("plans").select("id, name, monthly_price, setup_fee, currency, active, self_serve").eq("id", v.plan).maybeSingle();
  if (!p?.active || !p.self_serve) back("Pick a plan");

  const { data: bid, error } = await supabase.rpc("create_business", { p_name: v.name, p_slug: v.slug, p_prefix: v.prefix, p_whatsapp: v.whatsapp });
  if (error || !bid) back(error?.code === "23505" ? "That shop address is taken, try another" : error?.message ?? "Couldn't create your account");

  await admin.from("businesses").update({ contact_name: v.contact_name, contact_phone: v.whatsapp, contact_email: user!.email, billing_email: user!.email }).eq("id", bid);
  await admin.from("subscriptions").upsert({ business_id: bid, plan_id: p!.id, status: "pending_payment" });
  const fi = firstInvoice({ name: p!.name, monthly_price: Number(p!.monthly_price), setup_fee: Number(p!.setup_fee) });
  try {
    await createInvoice(admin, { businessId: bid as string, description: fi.description, amount: fi.amount, dueDate: todayIn(), currency: p!.currency, isFirst: true });
  } catch { /* ZDMINC can send it from admin */ }
  await logEvent(admin, bid as string, { id: user!.id, name: v.contact_name }, "client_created", `Signed up online on ${p!.name}; setup invoice BBD $${fi.amount.toFixed(2)} sent`);
  redirect(`/dashboard/${v.slug}/billing?welcome=1`);
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: plans } = await createAdminClient().from("plans").select("*").eq("active", true).eq("self_serve", true).order("rank");
  const chosen = (plans ?? []).find((p) => p.id === sp.plan) ?? null;

  return (
    <main className="container stack" style={{ maxWidth: 1080, paddingTop: 40, paddingBottom: 60 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Link href="/" className="logo" style={{ textDecoration: "none" }}>ZDM ChatCart</Link>
        {user ? <Link href="/dashboard">Your businesses</Link> : <Link href="/login">Log in</Link>}
      </div>
      <h1>{chosen ? `Start on ${chosen.name}` : "Pick your plan"}</h1>
      <p className="muted" style={{ margin: 0 }}>Prices in BBD. Every plan includes 1,000 contacts and a one-time setup where ZDMINC sets up your payment system for you. You can upgrade any time.</p>

      <div className="grid">
        {(plans ?? []).map((p) => {
          const on = p.id === chosen?.id;
          return (
            <Link key={p.id} href={`/signup?plan=${p.id}`} className="card stack" style={{ textDecoration: "none", color: "inherit", borderColor: on ? "var(--blue)" : undefined, borderWidth: on ? 2.5 : undefined }}>
              <div className="row" style={{ justifyContent: "space-between" }}><strong style={{ fontSize: 18 }}>{p.name}</strong>{on && <span className="badge paid">Chosen</span>}</div>
              <span style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: 30, fontWeight: 800 }}>{money(p.monthly_price)}<span className="muted" style={{ fontSize: 14, fontWeight: 500 }}> /month</span></span>
              <span className="muted" style={{ fontSize: 13 }}>+ {money(p.setup_fee)} one-time setup</span>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
                {entitlementsFrom(p, "active").features.map((k) => <li key={k}><strong>{featureLabel(k).split(" (")[0]}</strong></li>)}
                {p.posts_per_month > 0 && <li>{p.posts_per_month} image posts a month made for you</li>}
                {p.video_clips > 0 && <li>{p.video_clips} short videos a month</li>}
                <li>{p.seats} team logins</li>
              </ul>
              <span className="btn small" style={{ alignSelf: "flex-start", marginTop: "auto" }}>{on ? "Selected" : `Choose ${p.name}`}</span>
            </Link>
          );
        })}
      </div>
      <details className="card" style={{ fontSize: 14 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>On every plan</summary>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>{CORE.map((c) => <li key={c}>{c}</li>)}</ul>
      </details>

      {chosen && (
        user ? (
          <form action={signUp} className="card stack" style={{ maxWidth: 620 }}>
            <h2>Your business</h2>
            <input type="hidden" name="plan" value={chosen.id} />
            <label>Your name<input name="contact_name" required defaultValue={(user.user_metadata as any)?.full_name ?? ""} /></label>
            <label>Business name<input name="name" required placeholder="Island Crumb Bakery" /></label>
            <label>Shop address (letters, numbers and dashes)<input name="slug" required pattern="[a-z0-9][a-z0-9-]{1,40}" placeholder="island-crumb-bakery" /></label>
            <label>Order code prefix (1 to 4 letters, e.g. IC for IC-1048)<input name="prefix" required pattern="[A-Za-z]{1,4}" placeholder="IC" /></label>
            <label>WhatsApp number for orders (with country code)<input name="whatsapp" required inputMode="tel" placeholder="1 246 555 1234" /></label>
            <p className="muted" style={{ margin: 0 }}>Signed in as {user.email}. Next you'll see your setup invoice: {money(Number(chosen.setup_fee) + Number(chosen.monthly_price))} ({money(chosen.setup_fee)} setup + first month), payable by card or bank transfer.</p>
            {sp.error && <p className="error">{sp.error}</p>}
            <button className="btn blue" style={{ alignSelf: "flex-start" }}>Create my account</button>
          </form>
        ) : <SignupEmail plan={chosen.id} planName={chosen.name} />
      )}
    </main>
  );
}
