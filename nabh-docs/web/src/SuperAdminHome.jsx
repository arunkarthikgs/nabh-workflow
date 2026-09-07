import { useEffect, useMemo, useState } from "react";
import { Building2, Clock3, MailCheck, Users } from "lucide-react";

export default function SuperAdminHome({ onOpenHospitals, onOpenUsers }) {
  const [hospitals, setHospitals] = useState([]);
  const [smtpMessage, setSmtpMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/hospitals")
      .then((response) => response.json())
      .then((result) => setHospitals(result.hospitals || []))
      .catch(() => setHospitals([]));
  }, []);

  const summary = useMemo(() => ({
    total: hospitals.length,
    pending: hospitals.filter((hospital) => hospital.status === "pending").length,
    active: hospitals.filter((hospital) => hospital.status === "active").length,
    users: hospitals.reduce((total, hospital) => total + (hospital.users || []).length, 0)
  }), [hospitals]);

  async function verifySmtp() {
    setSmtpMessage("Checking SMTP connection...");
    const response = await fetch("/api/admin/smtp/verify", { method: "POST" });
    const result = await response.json();
    setSmtpMessage(response.ok && result.verified ? "SMTP is connected and ready to deliver email." : result.error || "SMTP verification failed.");
  }

  return <main className="admin-main"><header><div className="brand"><Building2 size={46} /><div><p className="eyebrow">Platform administration</p><h1>NABH Readiness System</h1></div></div><p className="intro">Hospital onboarding, access, and document workspace administration.</p></header><section className="superadmin-home-grid"><button className="superadmin-home-card pending" type="button" onClick={() => onOpenHospitals("pending")}><Clock3 size={20} /><strong>{summary.pending}</strong><span>Pending onboarding</span><small>Review and approve hospital registrations</small></button><button className="superadmin-home-card active" type="button" onClick={() => onOpenHospitals("active")}><Building2 size={20} /><strong>{summary.active}</strong><span>Active hospitals</span><small>View hospital profiles and readiness workspaces</small></button><button className="superadmin-home-card" type="button" onClick={() => onOpenHospitals("all")}><Building2 size={20} /><strong>{summary.total}</strong><span>Total hospitals</span><small>Open the Hospital Registry</small></button><button className="superadmin-home-card" type="button" onClick={onOpenUsers}><Users size={20} /><strong>{summary.users}</strong><span>Application users</span><small>Search users and manage password resets</small></button><button className="superadmin-home-card smtp" type="button" onClick={verifySmtp}><MailCheck size={20} /><strong>SMTP</strong><span>Test email connection</span><small>{smtpMessage || "Verify server, TLS, and credentials without sending email"}</small></button></section></main>;
}