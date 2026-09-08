import { useEffect, useState } from "react";
import { Building2, Search, Users } from "lucide-react";
import AdminWorkspace from "./AdminWorkspace.jsx";

export default function SuperAdminUserManagement() {
  const [hospitals, setHospitals] = useState([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/hospitals?view=registry")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load hospitals.");
        return result;
      })
      .then((result) => setHospitals((result.hospitals || []).sort((left, right) => left.name.localeCompare(right.name))))
      .catch((error) => setMessage(error.message));
  }, []);

  return (
    <main className="admin-main">
      <header>
        <div className="brand">
          <Building2 size={46} />
          <div>
            <p className="eyebrow">Platform administration</p>
            <h1>User management</h1>
          </div>
        </div>
        <p className="intro">
          Select a hospital to manage its users, roles, and password access.
        </p>
      </header>
      <section className="document-panel super-admin-hospital-picker">
        <div className="panel-heading">
          <Users size={18} />
          <h2>Choose hospital</h2>
        </div>
        <label className="filter-box super-admin-hospital-select">
          <Search size={14} />
          <select value={selectedHospitalId} onChange={(event) => setSelectedHospitalId(event.target.value)}>
            <option value="">Select a hospital</option>
            {hospitals.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
          </select>
        </label>
        {hospitals.length === 0 && !message && <p className="empty">Loading hospitals...</p>}
        {message && <p className="status error">{message}</p>}
        {!selectedHospitalId && hospitals.length > 0 && <p className="access-message">Choose a hospital to open its scoped user-management workspace.</p>}
      </section>
      {selectedHospitalId && (
        <section className="super-admin-scoped-users">
          <AdminWorkspace scopedHospitalId={selectedHospitalId} hospitalName={hospitals.find((item) => item.id === selectedHospitalId)?.name} />
        </section>
      )}
    </main>
  );
}
