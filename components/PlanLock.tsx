import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { featureLabel, plansWith, sectionOpen, SECTION_FEATURE, type Entitlements, type FeatureKey } from "@/lib/plan-features";
import { requireMembership } from "@/lib/business";
import { getEntitlements } from "@/lib/entitlements";
import { money } from "@/lib/staff";

/** Shown in place of a section the plan doesn't include, or while the first payment is outstanding. */
export async function PlanLock({ slug, feature, ent }: { slug: string; feature?: FeatureKey; ent: Entitlements }) {
  const billing = `/dashboard/${slug}/billing`;
  if (!ent.live) {
    const waiting = ent.status === "pending_payment";
    return (
      <div className="card stack" style={{ maxWidth: 640, background: "#fff8ec" }}>
        <h2>{waiting ? "This opens once your first payment is in" : "Your account is paused"}</h2>
        <p style={{ margin: 0 }}>{waiting
          ? "Pay your setup invoice by card or bank transfer. While ZDMINC sets up your payments, WhatsApp and Instagram, you can add products and your business info."
          : "Pay any open invoice or contact ZDMINC to switch your account back on."}</p>
        <Link className="btn blue small" style={{ alignSelf: "flex-start" }} href={billing}>Go to Plan and billing</Link>
      </div>
    );
  }
  const { data: plans } = await createAdminClient().from("plans").select("id, name, rank, monthly_price, features, video_clips, active").eq("active", true);
  const options = feature ? plansWith(plans ?? [], feature) : [];
  return (
    <div className="card stack" style={{ maxWidth: 640 }}>
      <span className="badge high" style={{ alignSelf: "flex-start" }}>Not on {ent.planName ?? "your plan"}</span>
      <h2>{feature ? featureLabel(feature) : "Not on your plan"}</h2>
      {options.length > 0 ? (
        <p style={{ margin: 0 }}>Included on {options.map((p, i) => <span key={p.id}>{i ? ", " : ""}<strong>{p.name}</strong> ({money(p.monthly_price)} a month)</span>)}. Upgrades start today; you only pay the difference for the rest of this month.</p>
      ) : <p style={{ margin: 0 }}>Ask ZDMINC about adding this to your account.</p>}
      <Link className="btn blue small" style={{ alignSelf: "flex-start" }} href={billing}>See plans and upgrade</Link>
    </div>
  );
}

/**
 * Put at the top of a CRM page: returns the lock card when the plan (or an unpaid first invoice)
 * doesn't open this section, otherwise null. ZDMINC staff viewing as the client always get in, to set things up.
 */
export async function gateSection(slug: string, navKey: string) {
  const { business, viewingAsStaff } = await requireMembership(slug);
  if (viewingAsStaff) return null;
  const ent = await getEntitlements(business.id);
  if (sectionOpen(ent, navKey)) return null;
  return <PlanLock slug={slug} ent={ent} feature={SECTION_FEATURE[navKey]} />;
}
