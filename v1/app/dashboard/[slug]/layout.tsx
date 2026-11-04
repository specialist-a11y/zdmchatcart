import Link from "next/link";
import { requireMembership } from "@/lib/business";

export default async function BusinessLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { business } = await requireMembership(slug);
  const base = `/dashboard/${slug}`;
  return (
    <>
      <header className="topbar">
        <div className="container">
          <div className="row">
            <Link href="/dashboard" className="logo">ChatCart</Link>
            <span className="muted">/ {business.name}</span>
          </div>
          <nav className="nav" aria-label="Business">
            <Link href={base}>Orders</Link>
            <Link href={`${base}/products`}>Products</Link>
            <Link href={`${base}/customers`}>Customers</Link>
            <Link href={`${base}/settings`}>Settings</Link>
            <Link href={`/s/${slug}`} target="_blank">View shop</Link>
          </nav>
        </div>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
