"use server";

import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/business";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const who = (u: { email?: string | null; user_metadata?: any }) => u.user_metadata?.full_name || u.user_metadata?.name || (u.email ?? "Client").split("@")[0];

export async function openTicket(f: FormData) {
  const slug = str(f, "slug");
  const { supabase, user, business } = await requireMembership(slug);
  const path = `/dashboard/${slug}/support`;
  const subject = str(f, "subject");
  const body = str(f, "body");
  if (subject.length < 3 || !body) redirect(`${path}?msg=${encodeURIComponent("Add a short subject and your message")}`);
  const category = ["videos", "payments", "whatsapp", "website", "account", "plan", "other"].includes(str(f, "category")) ? str(f, "category") : "other";
  const { data: t, error } = await supabase.from("support_tickets").insert({ business_id: business.id, subject: subject.slice(0, 200), category, created_by: user.id }).select("id, number").single();
  if (error || !t) redirect(`${path}?msg=${encodeURIComponent(error?.message ?? "Could not send")}`);
  await supabase.from("ticket_messages").insert({ ticket_id: t!.id, business_id: business.id, author_id: user.id, author_name: who(user), body: body.slice(0, 5000) });
  redirect(`${path}?t=${t!.number}&msg=${encodeURIComponent("Sent. The ZDMINC team usually replies within 4 business hours.")}`);
}

export async function replyTicket(f: FormData) {
  const slug = str(f, "slug");
  const { supabase, user, business, viewingAsStaff } = await requireMembership(slug);
  const number = str(f, "number");
  const path = `/dashboard/${slug}/support?t=${number}`;
  if (viewingAsStaff) redirect(`${path}&msg=${encodeURIComponent("Reply from the admin Support queue so it's marked as ZDMINC")}`);
  const body = str(f, "body");
  if (!body) redirect(path);
  const { data: t } = await supabase.from("support_tickets").select("id").eq("business_id", business.id).eq("number", number).single();
  if (!t) redirect(path);
  const { error } = await supabase.from("ticket_messages").insert({ ticket_id: t!.id, business_id: business.id, author_id: user.id, author_name: who(user), body: body.slice(0, 5000) });
  redirect(`${path}${error ? `&msg=${encodeURIComponent(error.message)}` : ""}`);
}
