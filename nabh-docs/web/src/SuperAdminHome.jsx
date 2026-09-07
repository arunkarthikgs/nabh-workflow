import { useEffect, useMemo, useState } from "react";
import { Building2, Clock3, Users } from "lucide-react";

export default function SuperAdminHome({ onOpenHospitals, onOpenUsers }) {
  const [hospitals, setHospitals] = useState([]);

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

  return <main className="admin-main"><header><div className="brand"><Building2 size={46} /><div><p className="eyebrow">Platform administration</p><h1>NABH Readiness System</h1></div></div><p className="intro">Hospital onboarding, access, and document workspace administration.</p></header><section className="superadmin-home-grid"><button className="superadmin-home-card pending" type="button" onClick={() => onOpenHospitals("pending")}><Clock3 size={20} /><strong>{summary.pending}</strong><span>Pending onboarding</span><small>Review and approve hospital registrations</small></button><button className="superadmin-home-card active" type="button" onClick={() => onOpenHospitals("active")}><Building2 size={20} /><strong>{summary.active}</strong><span>Active hospitals</span><small>View hospital profiles and readiness workspaces</small></button><button className="superadmin-home-card" type="button" onClick={() => onOpenHospitals("all")}><Building2 size={20} /><strong>{summary.total}</strong><span>Total hospitals</span><small>Open the Hospital Registry</small></button><button className="superadmin-home-card" type="button" onClick={onOpenUsers}><Users size={20} /><strong>{summary.users}</strong><span>Application users</span><small>Search users and manage password resets</small></button></section></main>;
}