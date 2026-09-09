import { useEffect, useState } from "react";
import { Building2, Clock3, Users } from "lucide-react";
import hospitalLogo from "./assets/nabh-readiness-system.png";

export default function SuperAdminHome({ onOpenHospitals, onOpenUsers }) {
  const [summary, setSummary] = useState({ total: 0, pending: 0, active: 0, accreditationSelected: 0, accreditationNotSelected: 0, users: 0 });

  useEffect(() => {
    fetch("/api/admin/hospitals?view=summary")
      .then((response) => response.json())
      .then((result) => setSummary(result))
      .catch(() => setSummary({ total: 0, pending: 0, active: 0, accreditationSelected: 0, accreditationNotSelected: 0, users: 0 }));
  }, []);

  return <main className="admin-main"><header><div className="brand application-brand"><img src={hospitalLogo} alt="NABH Readiness System" /><div><p className="eyebrow">Platform administration</p><h1>NABH Readiness System</h1></div></div><p className="intro">Hospital onboarding, access, and document workspace administration.</p></header><section className="superadmin-home-grid"><button className="superadmin-home-card pending" type="button" title="Open pending hospital onboarding" onClick={() => onOpenHospitals("pending")}><Clock3 size={20} /><strong>{summary.pending}</strong><span>Pending onboarding</span><small>Review and approve hospital registrations</small></button><button className="superadmin-home-card active" type="button" title="Open active hospitals" onClick={() => onOpenHospitals("active")}><Building2 size={20} /><strong>{summary.active}</strong><span>Active hospitals</span><small>View hospital profiles and readiness workspaces</small></button><button className="superadmin-home-card accreditation" type="button" title="View hospitals with selected accreditation" onClick={() => onOpenHospitals("all")}><Building2 size={20} /><strong>{summary.accreditationSelected}</strong><span>Accreditation confirmed</span><small>Hospitals with an NABH programme selected</small></button><button className="superadmin-home-card accreditation-missing" type="button" title="View hospitals without selected accreditation" onClick={() => onOpenHospitals("all")}><Building2 size={20} /><strong>{summary.accreditationNotSelected}</strong><span>Accreditation not confirmed</span><small>Hospitals still waiting to select an NABH programme</small></button><button className="superadmin-home-card" type="button" title="Open all hospitals" onClick={() => onOpenHospitals("all")}><Building2 size={20} /><strong>{summary.total}</strong><span>Total hospitals</span><small>Open the Hospital Registry</small></button><button className="superadmin-home-card" type="button" title="Open user management" onClick={onOpenUsers}><Users size={20} /><strong>{summary.users}</strong><span>Application users</span><small>Search users and manage password resets</small></button></section></main>;
}