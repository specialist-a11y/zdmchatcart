# ZDM ChatCart

Browse online. Order on WhatsApp. Get paid with Fygaro.
One app, many businesses: each business gets its own shop page, WhatsApp ordering, Fygaro payment links and a small CRM.

## What works in this first build

| Area | What it does |
|---|---|
| Accounts | Email magic-link sign-in. A user can own or join several businesses. |
| Businesses | Each business is walled off by Supabase row-level security. Strangers and other businesses see nothing. |
| Shop page | `/s/<slug>`: catalog, cart saved in the browser, optional "save my cart" WhatsApp opt-in, `Order on WhatsApp`. Add `?ref=<post-code>` to track which post or ad sent the buyer. |
| Orders | Prices always come from the database. Each order gets a code like `IC-1048` and opens WhatsApp with that code prefilled. |
| WhatsApp bot | When a customer sends the code, the bot links them to the order, replies with the summary and a Fygaro link, and records PICKUP or DELIVERY. First-time chatters get the shop link. |
| Fygaro | A signed payment link per order (exact total, order id as reference). The Fygaro Hook marks the order paid, lowers stock, updates the customer's CRM record and sends a WhatsApp receipt. Retries are ignored. |
| IG auto-replies | **IG auto-replies** page: the client sets a keyword (CAKE), for one post or every post. When someone comments it, the app replies under the comment ("@tara.best Sent! Check your DMs", rotating lines) and sends them one DM with the link (`islandcrumb.com/cake`), using Instagram's private replies. Each keyword gets its own short link, so comments, DMs, clicks, paid orders and sales show per keyword. Repeat comments by the same person within 7 days and Meta's webhook retries are ignored; there's a daily cap and a pause switch. Latest comments and any errors are listed. |
| Own domain | Website page: the client types their domain (islandcrumb.com or shop.islandcrumb.com) and gets the exact DNS record to add (A record for a main domain, CNAME for a subdomain). **Check now** verifies it; once live, that domain shows their shop and their short links point there. With `VERCEL_TOKEN` and `VERCEL_PROJECT_ID` set, the domain is added to Vercel automatically (SSL included); otherwise the app checks DNS and ZDMINC adds it in Vercel. Up to 3 per shop. |
| Short links | Website page: make a short link per Story, bio, ad, flyer or QR code (`islandcrumb.com/cake` once the shop's own domain is live, else `zdm.bb/cake` with `NEXT_PUBLIC_SHORT_URL`, else `{site}/l/cake`). Each link counts clicks and adds its tracking code to the shop visit, so paid orders and sales show next to it. Use an ad's code (A-3) as the tracking code to feed the Ads results too. |
| Receipts | When an order is paid (Fygaro Hook, or marked paid for cash with the box ticked) the customer gets a till-style receipt image on WhatsApp: shop name, order code, items, total, payment and ref, PAID stamp, order-code barcode. The image comes from `/api/receipts/<order id>?t=<signed token>`, so only the customer's link opens it. Order pages have **Send receipt on WhatsApp** and **View receipt**. Needs an https `NEXT_PUBLIC_SITE_URL` (WhatsApp downloads the image); otherwise a text receipt goes instead. Set `RECEIPT_VAT_RATE=0.175` to show VAT included. Preview at `/api/receipts/demo` in development. |
| Dashboard | Orders (filters, 24-hour paid total), order detail (create/send payment link, open chat, change status, mark paid for cash), products, customers by stage, settings to connect Fygaro and WhatsApp. |

| ZDMINC admin (`/admin`) | ZDMINC staff only. Clients list with plan, MRR and health; client page (usage, connections, history, internal notes, invoices, owner contact); add a client and email the owner an invite; pause or resume; "View as client" opens their CRM. |
| Plan changes | Upgrade, downgrade or pause from the admin, or by the client in Help and support. Upgrades start now and send a prorated Fygaro link; downgrades wait for renewal (or start now with a credit). Every change is logged. |
| Billing | Plans and prices you can edit, invoices paid by Fygaro link on ZDMINC's own account (the Fygaro Hook marks them paid), daily renewals, overdue marking, WhatsApp reminders on day 3 and day 7. |
| Support | Client opens a request in Help and support. Staff see one queue with priority, assignee, status, first-reply time and internal notes the client never sees. Replies show in the client's app and, if ticked, on WhatsApp. |
| WhatsApp (admin) | Chats between the ZDMINC team and client owners on ZDMINC's own number. Unknown numbers can be linked to a client. Outside Meta's 24-hour window it sends your approved template first and delivers your text as soon as they reply. Any chat can become a ticket. |
| Client account | Business info (name, tagline, about, logo, colour, order prefix, WhatsApp, email, address, hours, pickup and delivery, social links, owner contact), shown on the shop page. Plan and billing: plan, usage meters, next invoice, change plan, invoices with Pay buttons, billing details. Owners and admins only. |
| Contact limits | Every plan includes 1,000 contacts (people in Customers). Above that, each started block of 1,000 adds BBD $50 to the renewal invoice. Both numbers are editable per plan in admin Plans and billing. Clients see a meter and a warning at 90%. |
| Ads | Staff create a campaign (type, daily budget, dates, clip, caption, audience) and the owner approves or asks for changes from their Ads page or a WhatsApp link. Each ad gets a code (A-1, A-2…) and a shop link with `?ref=A-1`; paid orders through that link (remembered for 7 days) count as the ad's sales. Staff log daily spend from Meta Ads Manager, or paste it in bulk. Clients see spend against their monthly budget, orders, sales, return and cost per order. Launching inside Meta is still done by hand in the client's own ad account. |
| Ad audiences | Structured "who sees it": all of Barbados, chosen parishes or a distance around the shop; ages; gender; interests; warm audiences (shop visitors, cart abandoners, WhatsApp chatters, Instagram engagers, consented past customers); Instagram and/or Facebook. The owner sees it as one plain sentence before approving. Staff can download consented customers as a hashed CSV for a Meta customer list. |
| Paying for ads | Per client: their own Meta ad account and card (default), or a prepaid ad wallet. Wallet clients top up by Fygaro link; paid top-ups credit the wallet, logged spend comes off it, and an ad can't be marked running with less than one day's budget left. |
| Meta Pixel | Add the client's Pixel ID (and optionally a Conversions API token) in admin Ads. The shop asks visitors for consent first, then loads the Pixel and sends PageView, AddToCart and InitiateCheckout. When Fygaro confirms a payment, the server sends a Purchase event (hashed phone/email, ad click id) so Meta can optimise and leave buyers out of retargeting. Shoppers can also tick "send me offers" at checkout, which is the consent the past-customer audience relies on. |
| Videos | Staff add a shoot and upload finished clips straight to private storage, set titles and captions, then publish to the client's library (with a WhatsApp heads-up). Clients choose clips in their Videos tab; picks show in the admin. |
| Content and scheduling | Clients and staff upload photos and videos (staff can add to any client, from a shoot or as Extras). Wide uploads open a crop step: 4:5 or 9:16, drag to frame; videos are cropped on the server with ffmpeg. Captions are written by Claude (`ANTHROPIC_API_KEY`) from the photo or a still of the video, on upload and with Write with AI in the composer. Clients and staff upload photos and videos to the client's Content library (photos are cropped and converted to JPEG for Instagram on upload). Pick up to 10 items, write a caption, choose Instagram and/or Facebook, and schedule or post now. Single video = Reel / Page video; several items = carousel / photo album (Facebook can't mix video with photos). `/api/cron/posts` runs every 5 minutes (needs Vercel Pro for that schedule and `CRON_SECRET`), waits for Instagram video processing across runs, and shows links or errors with Try again. Needs the `pages_manage_posts` permission, so clients connected before this must reconnect in Settings. |
| Social accounts | Every plan, Starter up: Settings has **Connect Instagram and Facebook** (Facebook Login for Business). The client picks their Page and linked Instagram professional account; we save the Page, Instagram username and follower count, keep the Page token server-side only, and fill the shop page's social links if they're empty. Reconnect or disconnect any time. Needs `META_APP_ID`, `META_APP_SECRET` and `{site}/api/social/callback` as a redirect URI in the Meta app; the Instagram permissions need Meta App Review before clients outside your app's testers can connect. |
| Website (`/`) | The approved landing page from the wireframes: brand, how it works, cart recovery, features, pricing, FAQs (including how we differ from Fygaro and what the plans cover). Set `NEXT_PUBLIC_ZDM_SUPPORT_WHATSAPP` to fill the WhatsApp buttons. |
| Client CRM design | Built from the CRM wireframes: dark sidebar with badges (Inbox, Orders, Ads, Videos) and connection lights; numbered page titles. **Today** shows a "Do more of this" panel (what to scale, what to drop, best posting time, worked out from the last 30 days), sales vs the same weekday last week, what needs you, 7-day sales and order sources. **Inbox** shows every WhatsApp chat with replies from the app. **WhatsApp**, **Marketing** and **Website** show what is live and mark what is coming next. |
| Admin design | Same frame as the client CRM, with badges for open tickets, unread WhatsApp, ads waiting and overdue invoices. |
| Phones | Every screen is built for phones first: below 900px the sidebar becomes a top bar with a Menu drawer, KPI tiles go two across, panels stack, tables scroll sideways inside their card, buttons are at least 44px tall and fields use 16px text so iPhones don't zoom. Checked at 390px wide with no sideways page scroll. `npm run dev` then open `/preview` for a sample client screen (it 404s in production). |

