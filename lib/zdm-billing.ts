import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPaymentUrl } from "./fygaro";
import { sendZdm } from "./zdm-whatsapp";
import { addMonths, contactOverage, previewChange, reminderDue, round2, todayIn, type PlanLite, type Timing } from "./billing";

/**
 * ZDMINC's own billing of its clients: invoices paid by Fygaro link on ZDMINC's Fygaro account,
 * plan changes with prorating, and the daily renewal run. All functions take the service-role client.
 */
type Admin = SupabaseClient;
export type Actor = { id: string | null; name: string };

export function zdmFygaro() {
  const buttonUrl = process.env.ZDM_FYGARO_BUTTON_URL;
  const keyId = process.env.ZDM_FYGARO_KEY_ID;
  const secret = process.env.ZDM_FYGARO_SECRET;
  return buttonUrl && keyId && secret ? { buttonUrl, keyId, secret } : null;
}

export async function logEvent(admin: Admin, businessId: string, actor: Actor, kind: string, summary: string) {
  await admin.from("account_events").insert({ business_id: businessId, actor_id: actor.id, actor_name: actor.name, kind, summary });
}

/** Message the client's owner from ZDMINC's WhatsApp number (logged in the admin WhatsApp inbox). */
export async function notifyClient(admin: Admin, businessId: string, body: string, actor: Actor = { id: null, name: "ZDMINC" }) {
  const { data: b } = await admin.from("businesses").select("contact_phone, contact_name").eq("id", businessId).maybeSingle();
  if (!b?.contact_phone) return { ok: false, error: "no contact phone" };
  return sendZdm(admin, { phone: b.contact_phone, body, actor, businessId, contactName: b.contact_name });
}

/** A paid ad top-up adds to the client's ad wallet. Safe to call twice: one entry per invoice. */
export async function creditWallet(admin: Admin, invoiceId: string) {
  const { data: inv } = await admin.from("invoices").select("id, business_id, number, amount, kind, status").eq("id", invoiceId).single();
  if (!inv || inv.kind !== "ad_topup" || inv.status !== "paid") return;
  const { error } = await admin.from("ad_wallet_entries").insert({ business_id: inv.business_id, kind: "topup", amount: inv.amount, invoice_id: inv.id, note: `Top-up ${inv.number}` });
  if (!error) await logEvent(admin, inv.business_id, { id: null, name: "Ad wallet" }, "ads", `Ad wallet topped up BBD $${Number(inv.amount).toFixed(2)}`);
}

export async function walletBalance(admin: Admin, businessId: string) {
  const { data } = await admin.from("ad_wallet_entries").select("amount").eq("business_id", businessId);
  return round2((data ?? []).reduce((n, e) => n + Number(e.amount), 0));
}

export async function createInvoice(admin: Admin, opts: { businessId: string; description: string; amount: number; dueDate: string; currency?: string; kind?: "subscription" | "ad_topup" | "other"; isFirst?: boolean }) {
  const { data: number, error: numErr } = await admin.rpc("next_invoice_number");
  if (numErr || !number) throw new Error(numErr?.message ?? "could not number invoice");
  const amount = round2(opts.amount);
  const { data: inv, error } = await admin
    .from("invoices")
    .insert({ business_id: opts.businessId, number, description: opts.description, amount, currency: opts.currency ?? "BBD", due_date: opts.dueDate, status: "sent", kind: opts.kind ?? "subscription", is_first: !!opts.isFirst })
    .select("id, number, amount, currency")
    .single();
  if (error || !inv) throw new Error(error?.message ?? "could not create invoice");
  const fy = zdmFygaro();
  let paymentUrl: string | null = null;
  if (fy && amount > 0) {
    paymentUrl = buildPaymentUrl({ ...fy, amount, currency: inv.currency, reference: inv.id, expiresInSeconds: 30 * 24 * 3600 });
    await admin.from("invoices").update({ payment_url: paymentUrl }).eq("id", inv.id);
  }
  return { ...inv, payment_url: paymentUrl };
}

export type PlanContacts = { contacts_included: number; extra_contacts_block: number; extra_contacts_price: number };

