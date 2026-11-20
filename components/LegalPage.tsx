/** Plain public page for policies (privacy, data deletion). Brand fonts and colours, readable at 390px. */
export const supportWhatsApp = () => {
  const n = (process.env.NEXT_PUBLIC_ZDM_SUPPORT_WHATSAPP ?? "").replace(/\D/g, "");
  return n ? `https://wa.me/${n}` : null;
};

const CSS = `
.legal{max-width:760px;margin:0 auto;padding:32px 18px 64px;font-family:'DM Sans',system-ui,sans-serif;color:#0B0F0E;line-height:1.6;font-size:16px}
.legal a{color:#1D5FD1}
.legal h1,.legal h2{font-family:'Barlow Condensed',system-ui,sans-serif;text-transform:uppercase;letter-spacing:.01em;line-height:1.1}
.legal h1{font-size:40px;margin:8px 0 4px}
.legal h2{font-size:24px;margin:32px 0 8px}
.legal h3{font-size:18px;margin:20px 0 4px}
.legal .muted{color:#5b6461;font-size:14px}
.legal .brand{font-family:'Barlow Condensed',system-ui,sans-serif;font-weight:800;font-size:20px;text-decoration:none;color:#0B0F0E}
.legal .brand span{color:#3D8BFF}
.legal ul,.legal ol{padding-left:22px}
.legal li{margin:4px 0}
`;

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="legal">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <a className="brand" href="/">ZDM <span>ChatCart</span></a>
      <h1>{title}</h1>
      <p className="muted">Last updated {updated}</p>
      {children}
      <p className="muted" style={{ marginTop: 40 }}>
        <a href="/terms">Terms of service</a> · <a href="/privacy">Privacy policy</a> · <a href="/data-deletion">Delete your data</a>
      </p>
    </main>
  );
}
