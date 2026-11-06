# 11 / Website

**Purpose:** Show owners their shop is working for them, and give them one easy thing to do each visit.  
**Used by:** Owner, ZDMINC  
**Status in the app today:** Working  
**Success measure:** Owners open Website weekly · links shared per week · shop score above 90%

![Blueprint board](../images/Section-11-website.png)

## Code to start from

- `app/dashboard/[slug]/website/page.tsx`
- `lib/links.ts`
- `lib/domains.ts`
- `app/l/[code]/route.ts`
- `middleware.ts`

## In the app today

- Shop link with copy
- Own domain with DNS record and Check now
- Short links with clicks, orders and sales
- Printable QR card for any link, plus a Counter QR
- Live shop preview

## How it should work

1. **Owner opens Website**: Sees this week’s visits, carts and orders first
2. **Picks a to-do**: Shop score tasks, a link for today’s post, a special
3. **Shares in one tap**: Link, WhatsApp Status, QR card
4. **Gets nudged and celebrated**: 8pm summary tips and milestone badges

## Next wireframe (what the screen should contain)

- **funnel** Visits, Carts, WhatsApp orders, Paid (improvement #1)
- **score** ✓ Logo and colours, ✓ Own domain, ○ Photos on 3 products, ○ Opening hours, ○ Specials strip (improvement #3)
- **list** Make a link for today’s post: islandcrumb.com/rumcake; [Copy] [WhatsApp Status] [QR card]; 🏆 /cake: 8 orders this month (improvement #4)
- **phone** Your shop now · 3 people looking (improvement #2)
- **strip** Specials strip: “This Saturday only: rum cake” · ends Sun 6pm   ·   Announcement: off   ·   Theme: Warm bakery ▾ (improvement #5)

## What's missing (build these)

| # | Improvement | Why it matters | Priority | Effort |
|---|---|---|---|---|
| 1 | Results strip and funnel | Answers “is my shop working?” the moment they open it. | Must | Medium (1 to 3 days) |
| 2 | Live preview with “people looking now” | Makes the shop feel alive and worth sharing. | Should | Medium (1 to 3 days) |
| 3 | Shop score with one-minute to-dos | Gets owners to add the details that sell: photos, hours, about. | Must | Small (under a day) |
| 4 | “Make a link for today’s post” (QR cards now built) | Turns sharing into one tap, and every share is tracked. | Must | Small (under a day) |
| 5 | Specials strip, announcement bar and theme switch | Owners change what customers see without asking ZDMINC. | Should | Medium (1 to 3 days) |
| 6 | Nudges and milestone badges | Brings owners back: “Best Saturday yet. Share your link again?” | Could | Medium (1 to 3 days) |

## Done means

- Works on a 390px phone with no sideways scroll; buttons at least 44px tall; inputs 16px.
- Uses the existing CRM shell (`components/CrmShell.tsx`, `PageHeader`) and styles in `app/globals.css`.
- Any new table has RLS (`private.is_member(business_id) or private.is_staff()`), writes go through server actions with an owner/admin check.
- Pure logic lives in `lib/` with a `node:test` test in `tests/`; `npm test` and `npx tsc --noEmit` pass.
