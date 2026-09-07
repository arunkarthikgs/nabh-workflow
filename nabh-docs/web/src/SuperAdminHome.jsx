import { useEffect, useMemo, useState } from "react";
import { Building2, Users } from "lucide-react";

export default function SuperAdminHome({ onOpenHospitals, onOpenUsers }) {
  const [hospitals, setHospitals] = useState([]);

  useEffect(() => {
    fetch("/api/admin/hospitals")
      .then((response) => response.json())
      .then((result) => setHospitals(result.hospitals || []))
      .catch(() => setHospitals([]));
  }, []);

  const counts = useMemo(() => ({
    total: hospitals.length,
    pending: hospitals.filter((hospital) => hospital.status === "pending").length,
    active: hospitals.filter((hospital) => hospital.status === "active").length,
    users: hospitals.reduce((total, hospital) => total + (hospital.users || []).length, 0)
  }), [hospitals]);

  return <main className="admin-main"><header><div className="brand"><Building2 size={46} /><div><p className="eyebrow">Platform administration</p><h1>NABH Readiness System</h1></div></div><p className="intro">Hospital onboarding and readiness workspace administration.</p></header><section className="readiness-dashboard"><div className="readiness-summary"><div><p className="eyebrow">Platform overview</p><h2>Hospital onboarding</h2><p>Review pending organisations and manage platform access.</p></div><div className="readiness-score"><strong>{counts.pending}</strong><span>awaiting approval</span></div></div><div className="readiness-grid"><section className="readiness-category"><h3>Hospitals</h3><div className="readiness-counts"><button className="readiness-count" type="button" onClick={onOpenHospitals}><strong>{counts.total}</strong><span>total hospitals</span></button><button className="readiness-count readiness-approved" type="button" onClick={onOpenHospitals}><strong>{counts.active}</strong><span>active hospitals</span></button><button className="readiness-count readiness-not_started" type="button" onClick={onOpenHospitals}><strong>{counts.pending}</strong><span>pending approval</span></button></div></section><section className="readiness-category"><h3>Access management</h3><div className="readiness-counts"><button className="readiness-count" type="button" onClick={onOpenUsers}><strong>{counts.users}</strong><span>application users</span></button></div></section></div></section></main>;
}