/** How many contacts a client has right now and what that adds to their bill. */
export async function contactUsage(admin: Admin, businessId: string, plan: PlanContacts) {
  const { count } = await admin.from("customers").select("id", { count: "exact", head: true }).eq("business_id", businessId);
  return { count: count ?? 0, ...contactOverage(count ?? 0, plan.contacts_included, plan.extra_contacts_block, plan.extra_contacts_price) };
}

type Sub = { business_id: string; plan_id: string; status: string; current_period_start: string; current_period_end: string; pending_plan_id: string | null; credit: number };

async function loadPlans(admin: Admin) {
  const { data } = await admin.from("plans").select("id, name, monthly_price, rank, currency, contacts_included, extra_contacts_block, extra_contacts_price");
  return new Map((data ?? []).map((p: any) => [p.id, { ...p, monthly_price: Number(p.monthly_price), extra_contacts_price: Number(p.extra_contacts_price) }])) as Map<string, PlanLite & PlanContacts & { currency: string }>;
}

export async function changePlan(admin: Admin, opts: {
  businessId: string; toPlanId: string; timing?: Timing; reason?: string; actor: Actor; byClient?: boolean; today?: string;
}) {
  const today = opts.today ?? todayIn();
  const plans = await loadPlans(admin);
  const { data: sub } = await admin.from("subscriptions").select("*").eq("business_id", opts.businessId).single<Sub>();
  if (!sub) throw new Error("No subscription for this client");
  const from = plans.get(sub.plan_id);
  const to = plans.get(opts.toPlanId);
  if (!from || !to) throw new Error("Unknown plan");
  const pv = previewChange({ from, to, timing: opts.timing, periodStart: sub.current_period_start, periodEnd: sub.current_period_end, today, existingCredit: Number(sub.credit) });
  if (pv.direction === "same") {
    if (sub.pending_plan_id) {
      await admin.from("subscriptions").update({ pending_plan_id: null, updated_at: new Date().toISOString() }).eq("business_id", sub.business_id);
      await admin.from("plan_changes").update({ status: "cancelled" }).eq("business_id", sub.business_id).eq("status", "scheduled");
      await logEvent(admin, sub.business_id, opts.actor, "plan_change", `Cancelled the scheduled plan change, staying on ${from.name}`);
    }
    return { preview: pv, invoice: null };
  }

  let invoice: Awaited<ReturnType<typeof createInvoice>> | null = null;
  if (pv.timing === "renewal") {
    await admin.from("plan_changes").update({ status: "cancelled" }).eq("business_id", sub.business_id).eq("status", "scheduled");
    await admin.from("subscriptions").update({ pending_plan_id: to.id, updated_at: new Date().toISOString() }).eq("business_id", sub.business_id);
  } else {
    await admin.from("plan_changes").update({ status: "cancelled" }).eq("business_id", sub.business_id).eq("status", "scheduled");
    await admin.from("subscriptions").update({
      plan_id: to.id, pending_plan_id: null, credit: round2(Number(sub.credit) + pv.creditNow), updated_at: new Date().toISOString(),
    }).eq("business_id", sub.business_id);
    if (pv.chargeNow > 0) {
      invoice = await createInvoice(admin, { businessId: sub.business_id, description: `Upgrade ${from.name} to ${to.name}, prorated to ${sub.current_period_end}`, amount: pv.chargeNow, dueDate: today, currency: to.currency });
    }
  }
  await admin.from("plan_changes").insert({
    business_id: sub.business_id, from_plan: from.id, to_plan: to.id, direction: pv.direction, timing: pv.timing,
    status: pv.timing === "renewal" ? "scheduled" : "applied",
    proration: pv.chargeNow > 0 ? pv.chargeNow : -pv.creditNow,
    reason: opts.reason || null, changed_by: opts.actor.id, by_client: !!opts.byClient, effective_on: pv.effectiveOn,
  });
  const verb = pv.direction === "upgrade" ? "Upgraded" : "Downgraded";
  const when = pv.timing === "renewal" ? ` from ${pv.effectiveOn}` : "";
  const money = pv.chargeNow > 0 ? ` · charged BBD $${pv.chargeNow.toFixed(2)} prorated` : pv.creditNow > 0 ? ` · credited BBD $${pv.creditNow.toFixed(2)}` : "";
  await logEvent(admin, sub.business_id, opts.actor, "plan_change", `${pv.timing === "renewal" ? "Scheduled: " : ""}${verb} ${from.name} to ${to.name}${when}${money}`);
  return { preview: pv, invoice };
}

