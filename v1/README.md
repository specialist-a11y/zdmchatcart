# ChatCart

Browse online. Order on WhatsApp. Get paid with Fygaro.
One app, many businesses: each business gets its own shop page, WhatsApp ordering, Fygaro payment links and a small CRM.

## What works in this first build

| Area | What it does |
|---|---|
| Accounts | Email magic-link sign-in. A user can own or join several businesses. |
| Businesses | Each business is walled off by Supabase row-level security. Strangers and other businesses see nothing. |
| Shop page | `/s/<slug>`: catalog, cart saved in the browser, optional "save my cart" WhatsApp opt-in, `Order on WhatsApp`. Add `?ref=<post-code>` to track which post or ad sent the buyer. |
| Orders | Prices always come from the database. Each order gets a code like `ZB-1042` and opens WhatsApp with that code prefilled. |
| WhatsApp bot | When a customer sends the code, the bot links them to the order, replies with the summary and a Fygaro link, and records PICKUP or DELIVERY. First-time chatters get the shop link. |
| Fygaro | A signed payment link per order (exact total, order id as reference). The Fygaro Hook marks the order paid, lowers stock, updates the customer's CRM record and sends a WhatsApp receipt. Retries are ignored. |
| Dashboard | Orders (filters, 24-hour paid total), order detail (create/send payment link, open chat, change status, mark paid for cash), products, customers by stage, settings to connect Fygaro and WhatsApp. |

Not in this build yet: abandoned-cart reminders, unified inbox UI, Instagram/OpenReply, marketing autopilot, video pipeline, subscription billing.

## Setup

1. **Database** is already created: Supabase project `chatcart` (`rndqdepvmfdfoesxyurh`, us-east-1). The schema is in `supabase/migrations/0001_init.sql`.
2. **Environment**: copy `.env.example` to `.env.local` and fill in:
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase dashboard, Project Settings, API keys, the secret/service_role key. Server only, never commit it.
   - `NEXT_PUBLIC_SITE_URL`: your live URL once deployed.
   - `WHATSAPP_VERIFY_TOKEN`: any long random string, also entered in Meta.
   - `META_APP_SECRET`: Meta app, App settings, Basic, App secret.
3. **Supabase Auth**: Authentication, URL configuration: set Site URL to your live URL and add `<your-url>/auth/callback` to Redirect URLs.
4. **Run locally**: `npm install`, then `npm run dev` and open http://localhost:3000.
5. **Deploy**: push to GitHub, import into Vercel, add the same environment variables.

## Connect a business

1. Sign in, create a business (name, shop address, order prefix, WhatsApp number), add products.
2. **Fygaro** (Pro plan or above): create a Fygaro Link with an open amount, generate an API key under Settings, API Credentials, and set the Hook URL to `<your-url>/api/webhooks/fygaro`. Paste the link URL, key and secret into ChatCart Settings.
3. **WhatsApp Cloud API**: in your Meta app, set the webhook to `<your-url>/api/webhooks/whatsapp` with your verify token and subscribe to `messages`. Paste the phone number ID and a permanent access token into ChatCart Settings.

## Tests

`npm test` covers Fygaro JWT signing, Fygaro and Meta webhook signatures, order-code parsing, server-side cart pricing and message text.
Database functions and row-level security were checked against the live project.

## Structure

```
app/s/[slug]            public shop
app/api/orders          cart -> order with code
app/api/webhooks/*      Fygaro and WhatsApp
app/dashboard/[slug]/*  owner dashboard
lib/fygaro.ts           payment links + hook verification
lib/whatsapp.ts         Cloud API send, parse, signature
lib/order-text.ts       pricing, codes, messages (pure, tested)
lib/payments.ts         link creation, sending from a business
supabase/migrations     schema, RLS, functions
```
