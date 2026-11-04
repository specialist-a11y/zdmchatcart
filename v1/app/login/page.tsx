"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else setState("sent");
  }

  return (
    <main className="container stack" style={{ maxWidth: 440, paddingTop: 80 }}>
      <span className="logo">ChatCart</span>
      <h1>Sign in</h1>
      {state === "sent" ? (
        <p className="ok">Check your email for a sign-in link.</p>
      ) : (
        <form onSubmit={onSubmit} className="stack">
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <button className="btn" disabled={state === "sending"}>
            {state === "sending" ? "Sending..." : "Email me a sign-in link"}
          </button>
          {state === "error" && <p className="error">{error}</p>}
        </form>
      )}
    </main>
  );
}
