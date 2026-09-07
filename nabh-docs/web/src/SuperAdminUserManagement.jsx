import { useEffect, useMemo, useState } from "react";
import { Building2, KeyRound, Search, Users } from "lucide-react";

export default function SuperAdminUserManagement() {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [hospital, setHospital] = useState("all");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/users")
      .then((response) => response.json())
      .then((result) => setUsers(result.users || []))
      .catch(() => setMessage("Unable to load application users."));
  }, []);

  const hospitals = useMemo(() => Array.from(new Map(users.map((user) => [user.hospitalId, { id: user.hospitalId, name: user.hospitalName, code: user.hospitalCode }])).values()).sort((left, right) => left.name.localeCompare(right.name)), [users]);
  const roles = useMemo(() => Array.from(new Set(users.map((user) => user.role).filter(Boolean))).sort(), [users]);
  const filteredUsers = useMemo(() => users.filter((user) => {
    const matchesQuery = `${user.name} ${user.email} ${user.hospitalName} ${user.hospitalCode}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (hospital === "all" || user.hospitalId === hospital) && (role === "all" || user.role === role) && (status === "all" || (status === "active") === (user.active !== false));
  }), [users, query, hospital, role, status]);

  async function resetPassword(user) {
    if (!window.confirm(`Send a new password setup link to ${user.email}? Any previous setup link will stop working.`)) return;
    setMessage(`Sending reset link to ${user.email}...`);
    const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/reset-password`, { method: "POST" });
    const result = await response.json();
    setMessage(response.ok && result.email?.delivered ? `Password setup link sent to ${user.email}.` : result.error || `A password setup link was created for ${user.email}, but email delivery needs SMTP configuration.`);
  }

  return <main className="admin-main"><header><div className="brand"><Building2 size={46} /><div><p className="eyebrow">Platform administration</p><h1>User management</h1></div></div><p className="intro">Search and manage user access across all hospitals.</p></header><section className="document-panel"><div className="panel-heading"><Users size={18} /><h2>Application users</h2><span className="count">{filteredUsers.length} users</span></div><div className="audit-filters-bar"><label className="filter-box document-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, hospital, or client code" /></label><select value={hospital} onChange={(event) => setHospital(event.target.value)}><option value="all">All hospitals</option>{hospitals.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}</select><select value={role} onChange={(event) => setRole(event.target.value)}><option value="all">All roles</option>{roles.map((item) => <option key={item}>{item}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>{filteredUsers.length === 0 ? <p className="empty">No users match these criteria.</p> : <table><thead><tr><th>User</th><th>Hospital</th><th>Role</th><th>Status</th><th aria-label="Actions" /></tr></thead><tbody>{filteredUsers.map((user) => <tr key={user.id}><td><strong>{user.name}</strong><br /><span className="mono">{user.email}</span></td><td>{user.hospitalName}<br /><span className="mono">{user.hospitalCode}</span></td><td>{user.role}</td><td>{user.active === false ? "Inactive" : "Active"}</td><td><button className="icon-button" title={`Send password reset link to ${user.email}`} onClick={() => resetPassword(user)}><KeyRound size={17} /></button></td></tr>)}</tbody></table>}{message && <p className="access-message">{message}</p>}</section></main>;
}