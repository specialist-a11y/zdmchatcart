import type { MetadataRoute } from "next";

/** Lets clients add ZDM ChatCart to their phone's Home Screen (needed for notifications on iPhone). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ZDM ChatCart",
    short_name: "ChatCart",
    description: "Orders, WhatsApp chats and customers for your business.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0B0F0E",
    theme_color: "#0B0F0E",
    icons: [{ src: "/brand/zdm-chatcart-icon-1024.png", sizes: "1024x1024", type: "image/png", purpose: "any" }],
  };
}
