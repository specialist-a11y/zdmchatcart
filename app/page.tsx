import type { Metadata } from "next";
import { LANDING_CSS, LANDING_HTML } from "./landing-content";

export const metadata: Metadata = {
  title: "ZDM ChatCart: sell on WhatsApp, get paid by link",
  description: "Your website, WhatsApp orders and simple payment links in one system, with videos, ads and cart recovery run by ZDMINC. Made for Caribbean small businesses.",
};

// Phones: the top menu becomes one swipeable row instead of three stacked lines.
const MOBILE_CSS = `@media (max-width: 640px) {
  header > nav { flex-wrap: nowrap !important; overflow-x: auto; width: 100%; gap: 18px !important; padding-bottom: 6px; scrollbar-width: none; }
  header > nav::-webkit-scrollbar { display: none; }
  header > nav a { white-space: nowrap; flex: none; }
  header { padding: 16px 18px !important; gap: 10px !important; }
}`;

/** Marketing site. The page body is the approved wireframe; only the WhatsApp links are filled in here. */
export default function Home() {
  const n = (process.env.NEXT_PUBLIC_ZDM_SUPPORT_WHATSAPP ?? "").replace(/\D/g, "");
  const wa = n ? `https://wa.me/${n}?text=${encodeURIComponent("Hi ZDMINC! I'd like a ZDM ChatCart demo.")}` : "#contact";
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS + MOBILE_CSS }} />
      <div dangerouslySetInnerHTML={{ __html: LANDING_HTML.replaceAll("__WA__", wa) }} />
    </>
  );
}
