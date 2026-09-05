import { useEffect, useState } from "react";
import { Building2, FolderGit2, Plus, Save, Trash2, UserPlus, Users } from "lucide-react";
import hospitalLogo from "../../logo.png";

const roles = [
  "Hospital Administrator", "Quality Manager", "NABH Coordinator", "Internal Auditor", "HR Manager", "IT Administrator", "Medical Records Officer (MRD)", "Front Office Executive", "Billing Executive", "Consultant Doctor", "Resident Medical Officer (RMO)", "Nurse", "Anesthesiologist", "Surgeon", "Physiotherapist", "Dietician", "Emergency Medical Officer", "Trauma Nurse", "Intensivist", "Critical Care Nurse", "Lab Technician", "Pathologist", "Radiologist", "Radiology Technician", "Pharmacist", "Pharmacy Store Manager", "Clinical Pharmacist", "Infection Control Nurse (ICN)", "Patient Safety Officer", "Safety Officer", "Biomedical Engineer", "Housekeeping Supervisor", "Security Officer", "Maintenance Engineer", "Ward Boy / Patient Transporter", "Accounts Manager", "TPA Coordinator", "Audit Officer", "OT Nurse", "Scrub Nurse", "Circulating Nurse", "OT Technician", "Quality Committee Member", "Infection Control Committee (ICC)", "Pharmacy & Therapeutics Committee (PTC)", "Safety Committee", "Medical Records Committee", "Biomedical Committee"
];

const blankHospital = { name: "", code: "", location: "", status: "active", repositoryUrl: "", repositoryBranch: "main" };
const blankUser = { name: "", email: "", role: "Hospital Administrator", active: true };

