import { renderConcept } from "@/lib/design-concept";
import type { DesignStyle } from "@/lib/design-brief";

export const runtime = "nodejs";

/** Development only: a sample website concept. ?style=modern|bold|elegant|warm|cinematic */
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const style = (new URL(req.url).searchParams.get("style") ?? "cinematic") as DesignStyle;
  const img = "https://rndqdepvmfdfoesxyurh.supabase.co/storage/v1/object/public/product-images/8c85771d-9ed9-4c60-a24f-189e3992b990";
  return renderConcept({
    business: "Starlight Cinema Experiences", about: "Outdoor movie nights in Barbados. Projectors, giant screens and popcorn for your backyard, birthday or event.",
    customers: "Families", style, primary: "#ff4757", accent: "#feca57", pages: ["Home", "About", "Gallery", "Booking", "FAQ", "Contact"],
    features: ["Online booking", "Photo gallery", "Customer reviews"], examples: "", domain: "I have one", timing: "Within a month", budget: "Not sure yet", notes: "",
  }, { logo: `${img}/starlight-logo.webp`, hero: `${img}/starlight-event2.jpg`, photos: [`${img}/starlight-projector.jpg`, `${img}/starlight-popcorn.jpg`, `${img}/starlight-chairs.jpg`], domain: "starlightcinemaexperiences.com" });
}
