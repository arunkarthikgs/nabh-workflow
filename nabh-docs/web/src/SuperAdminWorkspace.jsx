import { useEffect, useState } from "react";
import { Building2, CheckCircle2, KeyRound, Plus, Save, Search, Trash2, X } from "lucide-react";
import {
  emptyHospitalDetails,
  hospitalRegistrationSections,
} from "./hospitalFormFields.js";

const empty = () => ({
  name: "",
  code: "",
  status: "pending",
  details: emptyHospitalDetails(),
});

export default function SuperAdminWorkspace({ initialStatusFilter = "all" }) {
  const [hospitals, setHospitals] = useState([]),
    [id, setId] = useState(""),
    [form, setForm] = useState(empty()),
    [query, setQuery] = useState(""),
    [message, setMessage] = useState(""),
    [statusFilter, setStatusFilter] = useState(initialStatusFilter),
    [pendingApproval, setPendingApproval] = useState(null),
    [approving, setApproving] = useState(false);
  const selected = hospitals.find((item) => item.id === id);
  async function load() {
    const response = await fetch("/api/admin/hospitals?view=registry");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load hospitals.");
    const records = result.hospitals || [];
    setHospitals(records);
    setId((current) =>
      records.some((item) => item.id === current)
        ? current
        : records[0]?.id || "",
    );
  }
  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, []);
  useEffect(() => {
    setStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);
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
  async function approveOnboarding() {
    if (!pendingApproval) return;
    setApproving(true);
    const response = await fetch(`/api/admin/hospitals/${pendingApproval.id}/approve-onboarding`, { method: "POST" });
    const result = await response.json();
    setApproving(false);
    if (!response.ok) { setMessage(result.error || "Unable to approve hospital onboarding."); return; }
    setPendingApproval(null);
    await load();
    setId(result.hospital.id);
    setMessage(`${result.hospital.name} is now active.`);
  }
  async function resendRegistration() {
    if (!selected) return;
    const response = await fetch(`/api/admin/hospitals/${selected.id}/registration/resend`, { method: "POST" });
    const result = await response.json();
    setMessage(response.ok ? "A new registration link was sent. The previous link was revoked." : result.error || "Unable to resend registration link.");
  }
  const filtered = hospitals.filter((item) =>
    `${item.name} ${item.code} ${item.details?.city} ${item.details?.state}`
      .toLowerCase()
      .includes(query.toLowerCase()) && (statusFilter === "all" || item.status === statusFilter),
  );
  const pendingCount = hospitals.filter((item) => item.status === "pending").length;
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
            {pendingCount > 0 && <span className="pending-hospital-count">{pendingCount} pending</span>}
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
          <label className="hospital-status-filter">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          {filtered.map((item) => (
            <button
              className={`hospital-row ${item.id === id ? "selected" : ""} ${item.status === "pending" ? "hospital-row-pending" : ""}`}
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
                <small className={`hospital-status hospital-status-${item.status || "active"}`}>{item.status || "active"}</small>
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
                  <option value="pending">Pending</option>
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
          <div className="hospital-form-actions">
            <button className="primary-button">
              <Save size={16} /> Save hospital
            </button>
            {selected?.status === "pending" && <><button className="approve-onboarding-button" type="button" onClick={() => setPendingApproval(selected)}><CheckCircle2 size={16} /> Approve onboarding</button><button className="resend-registration-button" type="button" onClick={resendRegistration}><KeyRound size={16} /> Resend setup link</button></>}
          </div>
          {message && <p className="admin-message">{message}</p>}
        </form>
      </section>
      {pendingApproval && <div className="preview-backdrop" role="presentation" onClick={() => setPendingApproval(null)}><section className="preview-dialog onboarding-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-confirmation-title" onClick={(event) => event.stopPropagation()}><div className="preview-header onboarding-confirm-header"><div className="onboarding-confirm-mark"><CheckCircle2 size={20} /></div><div><p className="eyebrow">Approve hospital onboarding</p><h2 id="onboarding-confirmation-title">{pendingApproval.name}</h2></div><button className="icon-button" type="button" title="Close confirmation" onClick={() => setPendingApproval(null)}><X size={18} /></button></div><div className="onboarding-confirm-body"><p>Approve this hospital to activate its platform access.</p><div className="onboarding-confirm-note">The hospital administrator can sign in after approval. The hospital can then select its accreditation programme and prepare its document workspace.</div></div><div className="onboarding-confirm-actions"><button className="secondary-button" type="button" disabled={approving} onClick={() => setPendingApproval(null)}>Cancel</button><button className="primary-button" type="button" disabled={approving} onClick={approveOnboarding}><CheckCircle2 size={16} /> {approving ? "Approving..." : "Approve onboarding"}</button></div></section></div>}
    </main>
  );
}
