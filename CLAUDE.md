# CLAUDE.md: ZDM ChatCart

ZDM ChatCart is ZDMINC's product for Caribbean small businesses: a shop page, WhatsApp ordering with order codes, payment links (Fygaro) set up for the client, receipts, Instagram comment-to-DM, ads, monthly videos and image posts, plus a client CRM and a ZDMINC admin.

## Your task
Improve the client CRM using `docs/improvements/`. Read `docs/improvements/README.md`, then work through `docs/improvements/PRIORITIES.md` in order. For each item, read its section file and image first. Tick items off in PRIORITIES.md as you finish them. Ask before changing pricing, plan contents or anything customer-facing on the marketing site.

## Stack
- Next.js 15 App Router, server components and server actions, TypeScript.
- Supabase (Postgres + RLS). Migrations in `supabase/migrations/`, numbered; the latest is `0022_mark_paid_final.sql`, so add the next as `0023_...sql` and never edit an applied one except seed text.
- RLS pattern: read policies use `private.is_member(business_id) or private.is_staff()`; writes go through server actions using `createAdminClient()` after an owner/admin role check (`requireMembership(slug)` returns `role`).
- WhatsApp Cloud API (`lib/whatsapp.ts`), 24-hour window: free text only within 24 hours of the customer's last message, otherwise approved templates.
- Instagram Graph via the client's Page token (`lib/instagram.ts`, `lib/social.ts`).
- Crons (Vercel Hobby, 2 max): `/api/cron/billing` also runs the nightly job (`lib/nightly.ts`), `/api/cron/posts` also sends the owner summary (`lib/summary.ts`). The nightly job handles abandoned carts, the Quiet stage, cart reminders and owner alerts on WhatsApp (via `notifyClient`). Approved WhatsApp templates live in `message_templates`; use `sendTemplate(admin, businessId, to, purpose, ctx)` outside the 24-hour window.
- Server actions that write: `requireEditor(slug)` in `lib/crm-actions.ts` (owner/admin/staff check plus a writable client).
- Payments: Fygaro links and webhook (`app/api/webhooks/fygaro`), `mark_order_paid` RPC is idempotent.

## Conventions
- SEO matters: shop pages (`app/s/[slug]`, product pages at `/p/[item]`) set title, description, canonical (the shop's own domain when live), Open Graph and schema.org data via `lib/seo.ts`. Keep `app/robots.ts` and `app/sitemap.ts` (host-aware for custom domains) in step with new public pages; private pages are noindexed in `next.config.mjs`.
- CRM pages use `components/CrmShell.tsx` (`PageHeader` with `num(key)` from `lib/crm-nav.ts`, `Kpi`, `Dot`) and classes in `app/globals.css`.
- Mobile first: works at 390px wide, no sideways page scroll, 44px tap targets, 16px inputs. Tables scroll inside `.table-wrap`.
- Brand: ink #0B0F0E, electric blue #3D8BFF, text blue #1D5FD1, fonts Barlow Condensed (headings) and DM Sans.
- Writing style in the UI: plain, short, no em dashes, no jargon. Money in BBD unless the business currency differs.
- Pure logic goes in `lib/` with tests in `tests/` using `node:test`.

## Commands
- `npm install`
- `npm test` (node:test, must pass)
- `npx tsc --noEmit` (must pass)
- `npm run dev`, then `/preview` shows a sample CRM screen in development
- Env: copy `.env.example` to `.env.local`