export default function AdminWorkspace() {
  const [hospitals, setHospitals] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [hospitalForm, setHospitalForm] = useState(blankHospital);
  const [userForm, setUserForm] = useState(blankUser);
  const [message, setMessage] = useState("");
  const selected = hospitals.find((hospital) => hospital.id === selectedId) || null;

  async function load() {
    const response = await fetch("/api/v1/admin/hospitals");
    if (!response.ok) throw new Error("Unable to load hospitals.");
    const { hospitals: records } = await response.json();
    setHospitals(records);
    setSelectedId((current) => records.some((hospital) => hospital.id === current) ? current : records[0]?.id || "");
  }

  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);
  useEffect(() => {
    if (!selected) { setHospitalForm(blankHospital); return; }
    setHospitalForm({ name: selected.name, code: selected.code, location: selected.location, status: selected.status, repositoryUrl: selected.repository?.url || "", repositoryBranch: selected.repository?.branch || "main" });
  }, [selectedId, hospitals]);

  const request = async (url, options) => {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error((await response.json()).error || "Request failed.");
    return response;
  };
  const changeHospital = (event) => setHospitalForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const changeUser = (event) => setUserForm((current) => ({ ...current, [event.target.name]: event.target.type === "checkbox" ? event.target.checked : event.target.value }));

  async function saveHospital(event) {
    event.preventDefault();
    try {
      const response = await request(selected ? `/api/v1/admin/hospitals/${selected.id}` : "/api/v1/admin/hospitals", { method: selected ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(hospitalForm) });
      const { hospital } = await response.json(); await load(); setSelectedId(hospital.id); setMessage(`${hospital.name} saved.`);
    } catch (error) { setMessage(error.message); }
  }

  async function removeHospital() {
    if (!selected || !window.confirm(`Remove ${selected.name} and its user profiles?`)) return;
    try { await request(`/api/v1/admin/hospitals/${selected.id}`, { method: "DELETE" }); await load(); setMessage("Hospital removed."); } catch (error) { setMessage(error.message); }
  }

  async function addUser(event) {
    event.preventDefault();
    if (!selected) return;
    try { await request(`/api/v1/admin/hospitals/${selected.id}/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(userForm) }); setUserForm(blankUser); await load(); setMessage("User profile added."); } catch (error) { setMessage(error.message); }
  }

  async function toggleUser(user) {
    try { await request(`/api/v1/admin/hospitals/${selected.id}/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...user, active: !user.active }) }); await load(); } catch (error) { setMessage(error.message); }
  }

  async function removeUser(user) {
    if (!window.confirm(`Remove ${user.name}'s profile?`)) return;
    try { await request(`/api/v1/admin/hospitals/${selected.id}/users/${user.id}`, { method: "DELETE" }); await load(); setMessage("User profile removed."); } catch (error) { setMessage(error.message); }
  }

  return <main className="admin-main"><header><div className="brand"><img src={hospitalLogo} alt="NABH workflow" /><div><p className="hospital-name">NABH Control Room</p><p className="eyebrow">Client administration</p></div></div><h1>Hospital management</h1><p className="intro">Register client hospitals, point each tenant to its document repository, and maintain role-based user profiles.</p></header><section className="admin-layout"><aside className="hospital-list"><div className="panel-title"><div><p className="eyebrow">Clients</p><h2>Hospitals</h2></div><button className="icon-button" title="Register hospital" onClick={() => { setSelectedId(""); setHospitalForm(blankHospital); }}><Plus size={18} /></button></div>{hospitals.length === 0 && <p className="empty-state">No hospitals registered.</p>}{hospitals.map((hospital) => <button key={hospital.id} className={`hospital-row ${selectedId === hospital.id ? "selected" : ""}`} onClick={() => setSelectedId(hospital.id)}><Building2 size={18} /><span><strong>{hospital.name}</strong><small>{hospital.code} · {hospital.users.length} users</small></span><i className={hospital.status} /></button>)}</aside><div className="admin-content"><form className="admin-form" onSubmit={saveHospital}><div className="form-heading"><div><p className="eyebrow">{selected ? "Client configuration" : "New client"}</p><h2>{selected ? selected.name : "Register hospital"}</h2></div>{selected && <button type="button" className="danger-button" onClick={removeHospital}><Trash2 size={16} /> Remove</button>}</div><section className="fields admin-fields"><label className="field"><span>Hospital name <b>*</b></span><input name="name" value={hospitalForm.name} onChange={changeHospital} /></label><label className="field"><span>Client code <b>*</b></span><input name="code" value={hospitalForm.code} onChange={changeHospital} /></label><label className="field"><span>Location</span><input name="location" value={hospitalForm.location} onChange={changeHospital} /></label><label className="field"><span>Status</span><select name="status" value={hospitalForm.status} onChange={changeHospital}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label className="field wide"><span><FolderGit2 size={14} /> Repository URL</span><input name="repositoryUrl" type="url" placeholder="https://github.com/organisation/hospital-repository" value={hospitalForm.repositoryUrl} onChange={changeHospital} /></label><label className="field"><span>Default branch</span><input name="repositoryBranch" value={hospitalForm.repositoryBranch} onChange={changeHospital} /></label></section><footer><span className="muted">Each hospital is an isolated client record.</span><button className="submit"><Save size={17} />{selected ? "Save client" : "Register hospital"}</button></footer></form>{selected && <section className="users-panel"><div className="panel-title"><div><p className="eyebrow">{selected.code}</p><h2><Users size={21} /> User management</h2></div><span className="user-count">{selected.users.length} profiles</span></div><div className="user-grid">{selected.users.length === 0 ? <p className="empty-state">No user profiles assigned.</p> : selected.users.map((user) => <article className="user-card" key={user.id}><div><strong>{user.name}</strong><p>{user.role}</p><small>{user.email}</small></div><div className="user-actions"><button type="button" className={user.active ? "active-toggle" : "inactive-toggle"} onClick={() => toggleUser(user)}>{user.active ? "Active" : "Inactive"}</button><button type="button" className="icon-button" title="Remove user" onClick={() => removeUser(user)}><Trash2 size={15} /></button></div></article>)}</div><form className="user-form" onSubmit={addUser}><label className="field"><span>Full name <b>*</b></span><input name="name" value={userForm.name} onChange={changeUser} /></label><label className="field"><span>Email <b>*</b></span><input name="email" type="email" value={userForm.email} onChange={changeUser} /></label><label className="field"><span>Role <b>*</b></span><select name="role" value={userForm.role} onChange={changeUser}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label><label className="checkbox-field"><input name="active" type="checkbox" checked={userForm.active} onChange={changeUser} /> Active access</label><button className="submit"><UserPlus size={17} /> Add user</button></form></section>}{message && <p className="status">{message}</p>}</div></section></main>;
}