/**
 * Daily run (cron or the button on Plans and billing):
 * 1. renew subscriptions whose period ended, applying any scheduled downgrade and using credit,
 * 2. mark unpaid invoices overdue and flag which need a day-3 or day-7 reminder.
 */
export async function runBilling(admin: Admin, today = todayIn()) {
  const plans = await loadPlans(admin);
  const actor: Actor = { id: null, name: "Billing run" };
  const { data: due } = await admin.from("subscriptions").select("*").lte("current_period_end", today).in("status", ["active", "past_due", "trial"]);
  let renewed = 0;
  for (const sub of (due ?? []) as Sub[]) {
    let planId = sub.plan_id;
    if (sub.pending_plan_id) {
      planId = sub.pending_plan_id;
      await admin.from("plan_changes").update({ status: "applied" }).eq("business_id", sub.business_id).eq("status", "scheduled");
      await logEvent(admin, sub.business_id, actor, "plan_change", `Scheduled change applied: now on ${plans.get(planId)?.name ?? planId}`);
    }
    const plan = plans.get(planId);
    if (!plan) continue;
    // Catch up if the run was missed for more than one period.
    let start = sub.current_period_end;
    let end = addMonths(start, 1);
    while (end <= today) { start = end; end = addMonths(start, 1); }
    const credit = Number(sub.credit);
    // Contacts over the plan's allowance are billed for the month ahead, counted at renewal.
    const contacts = await contactUsage(admin, sub.business_id, plan);
    const gross = round2(plan.monthly_price + contacts.amount);
    const amount = Math.max(0, round2(gross - credit));
    const creditLeft = round2(Math.max(0, credit - gross));
    // Claim the renewal first so a second run on the same day can't double-bill.
    const { data: claimed } = await admin.from("subscriptions")
      .update({ plan_id: planId, pending_plan_id: null, current_period_start: start, current_period_end: end, credit: creditLeft, status: sub.status === "trial" ? "active" : sub.status, updated_at: new Date().toISOString() })
      .eq("business_id", sub.business_id).eq("current_period_end", sub.current_period_end).select("business_id");
    if (!claimed?.length) continue;
    if (amount > 0) {
      const inv = await createInvoice(admin, { businessId: sub.business_id, description: `${plan.name}, ${start} to ${end}${contacts.blocks ? `, plus ${contacts.count.toLocaleString("en-US")} contacts (${contacts.blocks} extra block${contacts.blocks > 1 ? "s" : ""} of ${plan.extra_contacts_block.toLocaleString("en-US")}, BBD $${contacts.amount.toFixed(2)})` : ""}${credit > 0 ? ` (credit BBD $${Math.min(credit, gross).toFixed(2)} applied)` : ""}`, amount, dueDate: start, currency: plan.currency });
      await logEvent(admin, sub.business_id, actor, "invoice", `Invoice ${inv.number} for BBD $${amount.toFixed(2)} sent`);
      if (inv.payment_url) await notifyClient(admin, sub.business_id, `Your ZDM ChatCart invoice ${inv.number} for BBD $${amount.toFixed(2)} (${plan.name}) is ready. Pay here: ${inv.payment_url}${(await zdmBankDetails(admin)) ? TRANSFER_HINT : ""}`);
    }
    renewed++;
  }

  await admin.from("invoices").update({ status: "overdue" }).eq("status", "sent").lt("due_date", today);
  const { data: open } = await admin.from("invoices").select("id, business_id, number, amount, due_date, reminders_sent, payment_url").eq("status", "overdue").is("transfer_submitted_at", null);
  let reminded = 0;
  for (const inv of open ?? []) {
    const r = reminderDue(inv.due_date, today, inv.reminders_sent);
    if (!r) continue;
    const res = await notifyClient(admin, inv.business_id, `Reminder: ZDM ChatCart invoice ${inv.number} for BBD $${Number(inv.amount).toFixed(2)} is overdue.${inv.payment_url ? ` Pay here: ${inv.payment_url}` : ""}`);
    await admin.from("invoices").update({ reminders_sent: r }).eq("id", inv.id);
    await logEvent(admin, inv.business_id, actor, "invoice", `Reminder ${r} for ${inv.number}${res.ok ? " sent on WhatsApp" : " due (send it by hand: " + (res.error ?? "not sent") + ")"}`);
    if (r === 2) await admin.from("subscriptions").update({ status: "past_due" }).eq("business_id", inv.business_id).eq("status", "active");
    reminded++;
  }
  return { renewed, reminded };
}

