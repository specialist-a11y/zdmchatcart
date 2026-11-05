/** Shop page styles. One base, then a short block per website template (.t-classic, .t-caterer, ...). */
export const SHOP_CSS = `
.shop { --bg: #fff; --fg: #0b0f0e; --muted: #64716c; --card: #fff; --line: #dde3e0; --display: "Barlow Condensed", "Arial Narrow", sans-serif;
  min-height: 100vh; display: flex; flex-direction: column; background: var(--bg); color: var(--fg); }
.shop h1, .shop h2, .shop h3 { font-family: var(--display); }
.s-wrap { max-width: 1120px; margin: 0 auto; padding: 0 20px; width: 100%; }
.s-main { flex: 1; padding-top: 28px; padding-bottom: 120px; display: flex; flex-direction: column; gap: 32px; }
.s-empty { color: var(--muted); }
.s-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 46px; padding: 10px 20px; border-radius: 12px; border: 2px solid var(--accent); background: var(--accent); color: #fff; font-weight: 700; text-decoration: none; cursor: pointer; font-size: 15px; }
.s-btn:hover { color: #fff; filter: brightness(1.06); }
.s-btn.ghost { background: transparent; color: inherit; border-color: currentColor; }
.s-btn.small { min-height: 36px; padding: 6px 12px; font-size: 14px; }
.s-btn:disabled { opacity: .5; cursor: not-allowed; }

/* Header: classic bar */
.s-bar { background: var(--accent); color: #fff; padding: 22px 0; }
.s-brand { display: flex; align-items: center; gap: 16px; }
.s-brand img { border-radius: 14px; object-fit: cover; background: #fff; }
.s-brand h1 { font-size: 32px; margin: 0; }
.s-brand p { margin: 4px 0 0; opacity: .92; }

/* Header: hero (all other templates) */
.s-hero { position: relative; color: #fff; background: var(--accent); background-size: cover; background-position: center; isolation: isolate; }
.s-hero[data-has-image] { background-image: linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.65)), var(--hero); }
.s-herotext { padding-top: 72px; padding-bottom: 64px; display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
.s-hero h1 { font-size: clamp(40px, 7vw, 76px); line-height: .95; margin: 0; max-width: 820px; }
.s-hero p { margin: 0; font-size: 18px; max-width: 560px; opacity: .95; }
.s-logo { border-radius: 16px; object-fit: cover; background: #fff; }
.s-herocta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
.s-hero .s-btn { background: #fff; color: var(--fg); border-color: #fff; }
.s-hero .s-btn.ghost { background: transparent; color: #fff; border-color: rgba(255,255,255,.8); }

/* Categories */
.s-group { display: flex; flex-direction: column; gap: 16px; }
.s-cat { font-size: 28px; margin: 0; }

/* Grid layout */
.s-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 18px; }
.s-card { background: var(--card); border: 1.5px solid var(--line); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; }
.s-cardimg { aspect-ratio: 4 / 3; background: #f3f4f1; }
.s-cardimg img, .s-thumb img, .s-piece img { width: 100%; height: 100%; object-fit: cover; display: block; }
.s-noimg { width: 100%; height: 100%; display: grid; place-items: center; font-family: var(--display); font-size: 48px; color: rgba(0,0,0,.18); background: #f3f4f1; }
.s-cardbody { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
.s-cardbody h3 { font-size: 22px; margin: 0; }
.s-cardbody p, .s-rowtext p { margin: 0; color: var(--muted); line-height: 1.45; }

/* Buy controls */
.s-buy { display: flex; flex-direction: column; gap: 10px; margin-top: auto; }
.s-opts { display: flex; flex-wrap: wrap; gap: 6px; }
.s-opts button { padding: 6px 11px; border-radius: 999px; border: 1.5px solid var(--line); background: transparent; color: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.s-opts button small { opacity: .7; font-weight: 500; }
.s-opts button[aria-checked="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
.s-opts button:disabled { opacity: .4; text-decoration: line-through; cursor: not-allowed; }
.s-buyrow { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.s-price { font-size: 16px; }
.s-add { min-height: 40px; padding: 8px 18px; border-radius: 10px; border: 0; background: var(--accent); color: #fff; font-weight: 700; cursor: pointer; }
.s-add.big { min-height: 48px; padding: 10px 26px; font-size: 16px; }
.s-out { font-size: 13px; font-weight: 700; color: #8c2f1c; background: #f3e5e1; padding: 4px 10px; border-radius: 999px; }
.s-qty { display: inline-flex; align-items: center; gap: 8px; }
.s-qty button { width: 36px; height: 36px; border-radius: 10px; border: 1.5px solid var(--line); background: var(--card); color: inherit; font-size: 18px; font-weight: 700; cursor: pointer; }
.s-qty.small button { width: 30px; height: 30px; font-size: 16px; }
.s-qty span { min-width: 18px; text-align: center; font-weight: 700; }

/* Menu layout */
.s-menu { display: flex; flex-direction: column; }
.s-row { display: flex; gap: 16px; padding: 18px 0; border-bottom: 1px solid var(--line); }
.s-thumb { width: 96px; height: 96px; flex: none; border-radius: 12px; overflow: hidden; }
.s-rowtext { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.s-rowhead { display: flex; align-items: baseline; gap: 10px; }
.s-rowhead h3 { margin: 0; font-size: 22px; }
.s-dots { flex: 1; border-bottom: 2px dotted var(--line); transform: translateY(-4px); }

/* Gallery layout */
.s-gallery { columns: 3 260px; column-gap: 14px; }
.s-piece { position: relative; display: block; width: 100%; margin: 0 0 14px; padding: 0; border: 0; border-radius: 6px; overflow: hidden; cursor: zoom-in; break-inside: avoid; background: #222; }
.s-piece img { height: auto; transition: transform .5s ease; }
.s-piece:hover img { transform: scale(1.03); }
.s-piece .s-noimg { aspect-ratio: 1; background: #222; color: rgba(255,255,255,.2); }
.s-caption { position: absolute; left: 0; right: 0; bottom: 0; padding: 28px 14px 12px; display: flex; justify-content: space-between; gap: 10px; align-items: flex-end; text-align: left;
  background: linear-gradient(transparent, rgba(0,0,0,.75)); color: #fff; font-size: 14px; opacity: 0; transition: opacity .25s; }
.s-piece:hover .s-caption, .s-piece:focus-visible .s-caption { opacity: 1; }
.s-badge { position: absolute; top: 10px; right: 10px; width: 28px; height: 28px; border-radius: 50%; background: var(--accent); color: #fff; display: grid; place-items: center; font-weight: 800; }
.s-modal { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,.85); display: grid; place-items: center; padding: 20px; }
.s-modalbox { position: relative; background: var(--bg); color: var(--fg); border-radius: 14px; overflow: hidden; width: min(980px, 100%); max-height: 92vh; display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(260px, 1fr); }
.s-modalbox img { width: 100%; height: 100%; max-height: 92vh; object-fit: contain; background: #000; }
.s-modaltext { padding: 28px 24px; display: flex; flex-direction: column; gap: 14px; overflow: auto; }
.s-modaltext h3 { font-size: 30px; margin: 0; }
.s-modaltext p { margin: 0; color: var(--muted); line-height: 1.5; }
.s-close { position: absolute; top: 10px; right: 10px; z-index: 2; width: 36px; height: 36px; border-radius: 50%; border: 0; background: rgba(0,0,0,.6); color: #fff; cursor: pointer; }

/* About */
.s-about { border-top: 1.5px solid var(--line); padding-top: 28px; display: flex; flex-direction: column; gap: 18px; }
.s-desc { margin: 0; font-size: 17px; line-height: 1.55; max-width: 760px; }
.s-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; }
.s-facts p { margin: 4px 0 0; color: var(--muted); white-space: pre-line; }
.s-links { display: flex; flex-wrap: wrap; gap: 16px; }
.s-links a { color: var(--accent); font-weight: 700; }

/* Cart */
.s-cart { position: sticky; bottom: 0; z-index: 30; background: var(--fg); color: var(--bg); padding: 14px 0; box-shadow: 0 -10px 30px rgba(0,0,0,.18); }
.s-cartbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
.s-checkout { display: flex; flex-direction: column; gap: 12px; max-height: 80vh; overflow: auto; }
.s-cart .s-btn.ghost { color: var(--bg); }
.s-lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.s-lines li { display: grid; grid-template-columns: 1fr auto 110px; gap: 12px; align-items: center; }
.s-lines li b { text-align: right; }
.s-lines .s-total { border-top: 1px solid rgba(255,255,255,.25); padding-top: 8px; }
.s-cart .s-qty button { background: transparent; color: inherit; border-color: rgba(255,255,255,.4); }
.s-fields { display: flex; flex-wrap: wrap; gap: 12px; }
.s-fields label { flex: 1 1 200px; color: inherit; }
.s-check { flex-direction: row !important; align-items: center; font-weight: 400 !important; color: inherit; }
.s-err { margin: 0; color: #ffb4a3; font-weight: 600; }
.s-consent { position: fixed; left: 16px; right: 16px; z-index: 40; max-width: 560px; margin: 0 auto; background: #fff; color: #0b0f0e; border: 1.5px solid #dde3e0; border-radius: 16px; padding: 16px; box-shadow: 0 12px 30px rgba(0,0,0,.15); display: flex; flex-direction: column; gap: 10px; }

/* ===== Caterer: warm cream, serif, menu ===== */
.t-caterer { --bg: #fbf6ee; --fg: #3b2a1e; --muted: #7a6656; --card: #fffaf3; --line: #e8dccb; }
.t-caterer .s-hero h1, .t-caterer .s-cat, .t-caterer .s-rowhead h3 { text-transform: none; letter-spacing: 0; }
.t-caterer .s-cat { font-size: 34px; text-align: center; }
.t-caterer .s-cat::after { content: ""; display: block; width: 56px; height: 3px; margin: 10px auto 0; background: var(--accent); border-radius: 2px; }
.t-caterer .s-menu { max-width: 820px; width: 100%; margin: 0 auto; }
.t-caterer .s-thumb { width: 110px; height: 110px; border-radius: 50%; }

/* ===== Artist: dark gallery ===== */
.t-artist { --bg: #111; --fg: #f4f1ea; --muted: #a39f97; --card: #1b1b1b; --line: #2c2c2c; }
.t-artist .s-hero { background-color: #111; }
.t-artist .s-hero h1 { text-transform: none; letter-spacing: -.02em; font-weight: 700; }
.t-artist .s-cat { text-transform: uppercase; font-size: 15px; letter-spacing: .2em; color: var(--muted); font-weight: 600; }
.t-artist .s-hero .s-btn { background: transparent; color: #fff; border-color: #fff; }
.t-artist .s-modalbox { background: #161616; }
.t-artist .s-opts button { border-color: #444; }
.t-artist .s-cart { background: #f4f1ea; color: #111; }
.t-artist .s-lines .s-total { border-color: rgba(0,0,0,.2); }
.t-artist .s-cart .s-qty button { border-color: rgba(0,0,0,.3); }

/* ===== Beauty: blush, elegant serif, service menu ===== */
.t-beauty { --bg: #fbf3f1; --fg: #4a2f35; --muted: #8a6a70; --card: #fff; --line: #ecd9d6; }
.t-beauty .s-hero h1, .t-beauty .s-cat, .t-beauty .s-rowhead h3 { text-transform: none; letter-spacing: .01em; font-weight: 700; }
.t-beauty .s-hero { text-align: center; }
.t-beauty .s-herotext { align-items: center; }
.t-beauty .s-cat { font-size: 36px; font-style: italic; }
.t-beauty .s-group { background: #fff; border-radius: 22px; padding: 22px 26px; box-shadow: 0 10px 30px rgba(74,47,53,.06); }
.t-beauty .s-row:last-child { border-bottom: 0; }
.t-beauty .s-add, .t-beauty .s-btn { border-radius: 999px; }
.t-beauty .s-opts button { border-radius: 999px; }

/* ===== Trades: bold, high contrast ===== */
.t-trades { --bg: #f5f5f2; --fg: #111; --muted: #555; --card: #fff; --line: #d9d9d2; }
.t-trades .s-hero { background-color: #111; }
.t-trades .s-hero[data-has-image] { background-image: linear-gradient(90deg, rgba(0,0,0,.88) 0%, rgba(0,0,0,.55) 60%, rgba(0,0,0,.3)), var(--hero); }
.t-trades .s-hero h1 { font-size: clamp(44px, 8vw, 88px); }
.t-trades .s-hero .s-btn:not(.ghost) { background: var(--accent); color: #fff; border-color: var(--accent); }
.t-trades .s-trust { list-style: none; padding: 0; margin: 14px 0 0; display: flex; flex-wrap: wrap; gap: 8px 18px; font-weight: 700; font-size: 14px; }
.t-trades .s-trust li::before { content: "✓ "; color: var(--accent); }
.t-trades .s-card { border: 2px solid #111; border-radius: 6px; box-shadow: 5px 5px 0 #111; }
.t-trades .s-cardbody h3 { font-size: 26px; }
.t-trades .s-cat { font-size: 34px; border-left: 8px solid var(--accent); padding-left: 12px; }
.t-trades .s-add { border-radius: 4px; text-transform: uppercase; letter-spacing: .04em; }

@media (max-width: 720px) {
  .s-herotext { padding-top: 48px; padding-bottom: 40px; }
  .s-modalbox { grid-template-columns: 1fr; overflow: auto; }
  .s-modalbox img { max-height: 55vh; }
  .s-thumb { width: 72px; height: 72px; }
  .t-beauty .s-group { padding: 16px; }
  .s-lines li { grid-template-columns: 1fr auto; }
  .s-lines li b { grid-column: 1 / -1; text-align: left; }
}
`;
