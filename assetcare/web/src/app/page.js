"use client";

import { useEffect, useMemo, useState } from "react";

const demoAssets = [
  { id: "MAC-ICU-001", name: "Multiparameter Monitor", category: "Medical Equipment", department: "ICU", status: "Operational", value: 425000, risk: "Low" },
  { id: "MAC-OT-014", name: "Electrosurgical Unit", category: "Medical Equipment", department: "Operation Theatre", status: "Awaiting Repair", value: 210000, risk: "Critical" },
  { id: "MAC-ADM-003", name: "Desktop Computer", category: "IT Hardware", department: "Finance", status: "Operational", value: 65000, risk: "Watch" },
  { id: "MAC-BME-008", name: "Infusion Pump", category: "Medical Equipment", department: "Biomedical Engineering", status: "Under Maintenance", value: 98000, risk: "High" }
];

const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

export default function Home() {
  const [assets, setAssets] = useState(demoAssets);
  const [source, setSource] = useState("demo");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetch("/api/assets").then((response) => response.json()).then((data) => {
      setAssets(data.assets || demoAssets);
      setSource(data.source || "demo");
    }).catch(() => setSource("offline"));
  }, []);

  const visibleAssets = useMemo(() => assets.filter((asset) => `${asset.id} ${asset.name} ${asset.department}`.toLowerCase().includes(query.toLowerCase())), [assets, query]);
  const totalValue = assets.reduce((sum, asset) => sum + Number(asset.value || 0), 0);
  const attention = assets.filter((asset) => ["Critical", "High"].includes(asset.risk)).length;

  return (
    <main className="dashboard">
      <aside className="sidebar">
        <div className="logo"><b>A</b> assetcare<span>.</span></div>
        <small className="label">HOSPITAL WORKSPACE</small>
        <div className="hospital"><b>SH</b><span><strong>St. Helier Hospital</strong><small>North campus</small></span></div>
        <nav>{["Overview", "Asset register", "Audits", "Maintenance", "Reports"].map((item, index) => <button className={index === 0 ? "nav active" : "nav"} key={item}><i>{["▦", "◫", "◌", "◒", "↗"][index]}</i>{item}</button>)}</nav>
        <div className="side-foot"><button className="nav">? Help centre</button><div className="user"><b>AK</b><span><strong>Arun Karthik</strong><small>Administrator</small></span></div></div>
      </aside>
      <section className="main">
        <header><span>Workspace / Overview</span><div className="header-actions"><em className={source === "postgres" ? "connected" : ""}>● {source === "postgres" ? "Postgres connected" : "Demo data"}</em><button aria-label="Notifications">♧</button><b>AK</b></div></header>
        <div className="heading"><div><small className="label">MONDAY, 19 SEPTEMBER 2026</small><h1>Good morning, Arun.</h1><p>Here is the health of your asset estate at a glance.</p></div><button className="primary" onClick={() => setShowForm(true)}>+ Add asset</button></div>
        <div className="metrics"><article><small>Total assets</small><strong>{assets.length}</strong><span>↗ 8.4% vs last quarter</span></article><article><small>Portfolio value</small><strong>{money(totalValue)}</strong><span>↗ 2.1% vs last quarter</span></article><article className="alert"><small>Needs attention</small><strong>{attention}</strong><span>{attention} high priority items</span></article><article><small>Operational</small><strong>{assets.length ? Math.round((assets.filter((asset) => asset.status === "Operational").length / assets.length) * 100) : 0}%</strong><span>↗ 4.6% reliability score</span></article></div>
        <section className="panel"><div className="panel-head"><div><small className="label">LIVE REGISTER</small><h2>Asset register</h2></div><button className="link">View all assets →</button></div><div className="tools"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assets or departments..." /><button>≡ Filter</button></div><div className="table-wrap"><table><thead><tr><th>Asset</th><th>Department</th><th>Status</th><th>Value</th><th>Risk</th></tr></thead><tbody>{visibleAssets.map((asset) => <tr key={asset.id}><td><strong>{asset.name}</strong><small>{asset.id} · {asset.category}</small></td><td>{asset.department}</td><td><mark className={asset.status.toLowerCase().replaceAll(" ", "-")}>{asset.status}</mark></td><td>{money(asset.value)}</td><td><mark className={`risk-${asset.risk.toLowerCase()}`}>{asset.risk}</mark></td></tr>)}</tbody></table></div></section>
        <footer>● Last synced 2 minutes ago <span>AssetCare v1.0 · <a href="/api/health">System health</a></span></footer>
      </section>
      {showForm && <div className="modal"><form onSubmit={(event) => { event.preventDefault(); setShowForm(false); }}><button type="button" className="close" onClick={() => setShowForm(false)}>×</button><small className="label">NEW RECORD</small><h2>Add asset</h2>{["Asset ID", "Asset name", "Department", "Location", "Custodian"].map((label) => <label key={label}>{label}<input required placeholder={label} /></label>)}<div className="form-actions"><button type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary">Save asset</button></div></form></div>}
    </main>
  );
}
