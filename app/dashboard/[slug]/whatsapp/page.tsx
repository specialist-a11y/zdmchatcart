import { gateSection } from "@/components/PlanLock";
import Link from "next/link";
import { requireMembership } from "@/lib/business";
import { PageHeader, Dot } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import { TEMPLATE_PARAMS, fillTemplate, templateValues } from "@/lib/journeys";
import { saveAssistant, addFaq, deleteFaq, deleteTemplate, saveAway, saveTemplate, setTemplateStatus, syncTemplates, toggleFaq } from "./actions";
import { cleanHours, hasHours, hoursSummary, openState } from "@/lib/hours";
import { getEntitlements } from "@/lib/entitlements";
import { has } from "@/lib/plan-features";

const LIVE = [
  ["Order codes", "When a customer sends a code like IC-1048, the bot replies with the order summary and a secure payment link for the exact total."],
  ["Pickup or delivery", "The same reply asks how they want it, and records PICKUP or DELIVERY on the order."],
  ["Payment receipts", "When the payment comes through, the customer gets a receipt on WhatsApp and the order turns Paid."],
  ["Order ready", "When you mark an order Ready, the customer gets a message to come and collect it."],
  ["Unpaid cart reminder", "One reminder the day after an unpaid order. After 24 hours it needs an approved Cart reminder template."],
  ["First-time hello", "Someone messaging for the first time gets your shop link."],
  ["Answers and away message", "Set up below: replies to common questions, and a message when you're closed."],
  ["STOP and START", "Customers who reply STOP stop getting offers. They can reply START to turn them back on."],
  ["You can step in", "Every chat lands in your Inbox, and you can reply any time."],
];
const NEXT = ["Broadcasts to a customer stage", "Catalog sync to WhatsApp's own catalog", "Test the bot in a simulator"];

const PURPOSE: Record<string, string> = {
  cart_reminder: "Cart reminder", win_back: "Win back a quiet customer", order_ready: "Order ready", broadcast: "Broadcast", other: "Other",
};
const PARAM: Record<string, string> = { name: "Customer first name", code: "Order code", total: "Order total", link: "Payment link", shop: "Your business name" };
const STATUS: Record<string, string> = { draft: "Not sent to Meta", pending: "Waiting for Meta", approved: "Approved", rejected: "Rejected", paused: "Paused by Meta" };
const BADGE: Record<string, string> = { draft: "low", pending: "sent", approved: "paid", rejected: "failed", paused: "failed" };

