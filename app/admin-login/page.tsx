"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";

const CSS = `
.adm-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 10%, #15221c, #0c1210 60%);
  color: #fff;
  padding: 24px;
}
.adm-box {
  width: 100%;
  max-width: 440px;
  background: rgba(22, 33, 28, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  padding: 36px 32px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(16px);
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.adm-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.adm-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(61, 139, 255, 0.15);
  color: #3d8bff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.adm-title {
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
  line-height: 1.1;
}
.adm-title span {
  color: #3d8bff;
}
.adm-sub {
  color: #9ab0a6;
  font-size: 14px;
  margin: 0;
  line-height: 1.45;
}
.adm-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.adm-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.adm-field label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #c4d4cc;
}
.adm-input {
  width: 100%;
  height: 50px;
  padding: 0 16px;
  background: #0f1714;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 12px;
  color: #fff;
  font-size: 15px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.adm-input:focus {
  outline: none;
  border-color: #3d8bff;
  box-shadow: 0 0 0 3px rgba(61, 139, 255, 0.25);
}
.adm-btn {
  height: 50px;
  background: #3d8bff;
  color: #0c1210;
  font-weight: 700;
  font-size: 15px;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.2s, transform 0.1s;
}
.adm-btn:hover:not(:disabled) {
  background: #5c9fff;
  transform: translateY(-1px);
}
.adm-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.adm-spin {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(0, 0, 0, 0.3);
  border-top-color: #000;
  border-radius: 50%;
  animation: adm-rot 0.7s linear infinite;
}
@keyframes adm-rot { to { transform: rotate(360deg); } }
.adm-err {
  background: rgba(220, 38, 38, 0.2);
  border: 1px solid rgba(220, 38, 38, 0.4);
  color: #fca5a5;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
}
.adm-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #83978e;
}
.adm-footer a {
  color: #9ab0a6;
  text-decoration: none;
  transition: color 0.15s;
}
.adm-footer a:hover {
  color: #fff;
  text-decoration: underline;
}
.adm-active-session {
  background: rgba(93, 211, 158, 0.12);
  border: 1px solid rgba(93, 211, 158, 0.3);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.adm-active-session p {
  margin: 0;
  font-size: 14px;
  color: #c4d4cc;
}
.adm-active-session strong {
  color: #5dd39e;
}
`;

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setCurrentUser(user.email);
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/admin`,
      },
    });

    if (signInError) {
      setError(signInError.message);
      setState("error");
    } else {
      setState("sent");
    }
  }

  return (
    <main className="adm-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="adm-box">
        <header className="adm-header">
          <span className="adm-badge">Staff Access</span>
          <h1 className="adm-title">
            ZDMINC <span>Studio</span>
          </h1>
          <p className="adm-sub">
            Internal administration, client CRM management, and campaign operations.
          </p>
        </header>

        {currentUser && (
          <div className="adm-active-session">
            <p>
              Already signed in as <strong>{currentUser}</strong>
            </p>
            <button
              type="button"
              className="adm-btn"
              onClick={() => router.push("/admin")}
            >
              Continue to Admin Studio →
            </button>
          </div>
        )}

        {state === "sent" ? (
          <div style={{ textAlign: "center", padding: "16px 0", display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ fontSize: 44 }}>📬</span>
            <h2 style={{ fontSize: 22, margin: 0 }}>Check your inbox</h2>
            <p className="adm-sub">
              We emailed a staff sign-in link to <strong>{email}</strong>. Open it on this device to launch the Admin Studio.
            </p>
            <button
              type="button"
              style={{ background: "none", border: "none", color: "#3d8bff", cursor: "pointer", textDecoration: "underline", fontSize: 13, marginTop: 8 }}
              onClick={() => setState("idle")}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="adm-form">
            <div className="adm-field">
              <label htmlFor="adm-email">Staff Email Address</label>
              <input
                id="adm-email"
                type="email"
                required
                className="adm-input"
                placeholder="you@zdminc.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus={!currentUser}
              />
            </div>

            <button type="submit" className="adm-btn" disabled={state === "sending"}>
              {state === "sending" ? (
                <>
                  <span className="adm-spin" /> Sending link...
                </>
              ) : (
                <>Send Admin Sign-in Link →</>
              )}
            </button>

            {state === "error" && <div className="adm-err">{error}</div>}
          </form>
        )}

        <footer className="adm-footer">
          <Link href="/login">← Merchant Login</Link>
          <Link href="/">Storefront Home</Link>
        </footer>
      </div>
    </main>
  );
}
