import { useEffect, useState } from "react";
import {
  Building2,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

const roleGroups = {
  "Administrative & Management": [
    "Hospital Administrator",
    "Quality Manager",
    "NABH Coordinator",
    "Internal Auditor",
    "HR Manager",
    "IT Administrator",
    "Medical Records Officer (MRD)",
    "Front Office Executive",
    "Billing Executive",
  ],
  "Clinical Care": [
    "Consultant Doctors",
    "Resident Medical Officer (RMO)",
    "Nurses",
    "Anesthesiologist",
    "Surgeon",
    "Physiotherapist",
    "Dietician",
  ],
  "Emergency & Critical Care": [
    "Emergency Medical Officer",
    "Trauma Nurse",
    "Intensivist",
    "Critical Care Nurse",
  ],
  "Diagnostics & Laboratory": [
    "Lab Technician",
    "Pathologist",
    "Radiologist",
    "Radiology Technician",
  ],
  "Pharmacy & Medication": [
    "Pharmacist",
    "Pharmacy Store Manager",
    "Clinical Pharmacist",
  ],
  "Quality, Safety & NABH": [
    "Infection Control Nurse (ICN)",
    "Patient Safety Officer",
    "Safety Officer",
    "Biomedical Engineer",
  ],
  "Facility Management & Support": [
    "Housekeeping Supervisor",
    "Security Officer",
    "Maintenance Engineer",
    "Ward Boy / Patient Transporter",
  ],
  "Finance, Insurance & TPA": [
    "Accounts Manager",
    "TPA Coordinator",
    "Audit Officer",
  ],
  "Operation Theatre": [
    "OT Nurse",
    "Scrub Nurse",
    "Circulating Nurse",
    "OT Technician",
  ],
  "NABH-Mandated Committees": [
    "Quality Committee Members",
    "Infection Control Committee (ICC)",
    "Pharmacy & Therapeutics Committee (PTC)",
    "Safety Committee",
    "Medical Records Committee",
    "Biomedical Committee",
  ],
};
const blankUser = {
  name: "",
  dateOfBirth: "",
  gender: "",
  mobileNumber: "",
  email: "",
  address: "",
  employeeId: "",
  department: "",
  role: "Hospital Administrator",
  dateOfJoining: "",
  employmentType: "Full-time",
  active: true,
};

export default function AdminWorkspace({
  hospitalId: scopedHospitalId,
  hospitalName,
}) {
  const [hospitals, setHospitals] = useState([]),
    [user, setUser] = useState(blankUser),
    [editingId, setEditingId] = useState(""),
    [query, setQuery] = useState(""),
    [tab, setTab] = useState("assigned"),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState("");
  const hospital = hospitals.find((item) => item.id === scopedHospitalId);
  async function load() {
    setLoading(true);
    const response = await fetch(`/api/admin/hospitals/${encodeURIComponent(scopedHospitalId)}/users`);
    if (!response.ok) throw new Error("Unable to load hospital users.");
    const result = await response.json();
    setHospitals([{ ...result.hospital, users: result.users || [] }]);
    setLoading(false);
  }
  useEffect(() => {
    load().catch((error) => setMessage(error.message)).finally(() => setLoading(false));
  }, [scopedHospitalId]);

  useEffect(() => {
    setUser(blankUser);
    setEditingId("");
    setQuery("");
    setTab("assigned");
    setMessage("");
  }, [scopedHospitalId]);
  const users = (hospital?.users || []).filter((current) =>
    `${current.name} ${current.employeeId} ${current.department} ${current.role} ${current.email} ${current.mobileNumber}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const isReadOnly = hospital?.status !== "active";
  const change = (event) =>
    setUser((current) => ({
      ...current,
      [event.target.name]:
        event.target.type === "checkbox"
          ? event.target.checked
          : event.target.value,
    }));
  function startAdd() {
    setEditingId("");
    setUser(blankUser);
    setTab("form");
  }
  function edit(current) {
    setEditingId(current.id);
    setUser({ ...blankUser, ...current });
    setTab("form");
  }
  async function save(event) {
    event.preventDefault();
    if (!hospital || isReadOnly) return setMessage("Hospital is not yet onboarded. Changes are disabled until a Super Admin approves onboarding.");
    const url = editingId
      ? `/api/admin/hospitals/${hospital.id}/users/${editingId}`
      : `/api/admin/hospitals/${hospital.id}/users`;
    const response = await fetch(url, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user),
    });
    if (!response.ok) {
      setMessage((await response.json()).error);
      return;
    }
    await load();
    setUser(blankUser);
    setEditingId("");
    setTab("assigned");
    setMessage("User profile saved.");
  }
  async function remove(id) {
    if (isReadOnly) return setMessage("Hospital is not yet onboarded. Changes are disabled until a Super Admin approves onboarding.");
    if (!window.confirm("Remove this user profile?")) return;
    await fetch(`/api/admin/hospitals/${hospital.id}/users/${id}`, {
      method: "DELETE",
    });
    await load();
    setMessage("User profile removed.");
  }
  async function toggle(current) {
    if (isReadOnly) return setMessage("Hospital is not yet onboarded. Changes are disabled until a Super Admin approves onboarding.");
    await fetch(`/api/admin/hospitals/${hospital.id}/users/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...current, active: !current.active }),
    });
    await load();
  }
  async function resetPassword(current) {
    if (isReadOnly) return setMessage("Hospital is not yet onboarded. Changes are disabled until a Super Admin approves onboarding.");
    if (!window.confirm(`Send a new password setup link to ${current.email}? Any previous setup link will stop working.`)) return;
    setMessage(`Sending reset link to ${current.email}...`);
    const response = await fetch(`/api/admin/hospitals/${hospital.id}/users/${current.id}/reset-password`, { method: "POST" });
    const result = await response.json();
    setMessage(response.ok && result.email?.delivered ? `Password setup link sent to ${current.email}.` : result.error || `A password setup link was created for ${current.email}, but email delivery needs SMTP configuration.`);
  }
  return (
    <main className="admin-main">
      <header>
        <div className="brand">
          {hospital?.logoPath ? (
            <img
              className="hospital-brand-logo"
              src={hospital.logoPath}
              alt={hospitalName || hospital?.name}
            />
          ) : (
            <Building2 size={96} />
          )}
          <div>
            <p className="eyebrow">Hospital workspace</p>
            <h1>User management</h1>
          </div>
        </div>
        <p className="intro">
          {hospitalName || hospital?.name} staff roster and NABH role
          assignments.
        </p>
      </header>
      <section className="users-panel hospital-users">
        {hospital && isReadOnly && <p className="access-message">Hospital is not yet onboarded. Changes are disabled until a Super Admin approves onboarding.</p>}
        <div className="user-tabs">
          <button
            className={tab === "assigned" ? "active" : ""}
            title="Show assigned users"
            onClick={() => setTab("assigned")}
          >
            <Users size={16} /> Assigned users
          </button>
          <button className={tab === "form" ? "active" : ""} title="Add user" disabled={isReadOnly} onClick={startAdd}>
            <Plus size={16} /> Add user
          </button>
        </div>
        {loading && <p className="loading-state"><RefreshCw size={15} className="spin-icon" /> Loading users...</p>}
        {!loading && hospital && tab === "assigned" && (
          <>
            <div className="panel-heading">
              <Users size={18} />
              <h2>Assigned users</h2>
              <span className="count">
                {users.length} of {hospital.users.length}
              </span>
            </div>
            <label className="filter-box user-search">
              <Search size={14} />
              <input
                placeholder="Search name, employee ID, department, role, email, mobile"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="user-grid">
              {users.length === 0 ? (
                <p className="empty">No users match this search.</p>
              ) : (
                users.map((current) => (
                  <article className="user-card" key={current.id}>
                    <div>
                      <strong>{current.name}</strong>
                      <p>
                        {current.role} · {current.department}
                      </p>
                      <small>
                        {current.userId ? `User ID: ${current.userId} · ` : ""}
                        {current.employeeId} · {current.email}
                      </small>
                    </div>
                    <div>
                      <button
                        type="button"
                        className={
                          current.active
                            ? "user-status active-user"
                            : "user-status inactive-user"
                        }
                        onClick={() => toggle(current)}
                        disabled={isReadOnly}
                      >
                        {current.active ? "Active" : "Inactive"}
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        title="Edit user"
                        onClick={() => edit(current)}
                        disabled={isReadOnly}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        title={`Send password reset link to ${current.email}`}
                        onClick={() => resetPassword(current)}
                        disabled={isReadOnly}
                      >
                        <KeyRound size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        title="Remove user"
                        onClick={() => remove(current.id)}
                        disabled={isReadOnly}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </>
        )}
        {hospital && tab === "form" && (
          <form className="profile-form" onSubmit={save}>
            <div className="panel-heading">
              <UserPlus size={18} />
              <h2>{editingId ? "Edit user profile" : "Add user profile"}</h2>
            </div>
            <h3>Personal information</h3>
            <div className="admin-fields">
              <label>
                Full name <b>*</b>
                <input
                  name="name"
                  value={user.name}
                  onChange={change}
                  required
                />
              </label>
              <label>
                Date of birth
                <input
                  name="dateOfBirth"
                  type="date"
                  lang="en-GB"
                  value={user.dateOfBirth}
                  onChange={change}
                />
              </label>
              <label>
                Gender
                <select name="gender" value={user.gender} onChange={change}>
                  <option value="">Select</option>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Other</option>
                </select>
              </label>
              <label>
                Mobile number
                <input
                  name="mobileNumber"
                  value={user.mobileNumber}
                  onChange={change}
                />
              </label>
              <label>
                Official email <b>*</b>
                <input
                  name="email"
                  type="email"
                  value={user.email}
                  onChange={change}
                  required
                />
              </label>
              <label className="wide">
                Address
                <input name="address" value={user.address} onChange={change} />
              </label>
            </div>
            <h3>Employment details</h3>
            <div className="admin-fields">
              <label>
                Employee ID
                <input
                  name="employeeId"
                  value={user.employeeId}
                  onChange={change}
                />
              </label>
              <label>
                Department
                <input
                  name="department"
                  value={user.department}
                  onChange={change}
                />
              </label>
              <label>
                Designation / role <b>*</b>
                <select name="role" value={user.role} onChange={change}>
                  {Object.entries(roleGroups).map(([group, values]) => (
                    <optgroup key={group} label={group}>
                      {values.map((role) => (
                        <option key={role}>{role}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label>
                Date of joining
                <input
                  name="dateOfJoining"
                  type="date"
                  lang="en-GB"
                  value={user.dateOfJoining}
                  onChange={change}
                />
              </label>
              <label>
                Employment type
                <select
                  name="employmentType"
                  value={user.employmentType}
                  onChange={change}
                >
                  <option>Full-time</option>
                  <option>Part-time</option>
                  <option>Consultant</option>
                </select>
              </label>
              <label className="user-active">
                <input
                  name="active"
                  type="checkbox"
                  checked={user.active}
                  onChange={change}
                />{" "}
                Active access
              </label>
            </div>
            <button className="primary-button" title={editingId ? "Save user" : "Add user"} disabled={isReadOnly}>
              <UserPlus size={16} /> {editingId ? "Save user" : "Add user"}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setTab("assigned")}
            >
              Cancel
            </button>
          </form>
        )}
        {message && <p className="admin-message">{message}</p>}
      </section>
    </main>
  );
}
