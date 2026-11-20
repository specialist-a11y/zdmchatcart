"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Upload the 1st Pay / bank transfer screenshot (or type the reference) from the order page. */
export default function ProofUpload({ id, token, accent }: { id: string; token: string; accent: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    const fd = new FormData(e.currentTarget);
    fd.set("t", token);
    const res = await fetch(`/api/orders/${id}/proof`, { method: "POST", body: fd }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) { setError(json.error ?? "Couldn't send that. Please try again."); setBusy(false); return; }
    router.refresh();
  }
  return (
    <form onSubmit={send} className="op-stack">
      <label className="op-label">Screenshot of your payment
        <input type="file" name="file" accept="image/*,application/pdf" />
      </label>
      <label className="op-label">Or the reference number
        <input name="reference" maxLength={80} placeholder="e.g. TRX0042183" />
      </label>
      <button className="op-btn" style={{ background: accent, borderColor: accent }} disabled={busy}>{busy ? "Sending..." : "Send payment proof"}</button>
      {error && <p className="op-err" role="alert">{error}</p>}
    </form>
  );
}
