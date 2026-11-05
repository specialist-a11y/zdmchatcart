"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, requireStaffManager } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { changePlan, createInvoice, creditWallet, logEvent, notifyClient, runBilling, type Actor } from "@/lib/zdm-billing";
import { digits, sendZdm } from "@/lib/zdm-whatsapp";
import { todayIn } from "@/lib/billing";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (path: string, msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);
const actorOf = (s: { user_id: string; name: string }): Actor => ({ id: s.user_id, name: s.name });
const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? "";

// Clients -------------------------------------------------------------------------------
const NewClient = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/, "Shop address: lowercase letters, numbers and dashes"),
  prefix: z.string().regex(/^[A-Z]{1,4}$/, "Order prefix: 1 to 4 capital letters"),
  plan: z.string().min(2),
  contact_name: z.string().min(2).max(80),
  contact_phone: z.string().regex(/^\d{7,15}$/, "Contact WhatsApp: digits with country code"),
  contact_email: z.string().email("Owner email doesn't look right"),
});

export async function addClient(f: FormData) {
  const { staff } = await requireStaff();
  const parsed = NewClient.safeParse({
    name: str(f, "name"), slug: str(f, "slug").toLowerCase(), prefix: str(f, "prefix").toUpperCase(), plan: str(f, "plan"),
    contact_name: str(f, "contact_name"), contact_phone: digits(str(f, "contact_phone")), contact_email: str(f, "contact_email").toLowerCase(),
  });
  if (!parsed.success) back("/admin", parsed.error.issues[0].message);
  const v = parsed.data!;
  const admin = createAdminClient();
  const { data: biz, error } = await admin.from("businesses").insert({
    name: v.name, slug: v.slug, order_prefix: v.prefix, whatsapp_number: v.contact_phone,
    contact_name: v.contact_name, contact_phone: v.contact_phone, contact_email: v.contact_email,
  }).select("id").single();
  if (error || !biz) back("/admin", error?.code === "23505" ? "That shop address is taken" : error?.message ?? "Could not create client");
  await admin.from("subscriptions").upsert({ business_id: biz!.id, plan_id: v.plan, status: "active" });

  // Invite the owner. If they already have a login, just add them.
  let userId: string | null = null;
  const invite = await admin.auth.admin.inviteUserByEmail(v.contact_email, { redirectTo: `${site()}/auth/callback?next=/dashboard/${v.slug}` });
  if (invite.data.user) userId = invite.data.user.id;
  else {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    userId = list?.users.find((u) => u.email?.toLowerCase() === v.contact_email)?.id ?? null;
  }
  if (userId) await admin.from("business_members").upsert({ business_id: biz!.id, user_id: userId, role: "owner" });
  await logEvent(admin, biz!.id, actorOf(staff), "client_created", `Client created on ${v.plan}; ${userId ? `invite sent to ${v.contact_email}` : "owner invite failed, add them from Team"}`);
  redirect(`/admin/clients/${biz!.id}?msg=${encodeURIComponent("Client created. The owner gets an email invite.")}`);
}

export async function updateContact(f: FormData) {
  const { staff } = await requireStaff();
  const id = str(f, "business_id");
  const admin = createAdminClient();
  await admin.from("businesses").update({
    contact_name: str(f, "contact_name") || null, contact_phone: digits(str(f, "contact_phone")) || null, contact_email: str(f, "contact_email") || null,
  }).eq("id", id);
  // Pull earlier WhatsApp chats from this number into the client's record.
  const phone = digits(str(f, "contact_phone"));
  if (phone) await admin.from("zdm_wa_messages").update({ business_id: id }).eq("phone", phone).is("business_id", null);
  await logEvent(admin, id, actorOf(staff), "contact", "Contact details updated");
  back(`/admin/clients/${id}`, "Contact saved");
}

export async function addNote(f: FormData) {
  const { staff } = await requireStaff();
  const id = str(f, "business_id");
  const body = str(f, "body");
  if (!body) back(`/admin/clients/${id}`, "Write a note first");
  await createAdminClient().from("client_notes").insert({ business_id: id, author_id: staff.user_id, author_name: staff.name, body: body.slice(0, 2000) });
  back(`/admin/clients/${id}`, "Note added");
}

