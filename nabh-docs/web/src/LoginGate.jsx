import { useState } from "react";
import { ArrowRight, FileText, ShieldCheck } from "lucide-react";
import hospitalLogo from "./assets/nabh-readiness-system.png";

const accounts = { superadmin: ["Admin@123", "Super Admin"] };
const exampleAccounts = [
  ["Super Admin", "superadmin", "", "Admin@123"],
  ["Aarogyam Hospital", "10000000", "dr.ananya.rao.jph@example.test", "Hospital@123"],
  ["Asha Oncology Hospital", "10000011", "dr.ananya.rao.sch@example.test", "Hospital@123"],
  ["Dhanvantari Health Clinic", "10000021", "dr.ananya.rao.nhm@example.test", "Hospital@123"],
  ["Kaveri Cardiac Institute", "10000031", "dr.ananya.rao.mmh@example.test", "Hospital@123"],
  ["Lotus Eye Care", "10000042", "dr.ananya.rao.clh@example.test", "Hospital@123"],
  ["Maitri Mental Health", "10000052", "dr.ananya.rao.kvh@example.test", "Hospital@123"],
  ["Prana Mother Child Care", "10000062", "dr.ananya.rao.trh@example.test", "Hospital@123"]
];

export default function LoginGate({ onLogin, onShowRegister }) {
  const [userId, setUserId] = useState("superadmin");
  const [password, setPassword] = useState("Admin@123");
  const [error, setError] = useState("");
  async function submit(event) { event.preventDefault(); const response = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: userId.trim(), email: userId.trim(), password }) }); const data = await response.json(); if (!response.ok) { setError(data.error || "Invalid credentials."); return; } onLogin(data.session); }
  return <main className="login-main"><section className="login-intro"><div className="login-mark"><ShieldCheck size={20} /></div><p className="eyebrow">NABH compliance workspace</p><h1>Documents that stay ready for review.</h1><p>Manage hospital records, ownership, and accreditation evidence in one focused workspace.</p><div className="login-note"><FileText size={16} /><span>Master list of documents</span></div></section><form className="login-panel" onSubmit={submit}><img src={hospitalLogo} alt="NABH Docs" className="login-logo" /><p className="eyebrow">Secure workspace</p><h2>Sign in</h2><label>User ID or email<input value={userId} onChange={(event) => setUserId(event.target.value)} autoComplete="username" /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>{error && <p className="status error">{error}</p>}<button className="login-submit">Continue <ArrowRight size={16} /></button>{onShowRegister && <button type="button" className="login-submit" style={{ background: "transparent", color: "#3547d1" }} onClick={onShowRegister}>New hospital? Register here</button>}<div className="example-logins"><p>Example accounts</p>{exampleAccounts.map(([label, id, email, secret]) => <button type="button" key={id} onClick={() => { setUserId(id); setPassword(secret); setError(""); }}><span>{label}</span><code>{id}{email && ` · ${email}`}</code></button>)}</div><p className="login-hint">Hospital administrator passwords use <code>Hospital@123</code>.</p></form></main>;
}