/** Fygaro hook for ZDMINC's own invoices. Returns true when the payment was for an invoice. */
export type PaidVia = "card" | "transfer" | "cash" | "other";

export async function markInvoicePaid(admin: Admin, invoiceId: string, amount: string, txn: string, via: PaidVia = "card", actor: Actor = { id: null, name: via === "card" ? "Fygaro" : "Bank transfer" }) {
  const { data: inv } = await admin.from("invoices").select("id, business_id, number, amount, status, kind").eq("id", invoiceId).maybeSingle();
  if (!inv) return false;
  if (inv.status === "paid") return true;
  if (via === "card" && Math.round(Number(amount) * 100) < Math.round(Number(inv.amount) * 100)) {
    await logEvent(admin, inv.business_id, actor, "invoice", `Fygaro paid ${amount} for ${inv.number}, less than the amount due. Check manually.`);
    return true;
  }
  const { data: changed } = await admin.from("invoices").update({
    status: "paid", paid_at: new Date().toISOString(), paid_via: via,
    ...(via === "card" ? { fygaro_transaction_id: txn } : txn ? { transfer_reference: txn } : {}),
  }).eq("id", inv.id).neq("status", "paid").select("id");
  if (!changed?.length) return true;
  await logEvent(admin, inv.business_id, actor, "invoice", `${inv.number} paid${via === "transfer" ? " by bank transfer" : via === "card" ? "" : ` (${via})`}, BBD $${Number(inv.amount).toFixed(2)}`);
  await afterInvoicePaid(admin, inv.id);
  return true;
}

/**
 * Everything that follows a paid invoice, however it was paid: ad top-ups go to the wallet,
 * the first invoice (setup + first month) starts the subscription, and a cleared overdue lifts "past due".
 */
export async function afterInvoicePaid(admin: Admin, invoiceId: string) {
  const { data: inv } = await admin.from("invoices").select("id, business_id, number, kind, is_first").eq("id", invoiceId).single();
  if (!inv) return;
  if (inv.kind === "ad_topup") await creditWallet(admin, inv.id);
  const { data: sub } = await admin.from("subscriptions").select("status, plans!subscriptions_plan_id_fkey(name)").eq("business_id", inv.business_id).maybeSingle<any>();
  if (sub?.status === "pending_payment" && inv.is_first) {
    const today = todayIn();
    await admin.from("subscriptions").update({ status: "active", current_period_start: today, current_period_end: addMonths(today, 1), updated_at: new Date().toISOString() })
      .eq("business_id", inv.business_id).eq("status", "pending_payment");
    await logEvent(admin, inv.business_id, { id: null, name: "Signup" }, "plan_change", `First payment in: ${sub.plans?.name ?? "plan"} is live. Start the setup.`);
    await notifyClient(admin, inv.business_id, `Thank you! Your ZDM ChatCart ${sub.plans?.name ?? ""} plan is live. ZDMINC will message you to book your setup: payments, WhatsApp, Instagram and your shop.`).catch(() => null);
  }
  const { count } = await admin.from("invoices").select("id", { count: "exact", head: true }).eq("business_id", inv.business_id).eq("status", "overdue");
  if (!count) await admin.from("subscriptions").update({ status: "active" }).eq("business_id", inv.business_id).eq("status", "past_due");
}

/** ZDMINC's bank details for clients paying invoices by transfer (Admin > Plans and billing). */
export async function zdmBankDetails(admin: Admin) {
  const { data } = await admin.from("platform_settings").select("value").eq("key", "zdm_bank_details").maybeSingle();
  const v = (data?.value ?? "").trim();
  return v.length >= 10 ? v : null;
}

/** Line added to invoice messages so clients know they can pay by bank transfer too. */
export const TRANSFER_HINT = " You can pay by bank transfer (1st Pay or CIBC): the details are in Plan and billing.";