export async function setSubscriptionStatus(f: FormData) {
  const { staff } = await requireStaffManager();
  const id = str(f, "business_id");
  const status = str(f, "status");
  if (!["active", "paused", "cancelled"].includes(status)) back(`/admin/clients/${id}`, "Unknown status");
  const admin = createAdminClient();
  await admin.from("subscriptions").update({ status, updated_at: new Date().toISOString() }).eq("business_id", id);
  await logEvent(admin, id, actorOf(staff), "plan_change", `Subscription ${status === "active" ? "resumed" : status}`);
  back(`/admin/clients/${id}`, `Subscription ${status}`);
}

// Plans ---------------------------------------------------------------------------------
export async function changeClientPlan(f: FormData) {
  const { staff } = await requireStaff();
  const id = str(f, "business_id");
  const timing = str(f, "timing") === "now" ? "now" : "renewal";
  const admin = createAdminClient();
  try {
    const { preview, invoice } = await changePlan(admin, { businessId: id, toPlanId: str(f, "plan"), timing, reason: str(f, "reason"), actor: actorOf(staff) });
    if (f.get("notify") === "on" && preview.direction !== "same") {
      const { data: p } = await admin.from("plans").select("name").eq("id", str(f, "plan")).single();
      const when = preview.timing === "renewal" ? `from ${preview.effectiveOn}` : "starting today";
      await notifyClient(admin, id, `Your ZDM ChatCart plan is changing to ${p?.name} ${when}.${invoice?.payment_url ? ` The prorated amount is BBD $${preview.chargeNow.toFixed(2)}: ${invoice.payment_url}` : ""}`, actorOf(staff));
    }
  } catch (e: any) {
    back(`/admin/clients/${id}/plan`, e.message ?? "Plan change failed");
  }
  back(`/admin/clients/${id}`, "Plan updated");
}

export async function savePlan(f: FormData) {
  await requireStaffManager();
  const price = Number(str(f, "monthly_price"));
  if (!Number.isFinite(price) || price < 0) back("/admin/billing", "Price must be a number");
  const row = {
    name: str(f, "name"), monthly_price: price, description: str(f, "description"),
    video_clips: Number(str(f, "video_clips")) || 0, posts_per_month: Number(str(f, "posts_per_month")) || 0, seats: Number(str(f, "seats")) || 1,
    contacts_included: Math.max(0, Math.round(Number(str(f, "contacts_included")) || 0)),
    extra_contacts_price: Math.max(0, Number(str(f, "extra_contacts_price")) || 0),
    active: f.get("active") === "on",
  };
  const db = createAdminClient();
  const { error } = await db.from("plans").update({ ...row, image_posts: Math.max(0, Math.round(Number(str(f, "image_posts")) || 0)) }).eq("id", str(f, "id"));
  if (error && /image_posts/.test(error.message)) await db.from("plans").update(row).eq("id", str(f, "id")); // before 0015
  back("/admin/billing", "Plan saved. Existing clients pay the new price from their next renewal.");
}

// Invoices ------------------------------------------------------------------------------
export async function newInvoice(f: FormData) {
  const { staff } = await requireStaff();
  const id = str(f, "business_id");
  const amount = Number(str(f, "amount"));
  if (!id || !(amount > 0)) back("/admin/billing", "Pick a client and an amount");
  const admin = createAdminClient();
  const inv = await createInvoice(admin, { businessId: id, description: str(f, "description") || "ZDM ChatCart", amount, dueDate: str(f, "due_date") || todayIn() });
  await logEvent(admin, id, actorOf(staff), "invoice", `Invoice ${inv.number} for BBD $${amount.toFixed(2)} created`);
  if (f.get("notify") === "on") await notifyClient(admin, id, `New ZDM ChatCart invoice ${inv.number}: BBD $${amount.toFixed(2)}.${inv.payment_url ? ` Pay here: ${inv.payment_url}` : ""}`, actorOf(staff));
  back("/admin/billing", `Invoice ${inv.number} created${inv.payment_url ? "" : ". Add ZDMINC's Fygaro keys to include a payment link."}`);
}

export async function setInvoiceStatus(f: FormData) {
  const { staff } = await requireStaff();
  const id = str(f, "id");
  const status = str(f, "status");
  if (!["paid", "void"].includes(status)) back("/admin/billing", "Unknown status");
  const admin = createAdminClient();
  const { data: inv } = await admin.from("invoices").update({ status, paid_at: status === "paid" ? new Date().toISOString() : null }).eq("id", id).select("business_id, number").single();
  if (inv) await logEvent(admin, inv.business_id, actorOf(staff), "invoice", `${inv.number} marked ${status} by hand`);
  if (inv && status === "paid") await creditWallet(admin, id);
  back("/admin/billing", `Invoice marked ${status}`);
}

