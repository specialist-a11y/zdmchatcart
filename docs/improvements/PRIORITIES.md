# Build order

Done so far: foundations, quick wins, section 2 and the shop front (migrations 0014 to 0016). The nightly job runs inside the billing cron and the owner summary inside the posts cron (Vercel Hobby allows 2 crons).

Work top to bottom. Each line links to its section file, which has the why, the wireframe and the files to start from.

## 0. Foundations other items depend on

1. ✅ **Nightly stage job** (cron, like `app/api/cron/billing`): unpaid orders older than 48 hours become `abandoned`; Paid customers with no order or message in 45 days, and Repeat customers after 60 days, become `quiet`. Unblocks Today counts, cart reminders, Customers > Quiet and win-back. See `docs/improvements/journeys.md`.
2. ✅ **Message templates** (WhatsApp, Meta approval status per business): needed for reminders, win-back and broadcasts outside the 24-hour window.
3. ✅ **STOP handling** in `app/api/webhooks/whatsapp/route.ts`: STOP, UNSUBSCRIBE and similar switch off `marketing_opt_in`/`whatsapp_opt_in` and reply once to confirm.

## 1. Quick wins: Must, small effort (18)

- [x] **01 Today**: Action buttons on every Needs you item ([section](sections/01-today.md))
- [x] **02 Inbox**: Saved quick replies ([section](sections/02-inbox.md))
- [x] **04 Orders**: Ready message to the customer ([section](sections/04-orders.md))
- [x] **05 Customers**: Quiet stage set automatically ([section](sections/05-customers.md))
- [x] **05 Customers**: Opt-in and STOP shown per customer ([section](sections/05-customers.md))
- [x] **06 Products**: Photo upload from the phone ([section](sections/06-products.md))
- [x] **06 Products**: Categories and featured order ([section](sections/06-products.md))
- [x] **08 IG auto-replies**: Edit a rule ([section](sections/08-autoreplies.md))
- [x] **08 IG auto-replies**: Alerts when Instagram disconnects ([section](sections/08-autoreplies.md))
- [x] **09 Ads**: Low wallet alert on WhatsApp ([section](sections/09-ads.md))
- [x] **10 Content (videos)**: Full-screen preview and download ([section](sections/10-videos.md))
- [x] **11 Website**: Shop score with one-minute to-dos ([section](sections/11-website.md))
- [x] **11 Website**: “Make a link for today’s post” with QR card ([section](sections/11-website.md))
- [x] **12 Settings**: Expiry warnings ([section](sections/12-settings.md))
- [x] **13 Business info**: Logo upload ([section](sections/13-business.md))
- [x] **14 Plan and billing**: Usage meters for everything in the plan ([section](sections/14-billing.md))
- [x] **15 Help and support**: Attach screenshots or a short video ([section](sections/15-support.md))
- [x] **15 Help and support**: Expected reply time and live status ([section](sections/15-support.md))

## 2. Bigger must-haves (20)

- [x] **01 Today**: 8pm WhatsApp summary to the owner (Medium) ([section](sections/01-today.md))
- [x] **02 Inbox**: Instagram DMs in the same inbox (Large) ([section](sections/02-inbox.md))
- [x] **02 Inbox**: Create order or send link from the chat (Medium) ([section](sections/02-inbox.md))
- [x] **03 WhatsApp**: Automation rules: away, hours, FAQ keywords (Medium) ([section](sections/03-whatsapp.md))
- [x] **03 WhatsApp**: Template manager with Meta approval status (Medium) ([section](sections/03-whatsapp.md))
- [x] **04 Orders**: Bulk actions and packing slips (Medium) ([section](sections/04-orders.md))
- [x] **04 Orders**: Abandoned after 48 hours plus reminders (Medium) ([section](sections/04-orders.md))
- [x] **05 Customers**: Customer profile with timeline, notes and tags (Medium) ([section](sections/05-customers.md))
- [x] **06 Products**: Options and sizes with their own price (Medium) ([section](sections/06-products.md))
- [x] **07 Marketing**: Month calendar of posts (Medium) ([section](sections/07-marketing.md))
- [x] **07 Marketing**: Image post allowance and approvals (Medium) ([section](sections/07-marketing.md))
- [x] **08 IG auto-replies**: DM replies in the Inbox (Large) ([section](sections/08-autoreplies.md))
- [x] **09 Ads**: Real ad preview before approving (Medium) ([section](sections/09-ads.md))
- [x] **10 Content (videos)**: Comments and change requests per clip (Medium) ([section](sections/10-videos.md))
- [x] **10 Content (videos)**: Image posts beside videos (Medium) ([section](sections/10-videos.md))
- [x] **11 Website**: Results strip and funnel (Medium) ([section](sections/11-website.md))
- [x] **12 Settings**: Health checklist instead of raw keys (Medium) ([section](sections/12-settings.md))
- [x] **12 Settings**: Team members and roles (Medium) ([section](sections/12-settings.md))
- [x] **13 Business info**: Hours by day, used by the bot (Medium) ([section](sections/13-business.md))
- [x] **14 Plan and billing**: Pay invoices online and download PDFs (Medium) ([section](sections/14-billing.md))