Not in this build yet: automatic cutting of raw footage into clips (upload the edited clips for now), abandoned-cart reminders, Instagram/OpenReply, marketing autopilot and auto-posting, the WhatsApp automation builder and the website section editor.

## Setup

1. **Database** is already created: Supabase project `chatcart` (`rndqdepvmfdfoesxyurh`, us-east-1). The schema is in `supabase/migrations/0001_init.sql`.
2. **Environment**: copy `.env.example` to `.env.local` and fill in:
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase dashboard, Project Settings, API keys, the secret/service_role key. Server only, never commit it.
   - `NEXT_PUBLIC_SITE_URL`: your live URL once deployed.
   - `WHATSAPP_VERIFY_TOKEN`: any long random string, also entered in Meta.
   - `META_APP_SECRET`: Meta app, App settings, Basic, App secret.
3. **Supabase Auth**: Authentication, URL configuration: set Site URL to your live URL and add `<your-url>/auth/callback` to Redirect URLs.
4. **Run locally**: `npm install`, then `npm run dev` and open http://localhost:3000.
5. **Deploy**: push to GitHub, import into Vercel, add the same environment variables. `vercel.json` runs the billing job daily at 6am Barbados time; set `CRON_SECRET` in Vercel.
6. **Admin**: run the files in `supabase/migrations/` from `0002_admin.sql` to `0016_shop_front.sql`, in order, in the Supabase SQL editor, then make yourself staff once:
   `insert into public.platform_staff (user_id, name, role) values ('<your user id from Authentication, Users>', 'Kat', 'owner');`
   Open `/admin`. Add the rest of the team from Team.