export async function remindInvoice(f: FormData) {
  const { staff } = await requireStaff();
  const admin = createAdminClient();
  const { data: inv } = await admin.from("invoices").select("id, business_id, number, amount, payment_url, reminders_sent").eq("id", str(f, "id")).single();
  if (!inv) back("/admin/billing", "Invoice not found");
  const res = await notifyClient(admin, inv!.business_id, `Reminder: ZDM ChatCart invoice ${inv!.number} for BBD $${Number(inv!.amount).toFixed(2)} is still open.${inv!.payment_url ? ` Pay here: ${inv!.payment_url}` : ""}`, actorOf(staff));
  await admin.from("invoices").update({ reminders_sent: inv!.reminders_sent + 1 }).eq("id", inv!.id);
  back("/admin/billing", res.ok ? "Reminder sent on WhatsApp" : `Not sent: ${res.error}`);
}

export async function runBillingNow() {
  await requireStaffManager();
  const r = await runBilling(createAdminClient());
  back("/admin/billing", `Billing run done: ${r.renewed} renewed, ${r.reminded} reminders`);
}

// Support ------------------------------------------------------------------------------
export async function staffReply(f: FormData) {
  const { staff, supabase } = await requireStaff();
  const ticketId = str(f, "ticket_id");
  const number = str(f, "number");
  const body = str(f, "body");
  const internal = str(f, "kind") === "note";
  if (!body) back(`/admin/support?t=${number}`, "Write a reply first");
  const admin = createAdminClient();
  const { data: t } = await admin.from("support_tickets").select("id, business_id, number, subject").eq("id", ticketId).single();
  if (!t) back("/admin/support", "Ticket not found");
  // Insert as the staff member so RLS checks authorship.
  const { error } = await supabase.from("ticket_messages").insert({ ticket_id: t!.id, business_id: t!.business_id, author_id: staff.user_id, author_name: `${staff.name} · ZDMINC`, from_staff: true, internal, body });
  if (error) back(`/admin/support?t=${number}`, error.message);
  let note = internal ? "Note added" : "Reply sent in the app";
  if (!internal && f.get("whatsapp") === "on") {
    const res = await notifyClient(admin, t!.business_id, `ZDMINC support, request #${t!.number} (${t!.subject}):\n\n${body}\n\nReply in your ZDM ChatCart app: ${site()}/dashboard`, actorOf(staff));
    note += res.ok ? " and on WhatsApp" : `. WhatsApp not sent: ${res.error}`;
  }
  if (!internal && str(f, "then") === "waiting") await admin.from("support_tickets").update({ status: "waiting_on_client" }).eq("id", t!.id);
  if (!internal && str(f, "then") === "resolve") await admin.from("support_tickets").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", t!.id);
  revalidatePath("/admin", "layout");
  back(`/admin/support?t=${number}`, note);
}

export async function updateTicket(f: FormData) {
  const { staff } = await requireStaff();
  const number = str(f, "number");
  const status = str(f, "status");
  const priority = str(f, "priority");
  const assignee = str(f, "assignee");
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (["open", "waiting_on_client", "resolved"].includes(status)) { patch.status = status; patch.resolved_at = status === "resolved" ? new Date().toISOString() : null; }
  if (["low", "normal", "high", "urgent"].includes(priority)) patch.priority = priority;
  if (assignee) patch.assignee = assignee === "none" ? null : assignee;
  const admin = createAdminClient();
  const { data: t } = await admin.from("support_tickets").update(patch).eq("number", number).select("business_id, number, status").single();
  if (t && patch.status === "resolved") await logEvent(admin, t.business_id, actorOf(staff), "ticket", `Ticket #${t.number} resolved`);
  revalidatePath("/admin", "layout");
  back(`/admin/support?t=${number}`, "Ticket updated");
}

export async function staffOpenTicket(f: FormData) {
  const { staff, supabase } = await requireStaff();
  const businessId = str(f, "business_id");
  const subject = str(f, "subject");
  const body = str(f, "body");
  if (!businessId || subject.length < 3 || !body) back("/admin/support", "Client, subject and message are needed");
  const admin = createAdminClient();
  const { data: t, error } = await admin.from("support_tickets").insert({
    business_id: businessId, subject, category: str(f, "category") || "other", priority: str(f, "priority") || "normal", created_by: staff.user_id, assignee: staff.user_id,
  }).select("id, number").single();
  if (error || !t) back("/admin/support", error?.message ?? "Could not open ticket");
  await supabase.from("ticket_messages").insert({ ticket_id: t!.id, business_id: businessId, author_id: staff.user_id, author_name: `${staff.name} · ZDMINC`, from_staff: true, body });
  back(`/admin/support?t=${t!.number}`, "Ticket opened");
}

