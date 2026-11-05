/** Client CRM menu, in wireframe order. The position is the number in each page title ("04 / Orders"). */
export const CLIENT_NAV = [
  ["", "Today", "today"], ["inbox", "Inbox", "inbox"], ["whatsapp", "WhatsApp", "wa"], ["orders", "Orders", "orders"],
  ["customers", "Customers", "customers"], ["products", "Products", "products"], ["marketing", "Marketing", "marketing"], ["autoreplies", "IG auto-replies", "ig"],
  ["ads", "Ads", "ads"], ["content", "Content", "videos"], ["website", "Website", "website"], ["settings", "Settings", "settings"],
  ["business", "Business info", "studio"], ["billing", "Plan and billing", "card"], ["support", "Help and support", "support"],
] as const;
export const num = (key: string) => CLIENT_NAV.findIndex(([k]) => k === key) + 1;

export const ADMIN_NAV = [
  ["/admin", "Clients", "customers"], ["/admin/support", "Support", "support"], ["/admin/whatsapp", "WhatsApp", "wa"],
  ["/admin/videos", "Content uploads", "upload"], ["/admin/ads", "Ads", "ads"], ["/admin/billing", "Plans and billing", "card"],
  ["/admin/team", "Team", "team"],
] as const;
export const adminNum = (href: string) => ADMIN_NAV.findIndex(([h]) => h === href) + 1;
