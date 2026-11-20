import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { availability, expandKits, kitFree, rentalSpan, validateDates } from "@/lib/rental";
import { evePickupOn, loadBookings, loadRentalCatalog } from "@/lib/rental-server";
import { todayIn } from "@/lib/billing";
import { CORS, preflight } from "@/lib/cors";

export const OPTIONS = preflight;

/** Public: how many of each rental item are free for the dates a shopper picked. GET ?slug=&start=YYYY-MM-DD&days=N */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const slug = u.searchParams.get("slug") ?? "";
  const start = u.searchParams.get("start") ?? "";
  let days = Number(u.searchParams.get("days") ?? "1");
  const admin = createAdminClient();
  const { data: b } = await admin.from("businesses").select("id, rental_lead_days, rental_buffer_days").eq("slug", slug).maybeSingle();
  if (!b) return NextResponse.json({ error: "Shop not found" }, { status: 404, headers: CORS });
  // Evening-before pickup: start is the event date; the items go out the day before.
  const eve = await evePickupOn(admin, b.id);
  if (eve) days = 1; // one event night: pick up the day before, return the following day
  const bad = validateDates(start, days, todayIn(), (b.rental_lead_days ?? 0) + (eve ? 1 : 0));
  if (bad) return NextResponse.json({ error: bad }, { status: 400, headers: CORS });
  const { pickup, end } = rentalSpan(start, days, eve);
  const { products, kits } = await loadRentalCatalog(admin, b.id);
  const bookings = expandKits(await loadBookings(admin, b.id, pickup, end, b.rental_buffer_days ?? 0), kits);
  const free = kitFree(availability(products, bookings, pickup, end, b.rental_buffer_days ?? 0), kits);
  return NextResponse.json({ start, pickup, end, days, evePickup: eve, free }, { headers: { "Cache-Control": "no-store", ...CORS } });
}
