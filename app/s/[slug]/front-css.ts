/** Shop front upgrade (section 11b): cover header, chips, specials, badges, product sheet, checkout sheet, themes. */
export const FRONT_CSS = `
.s-announce { background: var(--fg); color: var(--bg); text-align: center; font-size: 14px; font-weight: 700; padding: 9px 16px; }

/* Cover header with round logo */
.s-front { background: var(--bg); }
.s-cover { height: 150px; background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000)); background-size: cover; background-position: center; }
.s-cover[data-img] { background-image: var(--hero); }
.s-fronttext { position: relative; padding-top: 0; padding-bottom: 6px; }
.s-roundlogo { width: 84px; height: 84px; border-radius: 50%; border: 4px solid var(--bg); margin-top: -42px; background: var(--accent); color: var(--on-accent, #fff); display: grid; place-items: center; font-family: var(--display); font-size: 30px; font-weight: 800; overflow: hidden; box-shadow: 0 6px 18px rgba(0,0,0,.12); }
.s-roundlogo img { width: 100%; height: 100%; object-fit: cover; background: #fff; }
.s-front h1 { font-size: clamp(30px, 6vw, 48px); line-height: 1; margin: 12px 0 4px; text-transform: uppercase; }
.s-front .s-tag { margin: 0; color: var(--muted); }
.s-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.s-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 700; background: var(--tint, #f1f2f2); color: var(--fg); }
.s-chip.open { background: #e6f7ee; color: #146c43; }
.s-chip.closed { background: #f1f2f2; color: #4a5c5b; }
.s-chip.holiday { background: #fff3e0; color: #8a4b00; }
.s-chip i { width: 8px; height: 8px; border-radius: 50%; background: currentColor; display: inline-block; }
.s-hero + .s-wrap .s-chips { margin-top: 14px; }

/* Specials strip */
.s-special { border: 2px dashed var(--special, #E0662B); border-radius: 14px; padding: 10px 14px; background: color-mix(in srgb, var(--special, #E0662B) 8%, var(--bg)); font-size: 15px; }
.s-special b { color: var(--special, #E0662B); }

/* Sticky category chips */
.s-catnav { position: sticky; top: 0; z-index: 20; background: var(--bg); padding: 10px 0; margin: -10px 0 0; }
.s-catnav div { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; }
.s-catnav a { flex: none; padding: 8px 14px; border-radius: 999px; border: 1.5px solid var(--line); color: var(--fg); text-decoration: none; font-weight: 700; font-size: 14px; background: var(--card); }
.s-catnav a.on { background: var(--accent); color: var(--on-accent, #fff); border-color: var(--accent); }
.s-group { scroll-margin-top: 64px; }

/* Cards: tappable, badge, round + */
.s-card { cursor: pointer; position: relative; }
.s-card:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.s-badgechip { position: absolute; top: 10px; left: 10px; z-index: 2; font-size: 11px; font-weight: 800; padding: 4px 9px; border-radius: 999px; color: #fff; background: var(--special, #E0662B); }
.s-badgechip.soldout { background: #6b7572; }
.s-badgechip.preorder { background: #1D5FD1; }
.s-badgechip.new { background: #146c43; }
.s-noimg { background: color-mix(in srgb, var(--accent) 12%, #fff) !important; color: color-mix(in srgb, var(--accent) 60%, #fff) !important; }

/* Product sheet */
.s-sheetwrap { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,.55); display: flex; align-items: flex-end; justify-content: center; }
.s-sheet { background: var(--bg); color: var(--fg); width: min(560px, 100%); max-height: 92vh; overflow: auto; border-radius: 22px 22px 0 0; display: flex; flex-direction: column; animation: s-up .22s ease-out; }
@keyframes s-up { from { transform: translateY(40px); opacity: .5; } to { transform: none; opacity: 1; } }
@media (min-width: 721px) { .s-sheetwrap { align-items: center; } .s-sheet { border-radius: 22px; } }
.s-carousel { position: relative; display: flex; overflow-x: auto; scroll-snap-type: x mandatory; background: var(--tint, #f3f4f1); aspect-ratio: 4 / 3; flex: none; scrollbar-width: none; }
.s-carousel > * { flex: none; width: 100%; height: 100%; scroll-snap-align: center; object-fit: cover; }
.s-dotsrow { display: flex; justify-content: center; gap: 5px; padding: 8px 0 0; }
.s-dotsrow i { width: 6px; height: 6px; border-radius: 3px; background: var(--line); }
.s-dotsrow i.on { width: 16px; background: var(--accent); }
.s-sheetbody { padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 12px; }
.s-sheethead { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.s-sheethead h3 { margin: 0; font-size: 28px; text-transform: uppercase; }
.s-small { font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.s-ready { font-size: 14px; }
.s-pair { display: flex; align-items: center; gap: 10px; border: 1.5px solid var(--line); border-radius: 12px; padding: 8px 10px; }
.s-pair img, .s-pair .s-pairimg { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; background: var(--tint, #f3f4f1); flex: none; }
.s-pair span { flex: 1; }
.s-pair button { width: 36px; height: 36px; border-radius: 50%; border: 0; background: var(--accent); color: var(--on-accent, #fff); font-size: 20px; font-weight: 700; cursor: pointer; }
.s-close2 { position: absolute; top: 10px; right: 10px; z-index: 3; width: 40px; height: 40px; border-radius: 50%; border: 0; background: rgba(255,255,255,.92); font-size: 18px; cursor: pointer; }

/* Sticky order bar and green WhatsApp button */
.s-wa { background: #1E8E4B !important; border-color: #1E8E4B !important; color: #fff !important; }
.s-wa svg { flex: none; }
.s-cart.s-light { background: var(--card); color: var(--fg); border-top: 1.5px solid var(--line); }
.s-cart.s-light .s-cartbar small { display: block; color: var(--muted); font-size: 12px; }

/* Checkout sheet */
.s-co { display: flex; flex-direction: column; gap: 14px; }
.s-co h3 { margin: 0; font-size: 30px; text-transform: uppercase; }
.s-co .s-lines li { grid-template-columns: 1fr auto 90px; }
.s-co .s-qty button { background: var(--card); color: var(--fg); border-color: var(--line); }
.s-co .s-lines .s-total { border-top: 1.5px solid var(--line); font-size: 18px; }
.s-toggle { display: grid; grid-template-columns: 1fr 1fr; background: var(--tint, #f1f2f2); border-radius: 12px; padding: 4px; gap: 4px; }
.s-toggle button { min-height: 44px; border: 0; border-radius: 9px; background: transparent; font-weight: 700; color: var(--muted); cursor: pointer; font-size: 15px; }
.s-toggle button[aria-pressed="true"] { background: var(--card); color: var(--fg); box-shadow: 0 1px 4px rgba(0,0,0,.08); }
.s-slots { display: flex; flex-wrap: wrap; gap: 6px; }
.s-slots button { min-height: 40px; padding: 6px 12px; border-radius: 999px; border: 1.5px solid var(--line); background: var(--card); color: var(--fg); font-weight: 600; font-size: 14px; cursor: pointer; }
.s-slots button[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--card)); font-weight: 800; }
.s-co input, .s-co select, .s-co textarea { font-size: 16px; min-height: 46px; padding: 10px 12px; border-radius: 10px; border: 1.5px solid var(--line); background: var(--card); color: var(--fg); width: 100%; }
.s-co label { display: flex; flex-direction: column; gap: 6px; font-weight: 600; font-size: 14px; }
.s-how { list-style: none; margin: 0; padding: 12px 14px; border-radius: 12px; background: var(--tint, #f3f6f5); display: flex; flex-direction: column; gap: 6px; font-size: 14px; counter-reset: how; }
.s-how li { counter-increment: how; display: flex; gap: 8px; }
.s-how li::before { content: counter(how); flex: none; width: 20px; height: 20px; border-radius: 50%; background: var(--accent); color: var(--on-accent, #fff); font-size: 12px; font-weight: 800; display: grid; place-items: center; }

/* Phones: two columns of products */
@media (max-width: 720px) {
  .t-classic .s-grid, .th-any .s-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
  .t-classic .s-cardbody, .th-any .s-cardbody { padding: 10px 10px 12px; gap: 6px; }
  .t-classic .s-cardbody h3, .th-any .s-cardbody h3 { font-size: 17px; }
  .t-classic .s-cardbody p, .th-any .s-cardbody p { display: none; }
  .t-classic .s-cardimg, .th-any .s-cardimg { aspect-ratio: 1; }
  .t-classic .s-buy .s-opts, .th-any .s-buy .s-opts { display: none; }
  .t-classic .s-add, .th-any .s-add { min-height: 36px; padding: 6px 12px; }
}

/* Themes: built from the brand colour (variables set inline) */
.th-any { --line: color-mix(in srgb, var(--fg) 14%, transparent); --muted: color-mix(in srgb, var(--fg) 62%, transparent); }
.th-any .s-card, .th-any .s-sheet, .th-any .s-co { border-radius: var(--radius, 16px); }
.th-any .s-card { border-radius: var(--radius, 16px); background: var(--card); }
.th-bold h1, .th-bold h2, .th-bold h3 { text-transform: uppercase; letter-spacing: .01em; }
.th-bold .s-cover { height: 170px; }
.th-minimal .s-cover { height: 110px; }
.th-minimal .s-card { border-color: transparent; box-shadow: 0 1px 0 var(--line); }
.th-warm .s-cat, .th-fresh .s-cat { text-transform: none; }
`;
