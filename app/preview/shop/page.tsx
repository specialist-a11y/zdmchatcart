import { notFound } from "next/navigation";
import ShopClient from "../../s/[slug]/ShopClient";

// Dev-only: the shop page with sample data. Returns 404 in production.
export default function ShopPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  const business = {
    name: "Island Crumb Bakery", slug: "island-crumb-preview", tagline: "Small-batch Bajan baking, Holetown", logo_url: null, brand_color: "#5A2E1A",
    currency: "BBD", whatsapp_number: "12465550123", description: "Black cake, coconut sweetbread and bread pudding, baked every Friday and Saturday.",
    address: "1st Street, Holetown, St James", opening_hours: "Tue to Fri 7am to 5pm\nSat 6am to 1pm", delivery_info: "Pickup in Holetown, or delivery island-wide from BBD 10.",
    public_email: null, instagram: "@islandcrumbbakery", facebook: null, website_url: null, meta_pixel_id: null,
    site_template: "classic", shop_theme: "warm", special_text: "This Saturday only: rum cake, pre-order by Friday 6pm", special_ends_at: null, announcement: null,
    hours: { tue: [["07:00", "17:00"]], wed: [["07:00", "17:00"]], thu: [["07:00", "17:00"]], fri: [["07:00", "17:00"]], sat: [["06:00", "13:00"]] },
    delivery_zones: [{ id: "a", name: "Zone A (5 km)", fee: 10 }, { id: "b", name: "Zone B (15 km)", fee: 20 }], pickup_enabled: true, slot_minutes: 120,
  };
  const products = [
    { id: "1", name: "Black cake", description: "Fruit soaked for 6 weeks in rum. Wrapped and boxed, keeps 3 weeks.", price: 40, image_url: null, stock: 6, category: "Cakes",
      variants: [{ id: "s6", name: "6 inch", price: 40, available: true }, { id: "s8", name: "8 inch", price: 60, available: true }], ready_days: ["fri", "sat"], lead_days: 2, pairs_with: "3" },
    { id: "2", name: "Coconut sweetbread", description: "Soft, sweet and loaded with coconut.", price: 25, image_url: null, stock: 0, category: "Breads" },
    { id: "3", name: "Bread pudding", description: "With a rum glaze.", price: 18, image_url: null, stock: null, category: "Puddings" },
    { id: "4", name: "Cassava pone", description: null, price: 15, image_url: null, stock: null, category: "Puddings" },
  ];
  return <ShopClient business={business as any} products={products as any} attribution={null} best={["3"]} previewTheme="warm"
    openNow={{ open: true, label: "Open now, until 5pm", reason: "open" }} />;
}