export default async function WhatsAppPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { slug } = await params;
  const lock = await gateSection(slug, "whatsapp");
  if (lock) return lock;
  const { msg } = await searchParams;
  const { supabase, business, role, viewingAsStaff } = await requireMembership(slug);
  const ent = await getEntitlements(business.id);
  // Which bot features this plan includes (ZDMINC staff can set everything up).
  const plan: Record<string, boolean> = {
    "Unpaid cart reminder": viewingAsStaff || has(ent, "cart_recovery"),
    "Answers and away message": viewingAsStaff || has(ent, "wa_automations"),
  };
  const botOn = plan["Answers and away message"];
  const aiPlan = viewingAsStaff || has(ent, "ai_assistant");
  const { data: aiRow } = await supabase.from("businesses").select("ai_assistant").eq("id", business.id).maybeSingle<any>();
  const aiKey = !!process.env.ANTHROPIC_API_KEY;
  const [{ data: wa }, { data: templates, error: tErr }] = await Promise.all([
    supabase.from("integrations").select("status, config").eq("business_id", business.id).eq("provider", "whatsapp").maybeSingle(),
    supabase.from("message_templates").select("id, name, language, purpose, body, params, status, rejected_reason, updated_at").eq("business_id", business.id).order("purpose").order("name"),
  ]);
  const [{ data: bot }, { data: faqs, error: fErr }] = await Promise.all([
    supabase.from("businesses").select("hours, away_enabled, away_message, closed_until, closed_note").eq("id", business.id).maybeSingle(),
    supabase.from("whatsapp_faqs").select("id, keywords, answer, active, hits").eq("business_id", business.id).order("created_at"),
  ]);
  const hours = cleanHours(bot?.hours);
  const nowState = openState(hours, { closedUntil: bot?.closed_until, closedNote: bot?.closed_note });
  const on = wa?.status === "connected";
  const canEdit = role !== "staff";
  const sample = { name: "Renee", code: `${business.order_prefix}-1052`, total: `${business.currency} 90.00`, link: "https://pay.example/…", shop: business.name };

  return (
    <div className="stack">
      <PageHeader n={num("whatsapp")} title="WhatsApp" sub={`Your ordering bot on ${business.whatsapp_number ? "+" + business.whatsapp_number : "your WhatsApp number"}.`}
        actions={<Link className="btn secondary small" href={`/dashboard/${slug}/settings`}>Connection settings</Link>} />
      {msg && <p className="ok">{msg}</p>}
      <div className="card row" style={{ justifyContent: "space-between" }}>
        <span className="row"><Dot ok={on} /><b>{on ? "Connected to the WhatsApp Cloud API" : "Not connected yet"}</b></span>
        {!on && <span className="muted">ZDMINC connects this during setup, or add it in Settings.</span>}
      </div>

      <h2>What your bot does now</h2>
      <div className="grid">
        {LIVE.map(([t, d]) => {
          const off = plan[t] === false;
          return <div key={t} className="card stack" style={{ gap: 6, opacity: off ? 0.75 : 1 }}>
            {off ? <Link className="badge high" style={{ alignSelf: "flex-start" }} href={`/dashboard/${slug}/billing`}>Growth and up</Link> : <span className="badge paid" style={{ alignSelf: "flex-start" }}>Live</span>}
            <b>{t}</b><span className="muted">{d}</span></div>;
        })}
      </div>

      <section id="automations" className="card stack">
        <div>
          <h2>Automations</h2>
          <p className="muted" style={{ margin: "4px 0 0" }}>Answers the bot sends for you. Order codes and payment links always come first.</p>
        </div>
        {!botOn ? (
          <p style={{ margin: 0 }}>Answers to common questions and an away message when you're closed come with <b>Growth and up</b>. <Link href={`/dashboard/${slug}/billing`}>See plans</Link></p>
        ) : (<>
        {fErr && <p className="error" style={{ margin: 0 }}>Automations need a database update: run supabase/migrations/0015_priority_features.sql.</p>}

        <form action={saveAway} className="card stack" style={{ background: "#fafbfa", gap: 8 }}>
          <input type="hidden" name="slug" value={slug} />
          <div className="row" style={{ justifyContent: "space-between" }}>
            <b>Away message when you're closed</b>
            <label className="row" style={{ gap: 6, flexDirection: "row", fontWeight: 600 }}><input type="checkbox" name="away_enabled" defaultChecked={!!bot?.away_enabled} disabled={!canEdit} style={{ width: 20, height: 20 }} />On</label>
          </div>
          <span className="muted" style={{ fontSize: 14 }}>
            {hasHours(hours) ? <>Your hours: {hoursSummary(hours)}. Right now: <b>{nowState.label}</b>.</> : <>Set your opening hours in <Link href={`/dashboard/${slug}/business#hours`}>Business info</Link> first, or this only sends during holiday closures.</>}
          </span>
          <textarea name="away_message" rows={2} maxLength={600} disabled={!canEdit} defaultValue={bot?.away_message ?? ""} placeholder={`Thanks for your message! ${business.name} is closed right now. We'll reply when we open.`} />
          <span className="muted" style={{ fontSize: 13 }}>We add when you open next and your shop link. Each customer gets it once, not on every message.</span>
          {canEdit && <button className="btn secondary small" style={{ alignSelf: "flex-start" }}>Save away message</button>}
        </form>

        <div className="stack" style={{ gap: 8 }}>
          <b>Answers to common questions</b>
          <span className="muted" style={{ fontSize: 14 }}>When a message has one of the keywords, the bot replies with your answer. Good for delivery, prices, hours and where to find you.</span>
          {(faqs ?? []).map((q: any) => (
            <div key={q.id} className="row" style={{ justifyContent: "space-between", borderTop: "1px solid #eef2f1", paddingTop: 8, opacity: q.active ? 1 : 0.55 }}>
              <span style={{ flex: "1 1 260px", minWidth: 0 }}>
                <span className="row" style={{ gap: 4 }}>{q.keywords.map((k: string) => <span key={k} className="badge" style={{ textTransform: "none" }}>{k}</span>)}</span>
                <span style={{ display: "block", marginTop: 4, fontSize: 14, whiteSpace: "pre-wrap" }}>{q.answer}</span>
                <span className="muted" style={{ fontSize: 12 }}>Sent {q.hits} time{q.hits === 1 ? "" : "s"}</span>
              </span>
              {canEdit && (
                <span className="row" style={{ gap: 6 }}>
                  <form action={toggleFaq}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={q.id} /><input type="hidden" name="active" value={String(!q.active)} /><button className="btn secondary small">{q.active ? "Pause" : "Turn on"}</button></form>
                  <form action={deleteFaq}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={q.id} /><button className="btn secondary small">Remove</button></form>
                </span>
              )}
            </div>
          ))}
          {canEdit && !fErr && (
            <form action={addFaq} className="stack" style={{ gap: 8, borderTop: "1px solid #eef2f1", paddingTop: 8 }}>
              <input type="hidden" name="slug" value={slug} />
              <label>Keywords <span className="muted" style={{ fontWeight: 400 }}>(separate with commas)</span><input name="keywords" required placeholder="delivery, deliver, drop off" /></label>
              <label>Answer<textarea name="answer" rows={2} required maxLength={1000} placeholder="We deliver island-wide on Saturdays for BBD 20. Pickup is free from the shop." /></label>
              <button className="btn small" style={{ alignSelf: "flex-start" }}>Add answer</button>
            </form>
          )}
        </div>
        </>)}
      </section>

      <section id="assistant" className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>AI product assistant</h2>
          {aiPlan ? <span className={`badge ${aiRow?.ai_assistant === false || !aiKey ? "" : "paid"}`}>{!aiKey ? "Not switched on by ZDMINC yet" : aiRow?.ai_assistant === false ? "Off" : "On"}</span> : <Link className="badge high" href={`/dashboard/${slug}/billing`}>Pro and up</Link>}
        </div>
        <p className="muted" style={{ margin: 0 }}>Answers questions like &ldquo;how much is the black cake?&rdquo; or &ldquo;do you deliver to St Philip?&rdquo; any time, using only your products, prices, hours and delivery areas. If it doesn&apos;t know, it stays quiet and the chat waits for you in the Inbox. It also stays quiet for 2 hours after you reply to someone yourself.</p>
        {aiPlan ? (
          <form action={saveAssistant} className="row" style={{ gap: 10 }}>
            <input type="hidden" name="slug" value={slug} />
            <label className="row" style={{ gap: 6, flexDirection: "row", fontWeight: 600 }}><input type="checkbox" name="ai_assistant" defaultChecked={aiRow?.ai_assistant !== false} disabled={!canEdit} style={{ width: 20, height: 20 }} />Answer product questions for me</label>
            {canEdit && <button className="btn secondary small">Save</button>}
          </form>
        ) : <p style={{ margin: 0 }}>Comes with <b>Pro and up</b>. <Link href={`/dashboard/${slug}/billing`}>See plans</Link></p>}
      </section>

      <section id="templates" className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2>Message templates</h2>
            <p className="muted" style={{ margin: "4px 0 0" }}>WhatsApp only lets you message someone more than 24 hours after they last wrote if Meta has approved the wording. Reminders and win-backs use these.</p>
          </div>
          {canEdit && <form action={syncTemplates}><input type="hidden" name="slug" value={slug} /><button className="btn secondary small">Check status with Meta</button></form>}
        </div>
        {tErr ? <p className="error">Templates need a database update: run supabase/migrations/0014_journeys_quickwins.sql.</p> : null}
        {(templates ?? []).length === 0 && !tErr && <p className="muted" style={{ margin: 0 }}>No templates yet. Add a Cart reminder first: it brings back the most unpaid orders.</p>}
        {(templates ?? []).map((t: any) => (
          <div key={t.id} className="card stack" style={{ gap: 8, background: "#fafbfa" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="row" style={{ gap: 8 }}><b>{PURPOSE[t.purpose] ?? t.purpose}</b><code style={{ fontSize: 13 }}>{t.name}</code><span className="muted" style={{ fontSize: 13 }}>{t.language}</span></span>
              <span className={`badge ${BADGE[t.status] ?? ""}`} style={{ textTransform: "none" }}>{STATUS[t.status] ?? t.status}</span>
            </div>
            <p style={{ margin: 0, whiteSpace: "pre-wrap", background: "#dcf8c6", borderRadius: 10, padding: "8px 12px", maxWidth: 460 }}>{fillTemplate(t.body, templateValues(t.params ?? [], sample))}</p>
            {t.rejected_reason && <span className="error" style={{ fontSize: 14 }}>Meta said: {t.rejected_reason}</span>}
            <div className="row">
              {viewingAsStaff && (
                <form action={setTemplateStatus} className="row" style={{ gap: 8 }}>
                  <input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={t.id} />
                  <select name="status" defaultValue={t.status} aria-label="Approval status">{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  <input name="reason" placeholder="Reason if rejected" style={{ maxWidth: 200 }} />
                  <button className="btn secondary small">Set status</button>
                </form>
              )}
              {canEdit && <form action={deleteTemplate}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={t.id} /><button className="btn secondary small">Remove</button></form>}
            </div>
          </div>
        ))}

        {canEdit && !tErr && (
          <details>
            <summary style={{ cursor: "pointer", fontWeight: 700, minHeight: 44, display: "flex", alignItems: "center" }}>+ Add a template</summary>
            <form action={saveTemplate} className="stack" style={{ gap: 10, marginTop: 8 }}>
              <input type="hidden" name="slug" value={slug} />
              <label>What it's for
                <select name="purpose" defaultValue="cart_reminder">{Object.entries(PURPOSE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </label>
              <div className="cols" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                <label>Template name in Meta<input name="name" required placeholder="cart_reminder_1" pattern="[a-zA-Z0-9_ ]+" /></label>
                <label>Language<input name="language" defaultValue="en" /></label>
              </div>
              <label>Wording
                <textarea name="body" rows={3} required maxLength={1024} defaultValue={"Hi {{1}}, your order {{2}} is still waiting. Pay here: {{3}}"} />
              </label>
              <span className="muted" style={{ fontSize: 13 }}>Use {"{{1}}"}, {"{{2}}"} and so on for the parts that change. Pick what fills each one:</span>
              <div className="cols" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n}>{`{{${n}}}`}
                    <select name={`p${n}`} defaultValue={TEMPLATE_PARAMS[[0, 1, 3, 2, 4][n - 1]]}>{TEMPLATE_PARAMS.map((p) => <option key={p} value={p}>{PARAM[p]}</option>)}</select>
                  </label>
                ))}
              </div>
              <button className="btn" style={{ alignSelf: "flex-start" }}>Save template</button>
            </form>
          </details>
        )}
      </section>

      <div className="soon stack" style={{ gap: 8 }}>
        <b>Coming next</b>
        <ul style={{ margin: 0, paddingLeft: 18 }}>{NEXT.map((x) => <li key={x}>{x}</li>)}</ul>
        <span className="muted">Want one of these set up by hand now? <Link href={`/dashboard/${slug}/support`}>Ask ZDMINC</Link>.</span>
      </div>
    </div>
  );
}
