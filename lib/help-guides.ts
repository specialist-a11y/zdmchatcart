/**
 * The how-to library in Help and support. Plain content: edit the words here, the page lays them out.
 * `link.path` is relative to the client's dashboard (/dashboard/<slug>/...).
 */
export type Guide = {
  id: string;
  section: string;
  title: string;
  summary: string;
  minutes: number;
  steps: string[];
  tips?: string[];
  link?: { label: string; path: string };
  keywords?: string;
};

export const SECTIONS = [
  "Getting started",
  "Your website",
  "Products and services",
  "Orders and payments",
  "WhatsApp",
  "Content and social",
  "Customers and marketing",
  "Your account",
] as const;

export const GUIDES: Guide[] = [
  /* Getting started ---------------------------------------------------------------------- */
  {
    id: "getting-started", section: "Getting started", minutes: 15,
    title: "Set up your shop, start to finish",
    summary: "The order to do things in, so your first customer can order and pay on WhatsApp.",
    steps: [
      "Business info: add your business name, logo, brand colour and the WhatsApp number customers message.",
      "Products and services: add at least a few items with a photo and a price.",
      "Website: pick a website look that suits your business and write your hero section.",
      "Settings: connect Fygaro so customers get a payment link, and connect WhatsApp so the order bot can reply.",
      "Settings: connect Instagram and Facebook if you want to schedule posts and use auto-replies.",
      "Website: copy your shop link and put it in your Instagram bio and WhatsApp profile.",
      "Place a test order yourself from your phone to see what customers see.",
    ],
    tips: ["Stuck on Fygaro or WhatsApp? Open a request below and ZDMINC will set it up with you."],
    link: { label: "Start with Business info", path: "business" },
    keywords: "setup start new onboarding first steps",
  },
  {
    id: "business-info", section: "Getting started", minutes: 3,
    title: "Edit your business name, logo, hours and contact details",
    summary: "What customers see about you on your website, and how ZDMINC reaches you.",
    steps: [
      "Go to Business info.",
      "Under Brand, set your business name, tagline, brand colour and logo link.",
      "Under How customers reach you, add the WhatsApp number customers message, with the country code (for Barbados, 1 246 ...).",
      "Add About the business, opening hours, your address or pickup point, and pickup and delivery details. These show at the bottom of your website.",
      "Add your Instagram, Facebook and website under Social and website.",
      "Click Save changes.",
    ],
    tips: ["Your brand colour is used for buttons and headers on every website template."],
    link: { label: "Open Business info", path: "business" },
    keywords: "logo colour color hours address tagline phone email",
  },

  /* Your website ------------------------------------------------------------------------- */
  {
    id: "website-look", section: "Your website", minutes: 3,
    title: "Choose a website template",
    summary: "Five looks made for different businesses: Classic, Caterer, Artist, Beauty and Trades.",
    steps: [
      "Go to Website and scroll to Website look.",
      "Click a template. The preview underneath changes so you can see it with your own products.",
      "Upload a cover photo if you like. It sits behind the top of the page. Without one, your first product photo is used.",
      "Click Use this look to make it live.",
    ],
    tips: [
      "Caterer and Beauty show a menu grouped by category, so give your items categories in Products and services.",
      "Each template words its buttons for your trade: Book on Beauty, Enquire on Artist, Get a quote on Trades.",
      "You can switch templates any time. Nothing is lost.",
    ],
    link: { label: "Open Website", path: "website#look" },
    keywords: "template theme design look style caterer artist beauty salon trades cover photo",
  },
  {
    id: "hero-section", section: "Your website", minutes: 3,
    title: "Write your hero section (headline, sub-headline, paragraph)",
    summary: "The big welcome at the top of your website.",
    steps: [
      "Go to Website, then Website look, then Hero section.",
      "Headline: one short line about what you offer, like \"Bajan black cake, baked to order\".",
      "Sub-headline: the reason to choose you, like \"Rum-soaked, family recipe, ready for Christmas\".",
      "Paragraph: two or three sentences on what you do, who it's for and how to order.",
      "Click Use this look to save. The preview updates.",
    ],
    tips: ["Leave the fields blank to show just your business name and tagline.", "On the Classic template, adding hero text turns the slim name bar into a full hero section."],
    link: { label: "Edit hero section", path: "website#look" },
    keywords: "headline heading banner welcome intro text top",
  },
  {
    id: "custom-domain", section: "Your website", minutes: 10,
    title: "Use your own domain, like yourname.com",
    summary: "Show your website on a name you own instead of the ZDM ChatCart address.",
    steps: [
      "Buy a domain from any provider (for example GoDaddy, Namecheap or Google), or ask ZDMINC to buy it for you.",
      "Go to Website, then Your own domain, type the domain and click Connect domain.",
      "Copy the DNS record shown (type, name and value) into your domain provider's DNS settings.",
      "Come back and click Check now. It can take from a few minutes to a few hours to go live.",
    ],
    tips: ["When the domain is live, your short links use it too, like yourname.com/cake."],
    link: { label: "Connect a domain", path: "website#domain" },
    keywords: "domain dns url web address own name",
  },
  {
    id: "short-links", section: "Your website", minutes: 2,
    title: "Make short links that count sales",
    summary: "One tidy link per Story, post, flyer or ad, so you can see which ones bring orders.",
    steps: [
      "Go to Website, then Short links.",
      "Give the link a name you'll recognise, like \"Black cake Story\", and optionally a short name like cake.",
      "Click Make short link, then copy it into your post, Story, bio or flyer.",
      "Check back to see clicks, paid orders and sales for each link.",
    ],
    link: { label: "Make a short link", path: "website#links" },
    keywords: "link tracking story bio flyer ref code clicks",
  },
  {
    id: "google-search", section: "Your website", minutes: 5,
    title: "Get found on Google",
    summary: "Help people searching for what you sell, near them, find your shop and your products.",
    steps: [
      "Go to Website, then Google search. The box at the top shows how your shop looks in a Google result.",
      "Write a title that says what you sell and where, like \"Black cake and sweetbread in Holetown\". Keep it under 60 characters.",
      "Write a description of 120 to 160 characters: what's special, and that people can order online and pay by card.",
      "Add a photo and a short description to every product. Each product has its own page Google can show, like yourshop.com/p/black-cake.",
      "Set your address and opening hours in Business info. Google uses them for local searches and \"open now\".",
      "If you have your own domain, verify it in Google Search Console, paste the code into Website, Google search, then add your sitemap: yourdomain.com/sitemap.xml.",
    ],
    tips: [
      "Google takes days to weeks to pick up changes. Keep sharing your links; visits help.",
      "Use the words your customers use. \"Rum cake\" and \"black cake\" are both searched.",
      "Your Instagram and Facebook links in Business info help Google connect your shop to your pages.",
    ],
    link: { label: "Open Google search", path: "website#seo" },
    keywords: "seo google search found ranking search console sitemap description title",
  },

  /* Products and services ---------------------------------------------------------------- */
  {
    id: "add-item", section: "Products and services", minutes: 3,
    title: "Add a product or service",
    summary: "Put something on your website with a photo, price and category.",
    steps: [
      "Go to Products and services and click + Add a product or + Add a service.",
      "Add a photo: drop it in or tap to choose. Phone photos are fine and are resized for you.",
      "Type the name and a short description.",
      "Pick a category, like Desserts or Nails. Categories group items on your website.",
      "Type the price. Add a price note if it helps, like \"per hour\" or \"per dozen\".",
      "For products, add stock if you want it counted. Leave it blank if you don't track stock.",
      "Leave Show on my website on, and click Save.",
    ],
    link: { label: "Add an item", path: "products" },
    keywords: "product service item add new photo picture price category stock",
  },
  {
    id: "options", section: "Products and services", minutes: 3,
    title: "Add sizes, flavours or service lengths (options)",
    summary: "One item with choices, each with its own price, like 6, 8 or 10 inch, or 30, 60 or 90 minutes.",
    steps: [
      "Open the item in Products and services and switch on \"Comes in different options\".",
      "Add a row for each option with its name and price, or tap a quick-fill button like Cake sizes or Durations, then add the prices.",
      "Untick an option when it's unavailable. It stays listed but customers can't pick it.",
      "Click Save. On your website, customers pick an option before adding the item.",
    ],
    tips: ["Your website shows the cheapest available price as \"From BBD $...\".", "Stock, if you track it, counts across all options together."],
    link: { label: "Open Products and services", path: "products" },
    keywords: "variant variation size flavour flavor colour duration length package option",
  },
  {
    id: "price-on-request", section: "Products and services", minutes: 3,
    title: "Price on request and quotes",
    summary: "For jobs and custom orders where you set the price after talking to the customer.",
    steps: [
      "Set the item's price (or an option's price) to 0. Your website shows \"Price on request\", or \"Price on quote\" on the Trades template.",
      "When a customer sends that order on WhatsApp, the bot tells them you'll confirm the price. No payment link is sent yet.",
      "In Orders, these show a Price to confirm badge. Open the order.",
      "In Set prices, type the price for each item and click Save prices. With the box ticked, the payment link goes to the customer on WhatsApp straight away.",
    ],
    link: { label: "Open Orders", path: "orders" },
    keywords: "quote estimate custom price 0 zero request confirm",
  },
  {
    id: "hide-reorder", section: "Products and services", minutes: 1,
    title: "Hide, reorder or delete items",
    summary: "Keep your website tidy when things sell out or change.",
    steps: [
      "Hide: click Hide on the item. It disappears from your website but stays in your list. Click Show to bring it back.",
      "Reorder: use the up and down arrows. Your website shows items in this order within each category.",
      "Delete: open the item and click Delete (owners and admins). Past orders keep their details.",
    ],
    link: { label: "Open Products and services", path: "products" },
    keywords: "hide sold out remove delete order sort move",
  },

  /* Orders and payments ------------------------------------------------------------------ */
  {
    id: "how-orders-work", section: "Orders and payments", minutes: 2,
    title: "How a website order reaches you",
    summary: "From your website to WhatsApp to paid, mostly on its own.",
    steps: [
      "A customer adds items on your website and taps the button to send on WhatsApp.",
      "WhatsApp opens with a message that includes an order code, like CC-1042. They send it to you.",
      "Your WhatsApp bot replies with the order summary and a secure Fygaro payment link.",
      "When they pay, the order is marked paid automatically and appears in Orders.",
      "You prepare it and move it to Ready, then Fulfilled.",
    ],
    tips: ["The order code prefix comes from Business info, so your codes can start with your initials."],
    link: { label: "Open Orders", path: "orders" },
    keywords: "order code flow checkout cart how it works",
  },
  {
    id: "connect-fygaro", section: "Orders and payments", minutes: 10,
    title: "Connect Fygaro to take card payments",
    summary: "So every order gets its own payment link and is marked paid automatically.",
    steps: [
      "In Fygaro, create a Fygaro Link with an open amount.",
      "In Fygaro settings, go to API Credentials and generate an API key. Copy the key ID and the secret.",
      "In Fygaro, set the Hook URL to the address ZDMINC gives you (it ends in /api/webhooks/fygaro).",
      "In ZDM ChatCart, go to Settings, then Fygaro payments. Paste the Fygaro Link URL, the API key and the API secret, then click Save Fygaro.",
    ],
    tips: ["Not sure about any of this? Open a request and ZDMINC will connect it with you."],
    link: { label: "Open Settings", path: "settings" },
    keywords: "fygaro payment card pay link api key secret webhook",
  },
  {
    id: "payment-links", section: "Orders and payments", minutes: 1,
    title: "Send a payment link yourself",
    summary: "For orders that came in by chat, or when a customer asks again.",
    steps: [
      "Open the order in Orders.",
      "Click Create Fygaro link, then Send link on WhatsApp.",
      "The customer gets the order summary and the link in your WhatsApp chat.",
    ],
    tips: ["The customer needs to have messaged you first, so their number is on the order."],
    link: { label: "Open Orders", path: "orders" },
    keywords: "payment link send resend fygaro",
  },
  {
    id: "mark-paid", section: "Orders and payments", minutes: 1,
    title: "Mark an order paid (cash or transfer) and send a receipt",
    summary: "Keep your records right when someone pays another way.",
    steps: [
      "Open the order in Orders.",
      "Change the status to Paid. Tick the receipt box to send them a receipt on WhatsApp.",
      "Stock and the customer's record update just as they do for Fygaro payments.",
      "To send the receipt again later, click Send receipt on WhatsApp.",
    ],
    link: { label: "Open Orders", path: "orders" },
    keywords: "cash paid manual receipt status ready fulfilled",
  },

  /* WhatsApp ----------------------------------------------------------------------------- */
  {
    id: "connect-whatsapp", section: "WhatsApp", minutes: 15,
    title: "Connect WhatsApp so the order bot can reply",
    summary: "Uses the official WhatsApp Cloud API from Meta.",
    steps: [
      "In your Meta developer app, set the WhatsApp webhook to the address ZDMINC gives you (it ends in /api/webhooks/whatsapp) and subscribe to messages.",
      "Copy the Phone number ID and a permanent access token from Meta.",
      "In ZDM ChatCart, go to Settings, then WhatsApp Cloud API. Paste them and click Save WhatsApp.",
      "Send your business number a test message with an order code to check the bot replies.",
    ],
    tips: ["This is the most technical step. ZDMINC can do it for you: open a request."],
    link: { label: "Open Settings", path: "settings" },
    keywords: "whatsapp cloud api meta token phone number id bot connect",
  },
  {
    id: "inbox", section: "WhatsApp", minutes: 2,
    title: "Reply to customers in the Inbox",
    summary: "Your WhatsApp chats in one place.",
    steps: [
      "Go to Inbox to see your WhatsApp conversations.",
      "The bot answers order codes first. You can step in and type a reply any time.",
    ],
    link: { label: "Open Inbox", path: "inbox" },
    keywords: "inbox chat messages reply conversation",
  },

  /* Content and social ------------------------------------------------------------------- */
  {
    id: "connect-instagram", section: "Content and social", minutes: 3,
    title: "Connect Instagram and Facebook",
    summary: "Needed for scheduling posts and Instagram auto-replies.",
    steps: [
      "Your Instagram must be a professional (business or creator) account linked to a Facebook Page.",
      "Go to Settings and click Connect Instagram and Facebook. Log in with Facebook and approve everything it asks for.",
      "If you manage several Pages, tick only the one for this business.",
    ],
    tips: ["Connected before posting was added? Click Reconnect so posting to Facebook is allowed."],
    link: { label: "Open Settings", path: "settings" },
    keywords: "instagram facebook connect page professional account reconnect",
  },
  {
    id: "upload-content", section: "Content and social", minutes: 2,
    title: "Upload photos and videos to your Content library",
    summary: "Everything you might post, in one place, with captions written for you.",
    steps: [
      "Go to Content, then Library and posting.",
      "Drop photos and videos onto the upload box, or click it to choose.",
      "If something is wide (landscape), pick 4:5 for the feed or 9:16 for Reels, drag the frame to choose what stays in, and click Use this.",
      "A caption is written for each upload automatically. You can change it when you post.",
    ],
    tips: ["Instagram feed photos can't be taller than 4:5, so 9:16 photos can only go to Facebook.", "Tap ▶ on a video to play it with sound."],
    link: { label: "Open Content", path: "content?tab=library" },
    keywords: "upload photo video library crop caption ai",
  },
  {
    id: "schedule-post", section: "Content and social", minutes: 3,
    title: "Schedule a post to Instagram and Facebook",
    summary: "Pick the photos or videos, write the caption, choose a time.",
    steps: [
      "In Content, tap up to 10 photos or videos in the order you want them.",
      "The caption fills in for you. Click Rewrite with AI for another version, or type your own.",
      "Tick Instagram, Facebook or both.",
      "Pick a date and time and click Schedule, or click Post now.",
      "Scheduled posts appear at the top of the page with links once they're live. Cancel any scheduled post before it goes out.",
    ],
    tips: [
      "One video becomes a Reel. Several items become a carousel on Instagram and an album on Facebook.",
      "Facebook can't mix a video with photos in one post. Post the video on its own.",
    ],
    link: { label: "Open Content", path: "content?tab=library" },
    keywords: "schedule post instagram facebook reel carousel caption time calendar",
  },
  {
    id: "zdm-videos", section: "Content and social", minutes: 2,
    title: "Choose your ZDMINC videos and send them to the calendar",
    summary: "For plans that include a monthly shoot.",
    steps: [
      "Go to Content, then From ZDMINC. Pick the month at the top.",
      "Tap ▶ to watch each clip, then tap Use or Skip.",
      "Click Send chosen to calendar. Pick the first post date and how often (for example every 2 days), and tick Instagram and/or Facebook.",
      "Each chosen clip becomes its own post with its caption. Cancel any of them later in Library and posting.",
    ],
    link: { label: "Open From ZDMINC", path: "content?tab=videos" },
    keywords: "zdminc videos shoot use skip calendar clips month",
  },
  {
    id: "ig-autoreplies", section: "Content and social", minutes: 3,
    title: "Instagram auto-replies: \"Comment CAKE for the link\"",
    summary: "When someone comments a keyword, they get a reply under the comment and the link in their DMs.",
    steps: [
      "Go to IG auto-replies and start a New auto-reply.",
      "Type the keyword, like CAKE, and choose which post it's for, or every post.",
      "Write the DM message and choose the link to send.",
      "Say \"Comment CAKE and I'll DM you the link\" in your post or caption.",
    ],
    tips: ["Check Latest comments on that page to see who got the link, and any problems."],
    link: { label: "Open IG auto-replies", path: "autoreplies" },
    keywords: "instagram comment keyword dm auto reply automatic",
  },
  {
    id: "ads", section: "Content and social", minutes: 2,
    title: "Approve ads and see what they sold",
    summary: "ZDMINC builds your ads; you approve them and see the results.",
    steps: [
      "Go to Ads. Anything waiting for you is under Needs your OK.",
      "Read the ad and who it will be shown to, then click Approve and launch, or Ask for a change.",
      "Set your Monthly ad budget, and top up your Ad wallet with Fygaro if your plan uses one.",
      "Each ad has its own code, so orders from it are counted. See spend, orders and sales on the same page.",
    ],
    link: { label: "Open Ads", path: "ads" },
    keywords: "ads advertising meta budget approve wallet campaign",
  },

  /* Customers and marketing -------------------------------------------------------------- */
  {
    id: "customers", section: "Customers and marketing", minutes: 1,
    title: "Understand your customer list",
    summary: "Everyone who has ordered or messaged, sorted by stage.",
    steps: [
      "Go to Customers. Use the stage buttons to filter. Each customer shows their number of orders and total spent.",
      "New: messaged or started an order. Ordered: placed an order. Paid: paid once. Repeat: paid more than once. Quiet: hasn't been back in a while.",
    ],
    link: { label: "Open Customers", path: "customers" },
    keywords: "customers crm stage repeat quiet list contacts",
  },
  {
    id: "what-sold", section: "Customers and marketing", minutes: 2,
    title: "See which posts and ads actually sold",
    summary: "Track sales back to the Story, post or ad that brought the customer.",
    steps: [
      "Use a short link (Website, then Short links) in each post, Story or flyer.",
      "Orders that come through a link are counted for it for 7 days, even if the customer comes back later.",
      "Go to Marketing to see what's lined up and what sold in the last 30 days.",
    ],
    link: { label: "Open Marketing", path: "marketing" },
    keywords: "tracking attribution ref sales results report",
  },

  /* Your account ------------------------------------------------------------------------- */
  {
    id: "sign-in", section: "Your account", minutes: 1,
    title: "Signing in and out",
    summary: "No password: we email you a sign-in link.",
    steps: [
      "Go to the login page, type your email and click Email me a sign-in link.",
      "Open the email on the same device and tap the link.",
      "You stay signed in on that device until you sign out. Sign out is at the bottom of the menu.",
    ],
    tips: ["If tapping the link opens Gmail or Outlook's own browser, copy the link into Safari or Chrome instead, or long-press it and choose Open in browser."],
    keywords: "login log in sign in sign out password email magic link",
  },
  {
    id: "plan-billing", section: "Your account", minutes: 2,
    title: "Change your plan and pay invoices",
    summary: "Owners and admins can see the plan, invoices and billing details.",
    steps: [
      "Go to Plan and billing to see your plan, usage and next invoice.",
      "Click Change plan to upgrade or downgrade. Upgrades start now with a prorated payment link; downgrades start at your next renewal.",
      "Pay any invoice with its Pay button.",
      "Update who we bill under Billing details.",
    ],
    tips: ["Every plan includes 1,000 contacts. You'll see a warning at 90%."],
    link: { label: "Open Plan and billing", path: "billing" },
    keywords: "plan billing invoice upgrade downgrade price pay subscription contacts",
  },
  {
    id: "get-help", section: "Your account", minutes: 1,
    title: "Get help from the ZDMINC team",
    summary: "Send a request and we reply here, and on WhatsApp if you like.",
    steps: [
      "In Help and support, go to Your requests and click New request.",
      "Choose what it's about, write a short subject and tell us what you need.",
      "Our replies show in the request. Reply there to keep everything in one thread.",
    ],
    tips: ["For anything urgent, use the WhatsApp button on that page."],
    keywords: "help support request ticket contact team",
  },
];

/** Simple search across titles, summaries, steps and keywords. */
export function searchGuides(q: string, guides = GUIDES) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return guides;
  return guides
    .map((g) => {
      const title = g.title.toLowerCase(), body = `${g.summary} ${g.steps.join(" ")} ${(g.tips ?? []).join(" ")} ${g.keywords ?? ""} ${g.section}`.toLowerCase();
      let score = 0;
      for (const w of words) {
        if (title.includes(w)) score += 3;
        else if (body.includes(w)) score += 1;
        else return null;
      }
      return { g, score };
    })
    .filter((x): x is { g: Guide; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.g);
}