7. **ZDMINC's own Fygaro and WhatsApp** (for billing clients and the admin WhatsApp inbox): fill in the `ZDM_*` variables in `.env.example`. Use a separate WhatsApp number from any client. Point that number's webhook at the same `<your-url>/api/webhooks/whatsapp`; the app tells the two apart by phone number ID. Create one utility template with a single variable, for example "Hi {{1}}, the ZDMINC team has a message for you. Reply here to see it.", and put its name in `ZDM_WA_TEMPLATE`.

## Connect a business

1. Sign in, create a business (name, shop address, order prefix, WhatsApp number), add products.
2. **Fygaro** (Pro plan or above): create a Fygaro Link with an open amount, generate an API key under Settings, API Credentials, and set the Hook URL to `<your-url>/api/webhooks/fygaro`. Paste the link URL, key and secret into ZDM ChatCart Settings.
3. **WhatsApp Cloud API**: in your Meta app, set the webhook to `<your-url>/api/webhooks/whatsapp` with your verify token and subscribe to `messages`. Paste the phone number ID and a permanent access token into ZDM ChatCart Settings.

## Tests

`npm test` covers Fygaro JWT signing, Fygaro and Meta webhook signatures, order-code parsing, server-side cart pricing, message text, and plan-change maths (prorating, renewal dates, reminder days, contact overage, ad return and maximum spend, audience summaries and form parsing, phone normalising for Meta).
`0002_admin.sql` was run on a local Postgres 16 with Supabase stand-ins, and its row-level security was checked (0003 too: the public key can read shop info but not owner contact or billing fields): clients see only their own tickets and published clips, can't post as staff or read internal notes, and can't touch subscriptions, invoices, notes or the WhatsApp inbox.

