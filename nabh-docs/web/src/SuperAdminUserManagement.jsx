import { useEffect, useState } from "react";
import { Building2, RefreshCw, Search, Users } from "lucide-react";
import AdminWorkspace from "./AdminWorkspace.jsx";

const defaultHospitalLogo = "/logos/no-logo.png";

export default function SuperAdminUserManagement() {
  const [hospitals, setHospitals] = useState([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/hospitals?view=registry")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load hospitals.");
        return result;
      })
      .then((result) => {
        const records = result.hospitals || [];
        setHospitals(records);
        setSelectedHospitalId((current) => records.some((item) => item.id === current) ? current : records[0]?.id || "");
      })
      .catch((error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredHospitals = hospitals.filter((hospital) =>
    `${hospital.name} ${hospital.code} ${hospital.details?.city || ""} ${hospital.details?.state || ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  ).filter((hospital) => statusFilter === "all" || hospital.status === statusFilter);
  const pendingCount = hospitals.filter((hospital) => hospital.status === "pending").length;

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
      <section className="admin-layout super-admin-user-layout">
        <aside className="hospital-list">
          <div className="panel-heading">
            <Building2 size={18} />
            <h2>Hospitals</h2>
            {pendingCount > 0 && <span className="pending-hospital-count">{pendingCount} pending</span>}
          </div>
          <label className="filter-box">
            <Search size={14} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search hospital, code, city" />
          </label>
          <label className="hospital-status-filter">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          {loading && <p className="loading-state"><RefreshCw size={15} className="spin-icon" /> Loading hospitals...</p>}
          {!loading && filteredHospitals.map((item) => (
            <button
              className={`hospital-row ${item.id === selectedHospitalId ? "selected" : ""} ${item.status === "pending" ? "hospital-row-pending" : ""}`}
              key={item.id}
              onClick={() => setSelectedHospitalId(item.id)}
            >
              <img className="hospital-mini-logo" src={item.logoPath || defaultHospitalLogo} alt="" />
              <span>
                <strong>{item.name}</strong>
                <small>{item.code}</small>
                <small className="hospital-accreditation-label">{item.accreditation?.programme || "Accreditation not selected"}</small>
                <small className={`hospital-status hospital-status-${item.status || "active"}`}>{item.status || "active"}</small>
              </span>
            </button>
          ))}
        </aside>
        <section className="super-admin-scoped-users">
          {message && <p className="status error">{message}</p>}
          {!selectedHospitalId ? (
            <section className="document-panel repository-empty">
              <Users size={28} />
              <h2>Select a hospital</h2>
              <p>Choose a hospital from the list to open its scoped user-management workspace.</p>
            </section>
          ) : (
            <AdminWorkspace hospitalId={selectedHospitalId} hospitalName={hospitals.find((item) => item.id === selectedHospitalId)?.name} />
          )}
        </section>
      </section>
    </main>
  );
}
