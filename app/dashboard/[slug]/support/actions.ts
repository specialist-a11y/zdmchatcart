"use server";

import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/business";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";

type Attachment = { path: string; name: string; type: string; size: number };
const safeName = (n: string) => n.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";

/** A one-time upload link for a screenshot or short video, stored privately per business. */
export async function getSupportUploadUrl(slug: string, fileName: string) {
  const { supabase, business } = await requireMembership(slug);
  const path = `${business.id}/${Date.now()}-${safeName(fileName)}`;
  const store = (hasServiceRoleKey() ? createAdminClient() : supabase).storage.from("support-files");
  const { data, error } = await store.createSignedUploadUrl(path);
  if (error || !data) return { error: /not found/i.test(error?.message ?? "") ? "File uploads need migration 0014_journeys_quickwins.sql first." : error?.message ?? "Couldn't start the upload" };
  return { path, token: data.token };
}

/** Attachments posted with the form, limited to this business's folder. */
function readAttachments(f: FormData, businessId: string): Attachment[] {
  try {
    const list = JSON.parse(String(f.get("attachments") ?? "[]"));
    return (Array.isArray(list) ? list : []).filter((a: any) => typeof a?.path === "string" && a.path.startsWith(`${businessId}/`)).slice(0, 5)
      .map((a: any) => ({ path: a.path, name: String(a.name ?? "file").slice(0, 80), type: String(a.type ?? "").slice(0, 40), size: Number(a.size) || 0 }));
  } catch { return []; }
}

/** Insert a message, retrying without attachments if the column isn't there yet. */
async function addMessage(supabase: any, row: Record<string, unknown>, attachments: Attachment[]) {
  if (!attachments.length) return supabase.from("ticket_messages").insert(row);
  const res = await supabase.from("ticket_messages").insert({ ...row, attachments });
  if (res.error && /attachments/i.test(res.error.message)) return supabase.from("ticket_messages").insert(row);
  return res;
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const who = (u: { email?: string | null; user_metadata?: any }) => u.user_metadata?.full_name || u.user_metadata?.name || (u.email ?? "Client").split("@")[0];

export async function openTicket(f: FormData) {
  const slug = str(f, "slug");
  const { supabase, user, business } = await requireMembership(slug);
  const path = `/dashboard/${slug}/support`;
  const subject = str(f, "subject");
  const body = str(f, "body");
  const files = readAttachments(f, business.id);
  if (subject.length < 3 || (!body && !files.length)) redirect(`${path}?msg=${encodeURIComponent("Add a short subject and your message")}`);
  const category = ["videos", "payments", "whatsapp", "website", "account", "plan", "other"].includes(str(f, "category")) ? str(f, "category") : "other";
  const { data: t, error } = await supabase.from("support_tickets").insert({ business_id: business.id, subject: subject.slice(0, 200), category, created_by: user.id }).select("id, number").single();
  if (error || !t) redirect(`${path}?msg=${encodeURIComponent(error?.message ?? "Could not send")}`);
  await addMessage(supabase, { ticket_id: t!.id, business_id: business.id, author_id: user.id, author_name: who(user), body: (body || "See attached").slice(0, 5000) }, files);
  redirect(`${path}?t=${t!.number}&msg=${encodeURIComponent("Sent. The ZDMINC team usually replies within 4 business hours.")}`);
}

export async function replyTicket(f: FormData) {
  const slug = str(f, "slug");
  const { supabase, user, business, viewingAsStaff } = await requireMembership(slug);
  const number = str(f, "number");
  const path = `/dashboard/${slug}/support?t=${number}`;
  if (viewingAsStaff) redirect(`${path}&msg=${encodeURIComponent("Reply from the admin Support queue so it's marked as ZDMINC")}`);
  const body = str(f, "body");
  const files = readAttachments(f, business.id);
  if (!body && !files.length) redirect(path);
  const { data: t } = await supabase.from("support_tickets").select("id").eq("business_id", business.id).eq("number", number).single();
  if (!t) redirect(path);
  const { error } = await addMessage(supabase, { ticket_id: t!.id, business_id: business.id, author_id: user.id, author_name: who(user), body: (body || "See attached").slice(0, 5000) }, files);
  redirect(`${path}${error ? `&msg=${encodeURIComponent(error.message)}` : ""}`);
}
