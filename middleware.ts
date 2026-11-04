import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const hostOf = (u?: string) => { try { return u ? new URL(u).host : null; } catch { return null; } };
const APP_HOST = hostOf(process.env.NEXT_PUBLIC_SITE_URL);
const SHORT_HOST = hostOf(process.env.NEXT_PUBLIC_SHORT_URL);

// Custom domain -> shop slug, cached for 5 minutes per server instance.
const cache = new Map<string, { slug: string | null; at: number }>();
async function shopForDomain(host: string) {
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < 300_000) return hit.slug;
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/shop_for_domain`, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ p_domain: host }),
  }).catch(() => null);
  const slug = res?.ok ? ((await res.json()) as string | null) : null;
  cache.set(host, { slug, at: Date.now() });
  return slug;
}

const isAppHost = (host: string) =>
  host === APP_HOST || host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.endsWith(".vercel.app");

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const path = request.nextUrl.pathname;

  // Short domain (e.g. zdm.bb/cake) -> /l/cake
  if (SHORT_HOST && host === SHORT_HOST) {
    const url = request.nextUrl.clone();
    url.pathname = path === "/" ? "/" : `/l${path}`;
    return path === "/" ? NextResponse.redirect(process.env.NEXT_PUBLIC_SITE_URL ?? "/") : NextResponse.rewrite(url);
  }

  // A client's own domain (islandcrumb.com) shows their shop page.
  if (host && !isAppHost(host) && !path.startsWith("/api/") && !path.startsWith("/l/")) {
    const slug = await shopForDomain(host.replace(/:\d+$/, ""));
    if (slug) {
      const url = request.nextUrl.clone();
      if (path === "/" || path === `/s/${slug}`) { url.pathname = `/s/${slug}`; return NextResponse.rewrite(url); }
      // islandcrumb.com/cake -> that shop's short link "cake"
      const one = path.match(/^\/([a-z0-9][a-z0-9-]{1,39})$/i);
      if (one) { url.pathname = `/l/${one[1].toLowerCase()}`; url.searchParams.set("shop", slug); return NextResponse.rewrite(url); }
      // Anything else on a shop's own domain goes back to the shop.
      url.pathname = "/"; url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Dedicated Admin Login routes
  if (path === "/admin/login" || path === "/login/admin") {
    const url = request.nextUrl.clone();
    url.pathname = "/admin-login";
    return NextResponse.rewrite(url);
  }

  if (!path.startsWith("/dashboard") && !path.startsWith("/admin") && !path.startsWith("/login") && !path.startsWith("/auth") && !path.startsWith("/admin-login")) {
    return NextResponse.next();
  }

  // Refresh the Supabase session cookie and keep /dashboard and /admin behind sign-in.
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && (path.startsWith("/dashboard") || path.startsWith("/admin"))) {
    const url = request.nextUrl.clone();
    if (path.startsWith("/admin")) {
      url.pathname = "/admin/login";
    } else {
      url.pathname = "/login";
      url.searchParams.set("next", path);
    }
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|img/).*)"] };
