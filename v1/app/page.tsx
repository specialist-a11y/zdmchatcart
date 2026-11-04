import Link from "next/link";

export default function Home() {
  return (
    <main className="container stack" style={{ paddingTop: 80, maxWidth: 720 }}>
      <span className="logo">ChatCart</span>
      <h1 style={{ fontSize: 48, lineHeight: 1.05 }}>Browse online. Order on WhatsApp. Get paid with Fygaro.</h1>
      <p className="muted" style={{ fontSize: 18 }}>
        One system for your shop website, WhatsApp orders and Fygaro payments.
      </p>
      <div className="row">
        <Link className="btn" href="/login">Sign in</Link>
        <Link className="btn secondary" href="/dashboard">Go to dashboard</Link>
      </div>
    </main>
  );
}