## Shop front (customer-facing): do alongside Website

- [x] **11b Shop front**: Cover photo, logo and “open now” status (Must, Small) ([section](sections/11b-shop-front.md))
- [x] **11b Shop front**: Category chips and a 2-column grid (Must, Small) ([section](sections/11b-shop-front.md))
- [x] **11b Shop front**: Product sheet: photos, sizes, ready days, “pairs well with” (Must, Medium) ([section](sections/11b-shop-front.md))
- [x] **11b Shop front**: Pickup or delivery, with day and time slot and the fee (Must, Medium) ([section](sections/11b-shop-front.md))
- [x] **11b Shop front**: “How ordering works” trust row (Must, Small) ([section](sections/11b-shop-front.md))
- [x] **11b Shop front**: Product badges: Bestseller, Sold out, Pre-order day (Should, Small)
- [x] **11b Shop front**: Specials strip and announcement bar (Should, Small)
- [x] **11b Shop front**: WhatsApp-green order button, sticky, cart remembered (Should, Small)
- [x] **11b Shop front**: Four themes from the brand colour (Should, Medium)
- [x] **11b Shop front**: Real photos, fast loading and a share preview (Should, Medium)

## 3. Should-haves (37)

- [ ] **01 Today**: Date range and compare switch
- [ ] **01 Today**: Quiet and abandoned counts
- [ ] **01 Today**: “Why?” and “Done” on each tip
- [ ] **02 Inbox**: Assign to a teammate and mark done
- [ ] **02 Inbox**: Search and unread filters
- [ ] **02 Inbox**: Window countdown and template fallback
- [ ] **03 WhatsApp**: Broadcast to a customer stage
- [ ] **03 WhatsApp**: Number quality and limits
- [ ] **04 Orders**: Pickup and delivery schedule by day
- [ ] **04 Orders**: Manual orders and search
- [ ] **04 Orders**: Cancel and refund with a reason
- [x] **05 Customers**: Segments: VIP, birthdays, tags
- [ ] **05 Customers**: Search, export and message this group
- [ ] **06 Products**: Sold-out toggle and low-stock alert
- [ ] **06 Products**: Availability days and pre-order lead time
- [ ] **07 Marketing**: Results per post, not just per link
- [x] **07 Marketing**: Request a post
- [ ] **08 IG auto-replies**: Test a comment and preview
- [ ] **08 IG auto-replies**: Story reply keywords
- [x] **09 Ads**: Plain-language audience summary
- [ ] **09 Ads**: Spend pacing chart
- [ ] **09 Ads**: Pause a campaign
- [ ] **10 Content (videos)**: Pick the posting day
- [ ] **10 Content (videos)**: Next shoot: date and shot list
- [x] **11 Website**: Live preview with “people looking now”
- [x] **11 Website**: Specials strip, announcement bar and theme switch
- [ ] **12 Settings**: Test buttons
- [x] **12 Settings**: Notification preferences
- [x] **13 Business info**: Delivery zones and fees
- [ ] **13 Business info**: VAT number and rate per business
- [x] **13 Business info**: Holiday closures
- [ ] **14 Plan and billing**: Prorated preview before a plan change
- [ ] **14 Plan and billing**: Compare plans side by side
- [ ] **14 Plan and billing**: Setup fee shown on the first invoice
- [x] **15 Help and support**: Help articles with search
- [ ] **15 Help and support**: WhatsApp and booking shortcuts
- [ ] **15 Help and support**: Use the wide screen better
