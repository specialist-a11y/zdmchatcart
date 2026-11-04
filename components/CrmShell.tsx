import Link from "next/link";
import { NavLinks, type NavItem } from "./NavLinks";

export const Logo = ({ sub = "Data-driven growth", link = true }: { sub?: string; link?: boolean }) => {
  const inner = <>
    <svg width="32" height="32" viewBox="0 0 34 34" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="6" fill="#3D8BFF" /><path d="M10 10h14L10 24h14" fill="none" stroke="#0B0F0E" strokeWidth="3.2" /></svg>
    <span><b>ZDM <em>ChatCart</em></b><small>{sub}</small></span>
  </>;
  // Inside the phone menu bar the whole bar opens the menu, so the logo there is not a link.
  return link ? <Link href="/" className="crm-logo">{inner}</Link> : <span className="crm-logo">{inner}</span>;
};

/**
 * The CRM frame from the wireframes: dark sidebar on desktop; on phones a top bar
 * with a Menu button that opens the same navigation.
 */
export function CrmShell({ switcher, nav, footer, children }: {
  switcher: { initials: string; name: string; sub: string; href?: string };
  nav: NavItem[];
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const sw = (
    <Link href={switcher.href ?? "/dashboard"} className="crm-switch">
      <span className="crm-avatar">{switcher.initials}</span>
      <span><b>{switcher.name}</b><small>{switcher.sub}</small></span>
      <span aria-hidden="true">▾</span>
    </Link>
  );
  return (
    <div className="crm">
      <aside className="crm-side">
        <Logo />
        {sw}
        <NavLinks items={nav} />
        <div className="crm-foot">{footer}<span className="crm-credit">A ZDMINC product · zdminc.com</span></div>
      </aside>
      <details className="crm-mbar">
        <summary><Logo link={false} /><span className="crm-menu">Menu</span></summary>
        <div className="crm-drawer">{sw}<NavLinks items={nav} /><div className="crm-foot">{footer}</div></div>
      </details>
      <main className="crm-main">{children}</main>
    </div>
  );
}

/** Numbered page title, like "01 / TODAY", with optional actions on the right. */
export function PageHeader({ n, title, sub, actions }: { n?: string | number; title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="crm-head">
      <div>
        <h1>{n != null && <span className="crm-num">{String(n).padStart(2, "0")} / </span>}{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export const Kpi = ({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "blue" | "amber" | "red" }) => (
  <div className={`kpi ${tone ?? ""}`}><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</div>
);

export const Dot = ({ ok }: { ok: boolean }) => <i className={`dot ${ok ? "ok" : ""}`} aria-hidden="true" />;
