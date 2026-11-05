# Customer stages (journey maps)

Stages live in `customers.stage` (enum `customer_stage`: new, ordered, paid, repeat, quiet).

| Stage | Enters when | Moves on when | Set by today |
|---|---|---|---|
| New | First WhatsApp message or first order started (`lib/customers.ts`) | Places an order | Built |
| Ordered | Order created (`app/api/orders/route.ts`, WhatsApp webhook) | Pays | Built |
| Paid | First payment (`mark_order_paid` in `0001_init.sql`) | Second paid order, or 45 days quiet | Paid→Repeat built; →Quiet missing |
| Repeat | Second paid order (`mark_order_paid`) | Each order keeps them; 60 days quiet | →Quiet missing |
| Quiet | **Nothing sets this yet** | Next paid order returns them to Repeat (built) | Missing |

Gaps found in the maps (also in PRIORITIES.md):
- Unpaid orders are never marked `abandoned`; cart reminders don't send.
- No "order ready" WhatsApp message when status changes to `ready` (`orders/[code]/page.tsx` setStatus).
- No thank-you / review ask after `fulfilled`.
- Quiet is never set; no win-back template; STOP isn't handled.
- No one-tap reorder, broadcasts, VIP segments or referral links.

Images: `images/Journey-*.png`.
