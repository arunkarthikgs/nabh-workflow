import { useState } from "react";
import { ArrowRight, FileText, ShieldCheck } from "lucide-react";
import hospitalLogo from "./assets/logo.png";

const accounts = { superadmin: ["Admin@123", "Super Admin"] };
const exampleAccounts = [
  ["Super Admin", "superadmin", "Admin@123"],
  ["Aarogyam Hospital", "jph-admin", "Hospital@123"],
  ["Asha Oncology Hospital", "sch-admin", "Hospital@123"],
  ["Dhanvantari Health Clinic", "nhm-admin", "Hospital@123"],
  ["Kaveri Cardiac Institute", "mmh-admin", "Hospital@123"]
];

export default function LoginGate({ onLogin }) {
  const [userId, setUserId] = useState("superadmin");
  const [password, setPassword] = useState("Admin@123");
  const [error, setError] = useState("");
  async function submit(event) { event.preventDefault(); const normalized = userId.trim().toLowerCase(); const account = accounts[normalized]; if (account && account[0] === password) { onLogin({ role: account[1] }); return; } if (!normalized.endsWith("-admin") || password !== "Hospital@123") { setError("Invalid test credentials."); return; } const { hospitals } = await (await fetch("/api/admin/hospitals")).json(); const hospital = hospitals.find((item) => item.code.toLowerCase() === normalized.slice(0, -6)); if (!hospital) { setError("Hospital administrator account not found."); return; } const role = hospital.roles?.find((item) => item.name === "Hospital Administrator"); onLogin({ role: "Hospital Administrator", permissions: role?.permissions || ["view"], hospitalId: hospital.id, hospitalName: hospital.name, hospitalLogoPath: hospital.logoPath }); }
  return <main className="login-main"><section className="login-intro"><div className="login-mark"><ShieldCheck size={20} /></div><p className="eyebrow">NABH compliance workspace</p><h1>Documents that stay ready for review.</h1><p>Manage hospital records, ownership, and accreditation evidence in one focused workspace.</p><div className="login-note"><FileText size={16} /><span>Master list of documents</span></div></section><form className="login-panel" onSubmit={submit}><img src={hospitalLogo} alt="NABH Docs" className="login-logo" /><p className="eyebrow">Secure workspace</p><h2>Sign in</h2><label>User ID<input value={userId} onChange={(event) => setUserId(event.target.value)} autoComplete="username" /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>{error && <p className="status error">{error}</p>}<button className="login-submit">Continue <ArrowRight size={16} /></button><div className="example-logins"><p>Example accounts</p>{exampleAccounts.map(([label, id, secret]) => <button type="button" key={id} onClick={() => { setUserId(id); setPassword(secret); setError(""); }}><span>{label}</span><code>{id}</code></button>)}</div><p className="login-hint">Hospital administrator passwords use <code>Hospital@123</code>.</p></form></main>;
}