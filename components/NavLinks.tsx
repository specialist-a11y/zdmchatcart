"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";

export type NavItem = { href: string; label: string; icon: string; badge?: number | null; exact?: boolean; locked?: string | null };

/** Sidebar links; marks the current page. Closes the phone menu after a tap. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const active = (it: NavItem) => (it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/"));
  // The most specific match wins, so /dashboard/x doesn't light up on every page.
  const best = items.filter(active).sort((a, b) => b.href.length - a.href.length)[0];
  return (
    <nav aria-label="Main" className="crm-nav">
      {items.map((it) => (
        <Link key={it.href} href={it.href} className={it.locked ? "is-locked" : undefined} aria-current={it === best ? "page" : undefined}
          onClick={(e) => (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open")}>
          <Icon name={it.icon} />
          <span>{it.label}</span>
          {it.locked ? <b className="crm-lock" title={it.locked}>{it.locked}</b> : it.badge ? <b className="crm-badge">{it.badge}</b> : null}
        </Link>
      ))}
    </nav>
  );
}
