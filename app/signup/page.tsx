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
import { SignupForm } from "./SignupForm";
import { shopAddress } from "@/lib/signup";

export const metadata = { title: "Sign up · ZDM ChatCart" };

const Form = z.object({
  plan: z.string().min(2),
  name: z.string().min(2, "Add your business name").max(80),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/, "Shop address: at least 2 letters or numbers"),
  prefix: z.string().regex(/^[A-Z]{1,4}$/, "Order code prefix: 1 to 4 letters"),
  whatsapp: z.string().regex(/^\d{7,15}$/, "WhatsApp number: digits with the country code, e.g. 1 246 555 1234"),
  contact_name: z.string().min(2, "Add your name").max(80),
  email: z.string().email("Add a valid email address").max(120),
});

async function signUp(f: FormData) {
  "use server";
  const get = (k: string) => String(f.get(k) ?? "").trim();
  const plan = get("plan");
  // Spaces, capitals and symbols in the shop address are fixed here, not sent back as an error.
  const slug = shopAddress(get("slug") || get("name"));
  // On an error, the form comes back filled in (the WhatsApp number isn't put in the link).
  const keep = new URLSearchParams({ contact_name: get("contact_name"), email: get("email"), name: get("name"), slug, prefix: get("prefix").toUpperCase() });
  const back = (msg: string): never => redirect(`/signup?plan=${encodeURIComponent(plan)}&error=${encodeURIComponent(msg)}&${keep}#details`);
  const parsed = Form.safeParse({
    plan, name: get("name"), slug, prefix: get("prefix").toUpperCase().replace(/[^A-Z]/g, ""),
    whatsapp: get("whatsapp").replace(/\D/g, ""), contact_name: get("contact_name"), email: get("email").toLowerCase(),
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

  await admin.from("businesses").update({ contact_name: v.contact_name, contact_phone: v.whatsapp, contact_email: v.email, billing_email: v.email }).eq("id", bid);
  await admin.from("subscriptions").upsert({ business_id: bid, plan_id: p!.id, status: "pending_payment" });
  const fi = firstInvoice({ name: p!.name, monthly_price: Number(p!.monthly_price), setup_fee: Number(p!.setup_fee) });
  try {
    await createInvoice(admin, { businessId: bid as string, description: fi.description, amount: fi.amount, dueDate: todayIn(), currency: p!.currency, isFirst: true });
  } catch { /* ZDMINC can send it from admin */ }
  await logEvent(admin, bid as string, { id: user!.id, name: v.contact_name }, "client_created", `Signed up online on ${p!.name}; setup invoice BBD $${fi.amount.toFixed(2)} sent`);
  redirect(`/dashboard/${v.slug}/billing?welcome=1`);
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string; error?: string; contact_name?: string; email?: string; name?: string; slug?: string; prefix?: string }> }) {
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
                <li>{p.seats > 1 ? `Team inbox: ${p.seats} logins` : "1 login"}</li>
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
          <div id="details">
            <SignupForm action={signUp} plan={chosen.id} error={sp.error}
              site={(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "")}
              defaults={{ contact_name: sp.contact_name ?? (user.user_metadata as any)?.full_name ?? "", email: sp.email ?? user.email ?? "", name: sp.name ?? "", slug: sp.slug ?? "", prefix: sp.prefix ?? "", whatsapp: "" }}
              note={`Next you'll see your setup invoice: ${money(Number(chosen.setup_fee) + Number(chosen.monthly_price))} (${money(chosen.setup_fee)} setup + first month), payable by card or bank transfer.`} />
          </div>
        ) : <SignupEmail plan={chosen.id} planName={chosen.name} />
      )}
    </main>
  );
}
