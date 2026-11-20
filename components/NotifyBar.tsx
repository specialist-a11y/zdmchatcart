"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription } from "@/app/dashboard/[slug]/push-actions";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const HIDE = "zdm-notify-hidden";

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "loading" | "off" | "on" | "blocked" | "ios" | "unsupported" | "busy";

/**
 * Browser notifications for new WhatsApp messages. Shows a bar until they're on, then stays out of the way.
 * Works with ChatCart closed (the browser keeps running in the background). iPhone needs ChatCart on the Home Screen.
 */
export default function NotifyBar({ slug }: { slug: string }) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try { setHidden(localStorage.getItem(HIDE) === "1"); } catch {}
    (async () => {
      if (!KEY) return setState("unsupported");
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = (window.matchMedia?.("(display-mode: standalone)").matches) || (navigator as any).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState(ios && !standalone ? "ios" : "unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      if (sub && Notification.permission === "granted") {
        // Keep the saved copy fresh (for example after signing in on a new account).
        await savePushSubscription(slug, sub.toJSON() as any).catch(() => null);
        return setState("on");
      }
      setState("off");
    })().catch(() => setState("unsupported"));
  }, [slug]);

  async function turnOn() {
    setState("busy"); setError("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "blocked" : "off");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) }));
      const res = await savePushSubscription(slug, sub.toJSON() as any);
      if ("error" in res && res.error) { setError(res.error); return setState("off"); }
      setState("on");
      reg.showNotification("Notifications are on", { body: "You'll get a notification for every new WhatsApp message.", icon: "/brand/zdm-chatcart-icon-1024.png" });
    } catch (e: any) {
      setError(e?.message ?? "Couldn't turn notifications on in this browser.");
      setState("off");
    }
  }

  async function turnOff() {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await removePushSubscription(slug, sub.endpoint); await sub.unsubscribe(); }
    setState("off");
  }

  const hide = () => { setHidden(true); try { localStorage.setItem(HIDE, "1"); } catch {} };

  if (state === "loading" || state === "unsupported") return null;
  if (state === "on") return hidden ? null : (
    <div className="notify-bar is-on" role="status">
      <span>🔔 Notifications are on for new WhatsApp messages in this browser.</span>
      <span className="row" style={{ gap: 8 }}><button type="button" className="btn secondary small" onClick={turnOff}>Turn off</button><button type="button" className="btn secondary small" onClick={hide}>Hide</button></span>
    </div>
  );
  if (hidden && state !== "off") return null;
  return (
    <div className="notify-bar" role="region" aria-label="Notifications">
      {state === "ios" ? <span>🔔 To get a notification for every WhatsApp message on iPhone: tap Share, then <b>Add to Home Screen</b>, open ChatCart from there and turn notifications on.</span>
        : state === "blocked" ? <span>🔔 Notifications are blocked for ChatCart. Allow them in your browser&apos;s site settings (the icon left of the address), then reload.</span>
        : <span>🔔 <b>Never miss a customer.</b> Get a notification for every new WhatsApp message, even when ChatCart is closed.</span>}
      <span className="row" style={{ gap: 8 }}>
        {(state === "off" || state === "busy") && <button type="button" className="btn blue small" onClick={turnOn} disabled={state === "busy"}>{state === "busy" ? "Turning on..." : "Turn on"}</button>}
        {state !== "off" && state !== "busy" && <button type="button" className="btn secondary small" onClick={hide}>Hide</button>}
      </span>
      {error && <span className="error" style={{ flexBasis: "100%", margin: 0 }}>{error}</span>}
    </div>
  );
}