## Structure

```
app/s/[slug]            public shop
app/api/orders          cart -> order with code
app/api/webhooks/*      Fygaro and WhatsApp
app/page.tsx            marketing website (landing-content.ts is generated from the wireframe)
app/dashboard/[slug]/*  client CRM: today, inbox, whatsapp, orders, customers, products, marketing, ads, videos, website, settings, business, billing, support
components/CrmShell.tsx sidebar / phone menu frame, page headers, KPI tiles
lib/insights.ts         "do more of this" tips from orders
app/admin/*             ZDMINC admin: clients, support, WhatsApp, videos, billing, team
app/api/cron/billing    daily renewals and reminders
app/api/cron/nightly    abandoned carts, Quiet customers, cart reminders, owner alerts
app/api/cron/summary    8pm WhatsApp summary to each owner
lib/fygaro.ts           payment links + hook verification
lib/whatsapp.ts         Cloud API send, parse, signature
lib/order-text.ts       pricing, codes, messages (pure, tested)
lib/payments.ts         link creation, sending from a business
lib/billing.ts          plan change maths (pure, tested)
lib/zdm-billing.ts      invoices, plan changes, renewal run
lib/zdm-whatsapp.ts     ZDMINC's WhatsApp line: send, template fallback, inbound
lib/ads.ts              ad results from logged spend and ?ref order codes
lib/audience.ts         audience fields and the plain-English summary (pure, tested)
lib/social.ts           Instagram/Facebook connect (signed state, token exchange, Pages)
lib/receipt.ts          receipt data and signed links (pure, tested); lib/receipt-image.tsx draws it
lib/autoreply.ts        keyword matching, reply rotation, DM text, webhook parsing (pure, tested); lib/instagram.ts sends them
app/api/webhooks/instagram  Instagram comment webhook
lib/links.ts            domain and short-link rules (pure, tested); lib/domains.ts connects and checks domains
app/l/[code]            short link redirect
lib/meta.ts             Conversions API purchase event, consented customer export
supabase/migrations     schema, RLS, functions
```

## Instagram auto-replies: Meta setup

1. In the Meta app (the same one as WhatsApp), add the **Instagram** product and **Webhooks**. Subscribe the **Instagram** object to the `comments` field with callback `{site}/api/webhooks/instagram` and your verify token (`META_VERIFY_TOKEN`, or `WHATSAPP_VERIFY_TOKEN`).
2. Permissions requested at "Connect Instagram and Facebook": `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`, `pages_manage_metadata`, `pages_messaging`, `pages_show_list`, `pages_read_engagement`, `business_management`, `instagram_content_publish`. Until Meta approves them in App Review, only people with a role on the app (admins, developers, testers) can use it. App Review asks for a screencast of the flow and a privacy policy URL.
3. Clients who connected before this release should tap **Reconnect** in Settings so the new permissions and the Page webhook subscription are added.
4. In the client's Instagram app: Settings, Messages and story replies, Message controls, **Allow access to messages** must be on for DMs to send.
