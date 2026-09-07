import { useEffect, useState } from "react";
import { Building2, KeyRound, Plus, Save, Search, Trash2, Users } from "lucide-react";
import {
  emptyHospitalDetails,
  hospitalRegistrationSections,
} from "./hospitalFormFields.js";

const empty = () => ({
  name: "",
  code: "",
  status: "active",
  details: emptyHospitalDetails(),
});

export default function SuperAdminWorkspace() {
  const [hospitals, setHospitals] = useState([]),
    [id, setId] = useState(""),
    [form, setForm] = useState(empty()),
    [query, setQuery] = useState(""),
    [message, setMessage] = useState(""),
    [users, setUsers] = useState([]),
    [userQuery, setUserQuery] = useState(""),
    [resetMessage, setResetMessage] = useState("");
  const selected = hospitals.find((item) => item.id === id);
  async function load() {
    const response = await fetch("/api/admin/hospitals");
    const { hospitals: records } = await response.json();
    setHospitals(records);
    setId((current) =>
      records.some((item) => item.id === current)
        ? current
        : records[0]?.id || "",
    );
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    fetch("/api/admin/users")
      .then((response) => response.json())
      .then((result) => setUsers(result.users || []))
      .catch(() => setUsers([]));
  }, []);
  useEffect(() => {
    if (selected)
      setForm({
        name: selected.name,
        code: selected.code,
        status: selected.status,
        details: { ...empty().details, ...selected.details },
      });
  }, [id, hospitals]);
  const change = (event) => {
    const { name, value } = event.target;
    setForm((current) =>
      name in current.details
        ? { ...current, details: { ...current.details, [name]: value } }
        : { ...current, [name]: value },
    );
  };
  function uploadLogo(event) {
    const [file] = event.target.files;
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 1_500_000) {
      setMessage("Use a PNG, JPEG, or WebP logo smaller than 1.5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setForm((current) => ({ ...current, logoDataUrl: reader.result }));
    reader.readAsDataURL(file);
  }
  async function save(event) {
    event.preventDefault();
    const response = await fetch(
      selected ? `/api/admin/hospitals/${selected.id}` : "/api/admin/hospitals",
      {
        method: selected ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          location: [form.details.city, form.details.state]
            .filter(Boolean)
            .join(", "),
        }),
      },
    );
    if (!response.ok) {
      setMessage((await response.json()).error);
      return;
    }
    const { hospital } = await response.json();
    await load();
    setId(hospital.id);
    setMessage("Hospital registration saved.");
  }
  async function remove() {
    if (!selected || !window.confirm("Remove this hospital?")) return;
    await fetch(`/api/admin/hospitals/${selected.id}`, { method: "DELETE" });
    await load();
    setForm(empty());
  }
  const filtered = hospitals.filter((item) =>
    `${item.name} ${item.code} ${item.details?.city} ${item.details?.state}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const matchingUsers = users.filter((user) => `${user.name} ${user.email} ${user.hospitalName} ${user.hospitalCode}`.toLowerCase().includes(userQuery.trim().toLowerCase()));
  async function resetPassword(user) {
    if (!window.confirm(`Send a new password setup link to ${user.email}? Any previous setup link will stop working.`)) return;
    setResetMessage(`Sending reset link to ${user.email}...`);
    const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/reset-password`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) { setResetMessage(result.error || "Unable to reset the password."); return; }
    setResetMessage(result.email?.delivered ? `Password setup link sent to ${user.email}.` : `A password setup link was created for ${user.email}, but email delivery needs SMTP configuration.`);
  }
  return (
    <main className="admin-main">
      <header>
        <div className="brand">
          {selected?.logoPath && (
            <img
              className="hospital-brand-logo"
              src={selected.logoPath}
              alt=""
            />
          )}
          <Building2 size={46} />
          <div>
            <p className="eyebrow">Product hosting</p>
            <h1>Hospital registry</h1>
          </div>
        </div>
        <p className="intro">Register and maintain client hospitals.</p>
      </header>
      <section className="admin-layout">
        <aside className="hospital-list">
          <div className="panel-heading">
            <Building2 size={18} />
            <h2>Hospitals</h2>
            <button
              className="icon-button"
              onClick={() => {
                setId("");
                setForm(empty());
              }}
            >
              <Plus size={17} />
            </button>
          </div>
          <label className="filter-box">
            <Search size={14} />
            <input
              placeholder="Search hospital, code, city"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {filtered.map((item) => (
            <button
              className={`hospital-row ${item.id === id ? "selected" : ""}`}
              key={item.id}
              onClick={() => setId(item.id)}
            >
              {item.logoPath && (
                <img
                  className="hospital-mini-logo"
                  src={item.logoPath}
                  alt=""
                />
              )}
              <span>
                <strong>{item.name}</strong>
                <small>{item.code}</small>
              </span>
            </button>
          ))}
        </aside>
        <form className="admin-form registration-form" onSubmit={save}>
          <div className="panel-heading">
            <Building2 size={18} />
            <h2>{selected ? "Edit hospital" : "New hospital"}</h2>
            {selected && (
              <button className="danger-button" type="button" onClick={remove}>
                <Trash2 size={15} /> Remove
              </button>
            )}
          </div>
          <section>
            <h3>Hospital identity</h3>
            <div className="admin-fields">
              <label>
                Legal hospital name <b>*</b>
                <input
                  name="name"
                  value={form.name}
                  onChange={change}
                  required
                />
              </label>
              <label>
                Client code <b>*</b>
                <input
                  name="code"
                  value={form.code}
                  onChange={change}
                  required
                />
              </label>
              <label>
                Status
                <select name="status" value={form.status} onChange={change}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <label>
                Hospital logo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={uploadLogo}
                />
              </label>
              {(form.logoDataUrl || selected?.logoPath) && (
                <img
                  className="hospital-mini-logo"
                  src={form.logoDataUrl || selected?.logoPath}
                  alt="Hospital logo"
                />
              )}
            </div>
          </section>
          {hospitalRegistrationSections.map(([title, fields]) => (
            <section key={title}>
              <h3>{title}</h3>
              <div className="admin-fields">
                {fields.map(([key, label, type, options]) => (
                  <label key={key}>
                    {label}
                    {type === "select" ? (
                      <select
                        name={key}
                        value={form.details[key]}
                        onChange={change}
                      >
                        <option value="">Select</option>
                        {options.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        name={key}
                        type={
                          type || (key.includes("Email") ? "email" : "text")
                        }
                        value={form.details[key]}
                        onChange={change}
                      />
                    )}
                  </label>
                ))}
              </div>
            </section>
          ))}
          <button className="primary-button">
            <Save size={16} /> Save hospital
          </button>
          {message && <p className="admin-message">{message}</p>}
        </form>
      </section>
      <section className="document-panel">
        <div className="panel-heading"><Users size={18} /><h2>Application users</h2><span className="count">{matchingUsers.length} users</span></div>
        <label className="filter-box document-search"><Search size={14} /><input value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="Search name, email, hospital, or client code" /></label>
        {matchingUsers.length === 0 ? <p className="empty">No users match this search.</p> : <table><thead><tr><th>User</th><th>Hospital</th><th>Role</th><th>Status</th><th aria-label="Actions" /></tr></thead><tbody>{matchingUsers.map((user) => <tr key={user.id}><td><strong>{user.name}</strong><br /><span className="mono">{user.email}</span></td><td>{user.hospitalName}<br /><span className="mono">{user.hospitalCode}</span></td><td>{user.role}</td><td>{user.active === false ? "Inactive" : "Active"}</td><td><button className="icon-button" title={`Send password reset link to ${user.email}`} onClick={() => resetPassword(user)}><KeyRound size={17} /></button></td></tr>)}</tbody></table>}
        {resetMessage && <p className="access-message">{resetMessage}</p>}
      </section>
    </main>
  );
}
