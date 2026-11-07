import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, availability, expandKits, kitFree, validateDates } from "@/lib/rental";
import { loadBookings, loadRentalCatalog } from "@/lib/rental-server";
import { todayIn } from "@/lib/billing";

/** Public: how many of each rental item are free for the dates a shopper picked. GET ?slug=&start=YYYY-MM-DD&days=N */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const slug = u.searchParams.get("slug") ?? "";
  const start = u.searchParams.get("start") ?? "";
  const days = Number(u.searchParams.get("days") ?? "1");
  const admin = createAdminClient();
  const { data: b } = await admin.from("businesses").select("id, rental_lead_days, rental_buffer_days").eq("slug", slug).maybeSingle();
  if (!b) return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  const bad = validateDates(start, days, todayIn(), b.rental_lead_days ?? 0);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const end = addDays(start, days);
  const { products, kits } = await loadRentalCatalog(admin, b.id);
  const bookings = expandKits(await loadBookings(admin, b.id, start, end, b.rental_buffer_days ?? 0), kits);
  const free = kitFree(availability(products, bookings, start, end, b.rental_buffer_days ?? 0), kits);
  return NextResponse.json({ start, end, days, free }, { headers: { "Cache-Control": "no-store" } });
}
