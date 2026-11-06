"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Step 1 of signup when not signed in: email link that brings them back to finish on the same plan. */
export function SignupEmail({ plan, planName }: { plan: string; planName: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const next = `/signup?plan=${encodeURIComponent(plan)}`;
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true },
    });
    if (error) { setError(error.message); setState("error"); } else setState("sent");
  }

  return (
    <form onSubmit={onSubmit} className="card stack" style={{ maxWidth: 620 }}>
      <h2>Create your login</h2>
      {state === "sent" ? (
        <p className="ok">Check your email. The link brings you back here to finish signing up on {planName}.</p>
      ) : (
        <>
          <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <button className="btn blue" style={{ alignSelf: "flex-start" }} disabled={state === "sending"}>{state === "sending" ? "Sending..." : `Continue with ${planName}`}</button>
          {state === "error" && <p className="error">{error}</p>}
        </>
      )}
    </form>
  );
}
