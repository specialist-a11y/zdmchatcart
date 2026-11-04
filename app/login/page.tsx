"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/* A looping "chat becomes a paid order" story plays on the left; the magic-link form sits on the right. */
const CSS = `
.lg { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); background: #fff; }
.lg-stage { position: relative; overflow: hidden; background: var(--ink); color: #fff; padding: 40px 48px; display: flex; flex-direction: column; justify-content: space-between; gap: 32px; isolation: isolate; }
.lg-stage::before, .lg-stage::after { content: ""; position: absolute; z-index: -1; border-radius: 50%; filter: blur(70px); opacity: .55; animation: lg-drift 14s ease-in-out infinite alternate; }
.lg-stage::before { width: 520px; height: 520px; background: radial-gradient(circle, #3d8bff, transparent 65%); top: -160px; right: -140px; }
.lg-stage::after { width: 420px; height: 420px; background: radial-gradient(circle, #25d366, transparent 65%); bottom: -180px; left: -120px; opacity: .3; animation-delay: -7s; }
.lg-grid { position: absolute; inset: 0; z-index: -1; background-image: linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px); background-size: 44px 44px; mask-image: radial-gradient(ellipse at 50% 40%, #000 20%, transparent 75%); }
@keyframes lg-drift { to { transform: translate(-60px, 50px) scale(1.12); } }

.lg-brand { font-family: "Barlow Condensed", sans-serif; text-transform: uppercase; font-weight: 800; font-size: 24px; color: #fff; text-decoration: none; letter-spacing: .01em; }
.lg-brand em { font-style: normal; color: var(--blue); }
.lg-brand:hover { color: #fff; }

.lg-headline { font-size: clamp(44px, 5.4vw, 78px); line-height: .92; max-width: 560px; }
.lg-headline span { display: block; }
.lg-headline .hl { color: var(--blue); position: relative; }
.lg-headline .hl::after { content: ""; position: absolute; left: 0; bottom: .06em; height: .12em; width: 100%; background: var(--blue); opacity: .35; transform-origin: left; animation: lg-under 1.2s .4s cubic-bezier(.2,.8,.2,1) both; }
@keyframes lg-under { from { transform: scaleX(0); } }
.lg-sub { color: #c4ccc8; font-size: 16px; max-width: 440px; margin: 14px 0 0; line-height: 1.5; }

/* Phone mock with the looping chat */
.lg-phone { width: 300px; max-width: 100%; align-self: flex-start; background: #0f1513; border: 1px solid rgba(255,255,255,.12); border-radius: 26px; padding: 12px; box-shadow: 0 30px 80px rgba(0,0,0,.5), 0 0 0 6px rgba(255,255,255,.03); transform: rotate(-2deg); animation: lg-float 6s ease-in-out infinite; }
@keyframes lg-float { 50% { transform: rotate(-2deg) translateY(-10px); } }
.lg-phone header { display: flex; align-items: center; gap: 10px; padding: 6px 6px 10px; border-bottom: 1px solid rgba(255,255,255,.08); }
.lg-ava { width: 30px; height: 30px; border-radius: 50%; background: linear-gradient(135deg, #3d8bff, #25d366); display: grid; place-items: center; font-weight: 800; font-size: 12px; color: var(--ink); }
.lg-phone header b { font-size: 13px; display: block; }
.lg-phone header small { font-size: 11px; color: #5dd39e; }
.lg-chat { display: flex; flex-direction: column; gap: 7px; padding: 12px 4px 4px; height: 268px; font-size: 13px; }
.lg-b { max-width: 82%; padding: 8px 11px; border-radius: 13px; line-height: 1.35; opacity: 0; animation: lg-msg 12s infinite both; }
.lg-b.in { align-self: flex-start; background: #1e2724; border-bottom-left-radius: 4px; }
.lg-b.out { align-self: flex-end; background: #155e3b; border-bottom-right-radius: 4px; }
.lg-b:nth-child(1) { animation-delay: 0s; }
.lg-b:nth-child(2) { animation-delay: .9s; }
.lg-b:nth-child(3) { animation-delay: 1.9s; }
.lg-b:nth-child(4) { animation-delay: 2.9s; }
.lg-b:nth-child(5) { animation-delay: 3.9s; }
@keyframes lg-msg {
  0% { opacity: 0; transform: translateY(10px) scale(.96); }
  4%, 82% { opacity: 1; transform: none; }
  90%, 100% { opacity: 0; transform: translateY(-6px); }
}
.lg-cart { display: flex; flex-direction: column; gap: 3px; min-width: 190px; }
.lg-cart div { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: #c4ccc8; }
.lg-cart div.t { color: #fff; font-weight: 700; border-top: 1px solid rgba(255,255,255,.15); padding-top: 4px; margin-top: 2px; }
.lg-pay { display: inline-block; margin-top: 6px; padding: 5px 10px; border-radius: 8px; background: var(--blue); color: var(--ink); font-weight: 800; font-size: 12px; }
.lg-paid { position: relative; align-self: center; margin-top: 6px; padding: 6px 16px; border: 2.5px solid #5dd39e; color: #5dd39e; border-radius: 10px; font-family: "Barlow Condensed", sans-serif; font-weight: 800; font-size: 22px; letter-spacing: .08em; text-transform: uppercase; opacity: 0; animation: lg-stamp 12s 4.9s infinite both; }
@keyframes lg-stamp {
  0% { opacity: 0; transform: scale(2.2) rotate(-14deg); }
  3% { opacity: 1; transform: scale(.94) rotate(-8deg); }
  5%, 74% { opacity: 1; transform: scale(1) rotate(-8deg); }
  82%, 100% { opacity: 0; transform: scale(1) rotate(-8deg); }
}

.lg-stats { display: flex; flex-wrap: wrap; gap: 28px; }
.lg-stats b { display: block; font-family: "Barlow Condensed", sans-serif; font-size: 30px; line-height: 1; }
.lg-stats small { color: #8e9a95; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
.lg-mid { display: flex; align-items: center; gap: 40px; flex-wrap: wrap; }

/* Form side */
.lg-side { display: flex; align-items: center; justify-content: center; padding: 40px 24px; background: radial-gradient(circle at 100% 0%, var(--teal-soft), transparent 45%), #fff; }
.lg-card { width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: 22px; animation: lg-rise .7s cubic-bezier(.2,.8,.2,1) both; }
@keyframes lg-rise { from { opacity: 0; transform: translateY(18px); } }
.lg-eyebrow { display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; padding: 5px 12px; border-radius: 999px; background: var(--teal-soft); color: var(--teal); font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.lg-eyebrow i { width: 7px; height: 7px; border-radius: 50%; background: #25d366; box-shadow: 0 0 0 0 rgba(37,211,102,.6); animation: lg-ping 1.8s infinite; }
@keyframes lg-ping { 70% { box-shadow: 0 0 0 8px rgba(37,211,102,0); } 100% { box-shadow: 0 0 0 0 rgba(37,211,102,0); } }
.lg-card h1 { font-size: 48px; line-height: .95; }
.lg-card > p { margin: -10px 0 0; color: var(--muted); line-height: 1.5; }
.lg-field { position: relative; }
.lg-field input { width: 100%; height: 56px; padding: 22px 16px 6px; border-radius: 14px; border: 2px solid var(--line); font-size: 16px; transition: border-color .2s, box-shadow .2s; }
.lg-field input:focus { outline: none; border-color: var(--teal); box-shadow: 0 0 0 4px rgba(61,139,255,.18); }
.lg-field span { position: absolute; left: 18px; top: 18px; color: var(--muted); font-weight: 500; pointer-events: none; transition: all .18s ease; }
.lg-field input:focus + span, .lg-field input:not(:placeholder-shown) + span { top: 8px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--teal); }
.lg-btn { position: relative; overflow: hidden; width: 100%; min-height: 56px; border-radius: 14px; font-size: 16px; }
.lg-btn::after { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.28) 50%, transparent 70%); transform: translateX(-100%); }
.lg-btn:not(:disabled):hover::after { animation: lg-shine .9s ease; }
@keyframes lg-shine { to { transform: translateX(100%); } }
.lg-btn .arr { transition: transform .2s; }
.lg-btn:not(:disabled):hover .arr { transform: translateX(4px); }
.lg-spin { width: 16px; height: 16px; border: 2.5px solid rgba(255,255,255,.35); border-top-color: #fff; border-radius: 50%; animation: lg-rot .7s linear infinite; }
@keyframes lg-rot { to { transform: rotate(360deg); } }
.lg-fine { font-size: 13px; color: var(--muted); display: flex; align-items: center; gap: 8px; }
.lg-err { background: #fbe3dc; color: #8c2f1c; border-radius: 12px; padding: 10px 14px; font-weight: 600; font-size: 14px; animation: lg-shake .4s; }
@keyframes lg-shake { 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }

.lg-sent { text-align: center; align-items: center; }
.lg-env { width: 96px; height: 96px; border-radius: 28px; background: var(--teal-soft); display: grid; place-items: center; animation: lg-pop .6s cubic-bezier(.3,1.6,.5,1) both; }
@keyframes lg-pop { from { transform: scale(.4); opacity: 0; } }
.lg-env svg { animation: lg-fly 2.4s 0.6s ease-in-out infinite; }
@keyframes lg-fly { 50% { transform: translateY(-6px) rotate(-6deg); } }
.lg-sent b { color: var(--ink); }
.lg-link { background: none; border: 0; padding: 0; color: var(--teal); font-weight: 700; cursor: pointer; text-decoration: underline; }

@media (max-width: 900px) {
  .lg { grid-template-columns: 1fr; }
  .lg-stage { padding: 24px 20px 28px; gap: 20px; }
  .lg-phone, .lg-stats { display: none; }
  .lg-headline { font-size: 42px; }
  .lg-sub { font-size: 15px; }
  .lg-side { padding: 32px 20px 48px; align-items: flex-start; }
  .lg-card h1 { font-size: 40px; }
}
@media (prefers-reduced-motion: reduce) {
  .lg *, .lg *::before, .lg *::after, .lg-stage::before, .lg-stage::after { animation: none !important; transition: none !important; }
  .lg-b, .lg-paid { opacity: 1; }
  .lg-paid { transform: rotate(-8deg); }
}
`;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const nextParam = typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("next") ?? "/dashboard")
      : "/dashboard";
    const safeNext = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}` },
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else setState("sent");
  }

  return (
    <main className="lg">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <section className="lg-stage" aria-hidden="true">
        <div className="lg-grid" />
        <a href="/" className="lg-brand" tabIndex={-1}>
          ZDM <em>ChatCart</em>
        </a>

        <div className="lg-mid">
          <div className="lg-phone">
            <header>
              <span className="lg-ava">SB</span>
              <span>
                <b>Sunny Bakes</b>
                <small>online</small>
              </span>
            </header>
            <div className="lg-chat">
              <div className="lg-b in">Hi! Can I get the coconut drops? 🥥</div>
              <div className="lg-b out">Of course! Here&apos;s your cart 👇</div>
              <div className="lg-b out">
                <div className="lg-cart">
                  <div><span>Coconut drops ×6</span><span>$36</span></div>
                  <div><span>Sorrel cake</span><span>$45</span></div>
                  <div className="t"><span>Total</span><span>$81</span></div>
                </div>
                <span className="lg-pay">Pay with Fygaro →</span>
              </div>
              <div className="lg-b in">Paid! 🙌</div>
              <div className="lg-b out">Thank you! Pickup at 3pm ✨</div>
              <div className="lg-paid">Paid · $81</div>
            </div>
          </div>
        </div>

        <div>
          <h2 className="lg-headline">
            <span>Chats in.</span>
            <span className="hl">Orders out.</span>
            <span>Money paid.</span>
          </h2>
          <p className="lg-sub">Your store, your WhatsApp orders and your payment links, all in one place. Welcome back.</p>
        </div>

        <div className="lg-stats">
          <div><b>24/7</b><small>Store open</small></div>
          <div><b>1 tap</b><small>Pay links</small></div>
          <div><b>0 apps</b><small>For customers</small></div>
        </div>
      </section>

      <section className="lg-side">
        {state === "sent" ? (
          <div className="lg-card lg-sent" role="status">
            <div className="lg-env">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#1d5fd1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13" />
                <path d="M22 2 15 22l-4-9-9-4 20-7z" />
              </svg>
            </div>
            <h1>Check your inbox</h1>
            <p>
              We sent a sign-in link to <b>{email}</b>. Open it on this device to get into your dashboard.
            </p>
            <p className="lg-fine">
              Wrong email?{" "}
              <button type="button" className="lg-link" onClick={() => setState("idle")}>
                Try again
              </button>
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="lg-card">
            <span className="lg-eyebrow"><i /> ZDM ChatCart</span>
            <h1>Welcome back</h1>
            <p>Enter your email and we&apos;ll send you a magic link. No password needed.</p>
            <label className="lg-field">
              <input
                type="email"
                required
                placeholder=" "
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
              />
              <span>Email address</span>
            </label>
            <button className="btn lg-btn" disabled={state === "sending"}>
              {state === "sending" ? (
                <>
                  <span className="lg-spin" /> Sending your link...
                </>
              ) : (
                <>
                  Email me a sign-in link <span className="arr">→</span>
                </>
              )}
            </button>
            {state === "error" && <p className="lg-err" role="alert">{error}</p>}
            <p className="lg-fine">🔒 Secure, passwordless sign-in.</p>
          </form>
        )}
      </section>
    </main>
  );
}
