import "server-only";
import { resolve4, resolveCname } from "node:dns/promises";
import { dnsRecord } from "./links";

/**
 * Connect a client's domain. With VERCEL_TOKEN + VERCEL_PROJECT_ID the domain is added to the
 * Vercel project (which issues the SSL certificate) and checked there. Without them we check DNS only,
 * and ZDMINC adds the domain in Vercel by hand.
 */
const vercel = () => process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID
  ? { token: process.env.VERCEL_TOKEN, project: process.env.VERCEL_PROJECT_ID, team: process.env.VERCEL_TEAM_ID }
  : null;

async function api(path: string, init: RequestInit = {}) {
  const v = vercel()!;
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`https://api.vercel.com${path}${v.team ? `${sep}teamId=${v.team}` : ""}`, {
    ...init, cache: "no-store",
    headers: { Authorization: `Bearer ${v.token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const json: any = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export async function addDomainToHost(domain: string): Promise<{ ok: boolean; error?: string }> {
  const v = vercel();
  if (!v) return { ok: true };
  const r = await api(`/v10/projects/${v.project}/domains`, { method: "POST", body: JSON.stringify({ name: domain }) });
  if (r.ok || r.json?.error?.code === "domain_already_in_use_by_project" || r.status === 409 && /this project/i.test(r.json?.error?.message ?? "")) return { ok: true };
  return { ok: false, error: r.json?.error?.message ?? `Vercel error ${r.status}` };
}

export async function removeDomainFromHost(domain: string) {
  const v = vercel();
  if (v) await api(`/v9/projects/${v.project}/domains/${domain}`, { method: "DELETE" }).catch(() => null);
}

/** Is the domain pointing at us? */
export async function checkDomain(domain: string): Promise<{ ok: boolean; error?: string }> {
  const v = vercel();
  if (v) {
    const [proj, cfg] = await Promise.all([api(`/v9/projects/${v.project}/domains/${domain}`), api(`/v6/domains/${domain}/config`)]);
    if (!proj.ok) return { ok: false, error: proj.json?.error?.message ?? "Domain not added to hosting yet" };
    if (proj.json?.verified === false) return { ok: false, error: "Waiting for the TXT verification record shown by ZDMINC" };
    if (cfg.json?.misconfigured) return { ok: false, error: "DNS isn't pointing here yet. Changes can take up to a few hours." };
    return { ok: true };
  }
  const want = dnsRecord(domain);
  try {
    if (want.type === "A") {
      const ips = await resolve4(domain);
      return ips.includes(want.value) ? { ok: true } : { ok: false, error: `A record points to ${ips.join(", ")}, not ${want.value}` };
    }
    const names = await resolveCname(domain);
    return names.some((n) => n.replace(/\.$/, "") === want.value) ? { ok: true } : { ok: false, error: `CNAME points to ${names.join(", ")}, not ${want.value}` };
  } catch {
    return { ok: false, error: `No ${want.type} record found yet. Changes can take up to a few hours.` };
  }
}