// WhatsApp -----------------------------------------------------------------------------
export async function sendWhatsApp(f: FormData) {
  const { staff } = await requireStaff();
  const phone = digits(str(f, "phone"));
  const body = str(f, "body");
  if (!body) back(`/admin/whatsapp?p=${phone}`, "Write a message first");
  const admin = createAdminClient();
  const { data: b } = str(f, "business_id")
    ? await admin.from("businesses").select("id, contact_name").eq("id", str(f, "business_id")).maybeSingle()
    : await admin.from("businesses").select("id, contact_name").eq("contact_phone", phone).maybeSingle();
  const res = await sendZdm(admin, { phone, body, actor: actorOf(staff), businessId: b?.id ?? null, contactName: b?.contact_name ?? str(f, "contact_name") });
  back(`/admin/whatsapp?p=${phone}`, res.ok ? (res.kind === "template" ? "Sent the opening template. Your message shows once they reply." : "Sent") : `Not sent: ${res.error}`);
}

export async function linkWhatsAppToClient(f: FormData) {
  const { staff } = await requireStaff();
  const phone = digits(str(f, "phone"));
  const id = str(f, "business_id");
  const admin = createAdminClient();
  await admin.from("zdm_wa_messages").update({ business_id: id }).eq("phone", phone);
  if (f.get("save_contact") === "on") await admin.from("businesses").update({ contact_phone: phone }).eq("id", id);
  await logEvent(admin, id, actorOf(staff), "contact", `WhatsApp +${phone} linked to this client`);
  back(`/admin/whatsapp?p=${phone}`, "Linked to client");
}

export async function whatsappToTicket(f: FormData) {
  const { staff, supabase } = await requireStaff();
  const phone = digits(str(f, "phone"));
  const admin = createAdminClient();
  const { data: msgs } = await admin.from("zdm_wa_messages").select("business_id, body, direction, created_at").eq("phone", phone).order("created_at", { ascending: false }).limit(10);
  const businessId = msgs?.find((m) => m.business_id)?.business_id;
  if (!businessId) back(`/admin/whatsapp?p=${phone}`, "Link this chat to a client first");
  const lastIn = msgs!.filter((m) => m.direction === "in").slice(0, 5).reverse().map((m) => m.body).join("\n");
  const subject = (str(f, "subject") || lastIn.split("\n")[0] || "WhatsApp request").slice(0, 120);
  const { data: t } = await admin.from("support_tickets").insert({ business_id: businessId, subject, category: "other", created_by: staff.user_id, assignee: staff.user_id }).select("id, number").single();
  await supabase.from("ticket_messages").insert({ ticket_id: t!.id, business_id: businessId, author_id: staff.user_id, author_name: `${staff.name} · ZDMINC`, from_staff: true, internal: true, body: `From WhatsApp +${phone}:\n${lastIn || "(no text)"}` });
  await admin.from("zdm_wa_messages").update({ ticket_id: t!.id }).eq("phone", phone).is("ticket_id", null);
  back(`/admin/support?t=${t!.number}`, "Ticket created from the WhatsApp chat");
}

// Team ---------------------------------------------------------------------------------
export async function addStaff(f: FormData) {
  await requireStaffManager();
  const email = str(f, "email").toLowerCase();
  const role = str(f, "role");
  if (!["owner", "manager", "support", "editor"].includes(role)) back("/admin/team", "Pick a role");
  const admin = createAdminClient();
  let userId: string | null = null;
  const invite = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${site()}/auth/callback?next=/admin` });
  if (invite.data.user) userId = invite.data.user.id;
  else {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    userId = list?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
  }
  if (!userId) back("/admin/team", "Couldn't invite that email");
  await admin.from("platform_staff").upsert({ user_id: userId, name: str(f, "name") || email.split("@")[0], role });
  back("/admin/team", "Team member added");
}

export async function removeStaff(f: FormData) {
  const { staff } = await requireStaffManager();
  const id = str(f, "user_id");
  if (id === staff.user_id) back("/admin/team", "You can't remove yourself");
  await createAdminClient().from("platform_staff").delete().eq("user_id", id);
  back("/admin/team", "Removed");
}
