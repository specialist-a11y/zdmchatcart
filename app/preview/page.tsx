import { notFound } from "next/navigation";
import { CrmShell, PageHeader, Kpi, Dot } from "@/components/CrmShell";
import { CLIENT_NAV, num } from "@/lib/crm-nav";

// Dev-only layout check with sample data. Returns 404 in production.
export default function Preview() {
  if (process.env.NODE_ENV === "production") notFound();
  const base = "/preview";
  return (
    <CrmShell switcher={{ initials: "IC", name: "Island Cakes", sub: "Growth plan" }}
      nav={CLIENT_NAV.map(([k, label, icon]) => ({ href: k ? `${base}/${k}` : base, label, icon, badge: k === "inbox" ? 3 : k === "orders" ? 2 : null, exact: !k }))}
      footer={<div className="crm-conn"><span><Dot ok />WhatsApp connected</span><span><Dot ok />Payments connected</span><span><Dot ok={false} />Meta ads tracking off</span></div>}>
      <PageHeader n={num("")} title="Good morning, Island Cakes" sub="Tuesday · here's what needs you today." actions={<><a className="btn secondary small">Open my shop</a><a className="btn small">New order</a></>} />
      <div className="insight">
        <div><span className="tag">THIS WEEK</span><h2>Do more of this</h2><small>From your last 30 days</small></div>
        <div><span className="tag">SCALE</span><b>Black cake: in 3 paid orders.</b><small>Post it again Friday.</small></div>
        <div><span className="tag kill">STOP</span><b>Bread pudding: 0 orders in 30 days.</b><small>Hide it or rework it.</small></div>
        <div><span className="tag">TIMING</span><b>Saturday orders peak 8am to 10am.</b><small>Post at 7:30.</small></div>
      </div>
      <div className="kpis">
        <Kpi label="Sales today" value="BBD $640" sub="+18% vs last Tue" tone="blue" />
        <Kpi label="Orders" value={9} sub="2 to confirm" tone="amber" />
        <Kpi label="Unpaid" value={1} sub="BBD $85" tone="red" />
        <Kpi label="New customers" value={4} />
      </div>
      <div className="cols">
        <section className="card"><h2>7-day sales</h2><div className="bars">{[40, 70, 30, 90, 55, 100, 65].map((h, i) => <div key={i} className={i === 6 ? "today" : ""}><i style={{ height: `${h}%` }} />{"MTWTFSS"[i]}</div>)}</div></section>
        <section className="card"><h2>Orders</h2><div className="table-wrap"><table><thead><tr><th>Code</th><th>Customer</th><th>Status</th><th>Total</th><th>Source</th></tr></thead>
          <tbody>{["IC-1048", "IC-1047", "IC-1046"].map((c) => <tr key={c}><td><b>{c}</b></td><td>Renee Clarke</td><td><span className="badge paid">Paid</span></td><td>BBD $120.00</td><td>Instagram · A-3</td></tr>)}</tbody></table></div></section>
      </div>
      <div className="chat">
        <div className="card">Renee Clarke · Waiting for you</div>
        <div className="card" style={{ background: "#efe9df", display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="bubble in">IC-1048</div><div className="bubble out">Hi Renee! 1 Black cake, BBD $120. Pay here: pay.link/7f3a. Pickup or delivery?</div>
        </div>
      </div>
      <form className="card stack"><label>Reply<textarea rows={3} /></label><button className="btn blue">Send</button></form>
    </CrmShell>
  );
}
