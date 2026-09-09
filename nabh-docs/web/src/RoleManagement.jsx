import { Fragment, useEffect, useState } from "react";
import { BookOpenCheck, Building2, ChevronDown, Pencil, Plus, Save, ShieldCheck, Trash2, UsersRound } from "lucide-react";

const actions = [
  ["view_documents", "View documents"], ["edit_documents", "Edit documents"], ["submit_documents", "Submit for review"],
  ["approve_documents", "Approve documents"], ["request_changes", "Request changes"], ["reopen_documents", "Reopen documents"],
  ["upload_evidence", "Upload evidence"], ["view_audit", "View audit logs"], ["manage_users", "Manage users"],
  ["manage_roles", "Manage roles"], ["manage_profile", "Manage profile"], ["select_accreditation", "Select accreditation"],
  ["manage_bookings", "Manage bookings"], ["delete_documents", "Delete documents"]
].map(([id, label]) => ({ id, label }));
const blankRole = { name: "", documentAccess: {}, scopeMode: "selected_documents", permissions: ["view_documents"] };
const NABH_WORKSPACE_CATEGORIES = ["Manuals", "Policies", "Standard Operating Procedures", "Forms and Formats", "Registers", "Department Manuals", "Checklists", "Training Requirements", "Records and Evidence"];
const CATEGORY_RULES = [["Standard Operating Procedures", /\bsops?\b|standard operating procedure/i], ["Checklists", /\bchecklist/i], ["Registers", /\bregister/i], ["Policies", /\bpolic(y|ies)\b/i], ["Forms and Formats", /\bforms?\b|\bformats?\b/i], ["Training Requirements", /\btraining\b|\binduction\b/i], ["Records and Evidence", /\brecords?\b|\bevidence\b|\baudit\b/i], ["Manuals", /\bmanual\b/i]];
function classifyDocument(documentName) { for (const [category, pattern] of CATEGORY_RULES) if (pattern.test(documentName)) return category; return "Department Manuals"; }
function groupRoles(roles, groups) { const remaining = [...roles]; const result = Object.entries(groups).map(([name, names]) => { const members = remaining.filter((role) => names.includes(role.name)); members.forEach((member) => remaining.splice(remaining.indexOf(member), 1)); return [name, members]; }).filter(([, members]) => members.length); if (remaining.length) result.push(["Custom roles", remaining]); return result; }

export default function RoleManagement({ hospitalId, hospitalName, hospitalLogoPath }) {
  const [roles, setRoles] = useState([]), [departments, setDepartments] = useState({}), [department, setDepartment] = useState(""), [selectedId, setSelectedId] = useState(""), [draft, setDraft] = useState(blankRole), [tab, setTab] = useState("roles"), [openGroups, setOpenGroups] = useState({}), [rolesQuery, setRolesQuery] = useState(""), [message, setMessage] = useState(""), [logoPath, setLogoPath] = useState(hospitalLogoPath || ""), [hospitalStatus, setHospitalStatus] = useState("pending"), [roleGroups, setRoleGroups] = useState({});
  useEffect(() => {
    fetch("/api/admin/role-master")
      .then((response) => (response.ok ? response.json() : { groups: {} }))
      .then((result) => setRoleGroups(result.groups || {}))
      .catch(() => setRoleGroups({}));
  }, []);
  const isReadOnly = hospitalStatus !== "active";
  async function load() { const roleResponse = await fetch(`/api/admin/hospitals/${hospitalId}/roles`); if (!roleResponse.ok) throw new Error("Unable to load role access data."); const result = await roleResponse.json(), loadedRoles = result.roles || [], hospital = result.hospital || {}; setRoles(loadedRoles); setSelectedId((current) => loadedRoles.some((role) => role.id === current) ? current : loadedRoles[0]?.id || ""); setLogoPath(hospital.logoPath || hospitalLogoPath || ""); setHospitalStatus(hospital.status || "pending"); }
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, [hospitalId]);
  useEffect(() => {
    if (tab !== "scope" || Object.keys(departments).length) return undefined;
    fetch("/api/document-matches").then(async (response) => { if (!response.ok) throw new Error("Unable to load document access data."); return response.json(); }).then((sourceDepartments) => {
      const groupedDepartments = Object.fromEntries(NABH_WORKSPACE_CATEGORIES.map((category) => [category, []]));
      Object.values(sourceDepartments || {}).flat().forEach((document) => { const category = classifyDocument(`${document.documentName || ""} ${document.documentId || ""}`); groupedDepartments[category].push(document); });
      setDepartments(groupedDepartments);
      setDepartment((current) => current || NABH_WORKSPACE_CATEGORIES.find((category) => groupedDepartments[category].length) || NABH_WORKSPACE_CATEGORIES[0]);
    }).catch((error) => setMessage(error.message));
    return undefined;
  }, [tab, departments]);
  useEffect(() => {
    const button = window.document.createElement("button");
    button.className = "new-role-button";
    button.type = "button";
    button.textContent = "New role";
    button.addEventListener("click", () => { if (isReadOnly) return; setSelectedId(""); setDraft(blankRole); setTab("roles"); });
    window.document.body.appendChild(button);
    return () => button.remove();
  }, [isReadOnly]);
  useEffect(() => {
    if (tab !== "scope") return undefined;
    const addSearch = (panel, placeholder, onQuery) => {
      if (!panel) return () => {};
      const input = window.document.createElement("input");
      input.className = "context-search";
      input.type = "search";
      input.placeholder = placeholder;
      input.addEventListener("input", () => onQuery(input.value.trim().toLowerCase(), input));
      panel.querySelector(".panel-heading")?.after(input);
      return () => input.remove();
    };
    const filterRoles = (query) => {
      window.document.querySelectorAll(".scope-role").forEach((role) => {
        const groupName = role.closest(".role-group")?.querySelector(".role-group-toggle")?.textContent.toLowerCase() || "";
        role.style.display = query && !role.textContent.toLowerCase().includes(query) && !groupName.includes(query) ? "none" : "";
      });
      window.document.querySelectorAll(".scope-role-list .role-group").forEach((group) => { group.style.display = query && ![...group.querySelectorAll(".scope-role")].some((role) => role.style.display !== "none") ? "none" : ""; });
    };
    const chooserCleanup = addSearch(window.document.querySelector(".scope-role-list"), "Search roles", (query, input) => {
      if (query) {
        const matchingGroups = grouped.filter(([group, members]) => group.toLowerCase().includes(query) || members.some((role) => role.name.toLowerCase().includes(query)));
        setOpenGroups((current) => ({ ...current, ...Object.fromEntries(matchingGroups.map(([group]) => [group, true])) }));
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => filterRoles(input.value.trim().toLowerCase())));
      } else filterRoles(query);
    });
    const accessCleanup = addSearch(window.document.querySelector(".scope-editor"), "Search departments or documents", (query, input) => {
      const matchingDepartments = Object.entries(departments).filter(([name, items]) => name.toLowerCase().includes(query) || items.some((document) => `${document.documentName} ${document.documentId}`.toLowerCase().includes(query)));
      if (query && matchingDepartments.length) setDepartment(matchingDepartments[0][0]);
      window.document.querySelectorAll(".department-access-card").forEach((card) => {
        const name = card.querySelector("strong")?.textContent || "";
        const matches = !query || name.toLowerCase().includes(query) || (departments[name] || []).some((document) => `${document.documentName} ${document.documentId}`.toLowerCase().includes(query));
        card.style.display = matches ? "" : "none";
      });
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.document.querySelectorAll(".scope-picker label").forEach((item) => { item.style.display = input.value.trim() && !item.textContent.toLowerCase().includes(input.value.trim().toLowerCase()) ? "none" : ""; })));
    });
    return () => { chooserCleanup(); accessCleanup(); };
  }, [tab, selectedId]);
  useEffect(() => {
    if (tab !== "roles") return undefined;
    const panel = window.document.querySelector(".grouped-role-list");
    if (!panel || panel.querySelector(".roles-search")) return undefined;
    const input = window.document.createElement("input");
    input.className = "context-search roles-search";
    input.type = "search";
    input.placeholder = "Search roles";
    const filter = () => {
      const query = input.value.trim().toLowerCase();
      const matchingGroups = grouped.filter(([group, members]) => group.toLowerCase().includes(query) || members.some((role) => role.name.toLowerCase().includes(query)));
      if (query) setOpenGroups((current) => ({ ...current, ...Object.fromEntries(matchingGroups.map(([group]) => [group, true])) }));
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        window.document.querySelectorAll(".grouped-role-list .role-row").forEach((role) => {
          const group = role.closest(".role-group")?.querySelector(".role-group-toggle")?.textContent.toLowerCase() || "";
          role.style.display = query && !role.textContent.toLowerCase().includes(query) && !group.includes(query) ? "none" : "";
        });
        window.document.querySelectorAll(".grouped-role-list .role-group").forEach((group) => { group.style.display = query && ![...group.querySelectorAll(".role-row")].some((role) => role.style.display !== "none") ? "none" : ""; });
      }));
    };
    const handleInput = () => { setRolesQuery(input.value.trim().toLowerCase()); filter(); };
    input.addEventListener("input", handleInput);
    panel.before(input);
    return () => { input.removeEventListener("input", handleInput); input.remove(); };
  }, [tab, roles]);
  const selectedRole = roles.find((role) => role.id === selectedId), docs = departments[department] || [], selectedDocs = draft.documentAccess[department] || [], grouped = groupRoles(roles, roleGroups);
  const visibleRoleGroups = rolesQuery ? grouped.map(([group, members]) => [group, members.filter((role) => group.toLowerCase().includes(rolesQuery) || role.name.toLowerCase().includes(rolesQuery))]).filter(([, members]) => members.length) : grouped;
  const count = (role) => Object.values(role.documentAccess || {}).flat().length;
  const complete = (name) => departments[name]?.length > 0 && (draft.documentAccess[name] || []).length === departments[name].length;
  function choose(role) { setSelectedId(role.id); setDraft({ name: role.name, documentAccess: role.documentAccess || {}, scopeMode: role.scopeMode || "selected_documents", permissions: role.permissions || ["view_documents"] }); }
  function toggleAction(action) { setDraft((current) => { const permissions = current.permissions.includes(action) ? current.permissions.filter((item) => item !== action) : [...current.permissions, action]; return { ...current, permissions: permissions.some((item) => item !== "view_documents") && !permissions.includes("view_documents") ? ["view_documents", ...permissions] : permissions }; }); }
  function toggleDocument(id) { setDraft((current) => { const ids = current.documentAccess[department] || []; return { ...current, documentAccess: { ...current.documentAccess, [department]: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id] } }; }); }
  function toggleDepartment(name) { setDraft((current) => ({ ...current, documentAccess: { ...current.documentAccess, [name]: complete(name) ? [] : departments[name].map((document) => document.id) } })); }
  async function save(event) { event?.preventDefault(); if (isReadOnly) return setMessage("Hospital is not yet onboarded. Changes are disabled until a Super Admin approves onboarding."); const response = await fetch(selectedRole ? `/api/admin/hospitals/${hospitalId}/roles/${selectedRole.id}` : `/api/admin/hospitals/${hospitalId}/roles`, { method: selectedRole ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) }); if (!response.ok) return setMessage((await response.json()).error); const result = await response.json(); await load(); setSelectedId(result.role?.id || selectedId); setMessage("Role access saved."); }
  async function matrix(role, action) { if (isReadOnly) return setMessage("Hospital is not yet onboarded. Changes are disabled until a Super Admin approves onboarding."); const permissions = (role.permissions || ["view_documents"]).includes(action) ? role.permissions.filter((item) => item !== action) : [...(role.permissions || ["view_documents"]), action]; await fetch(`/api/admin/hospitals/${hospitalId}/roles/${role.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...role, permissions: permissions.some((item) => item !== "view_documents") && !permissions.includes("view_documents") ? ["view_documents", ...permissions] : permissions }) }); await load(); }
  async function remove(role) { if (isReadOnly) return setMessage("Hospital is not yet onboarded. Changes are disabled until a Super Admin approves onboarding."); if (!window.confirm(`Remove ${role.name}?`)) return; await fetch(`/api/admin/hospitals/${hospitalId}/roles/${role.id}`, { method: "DELETE" }); await load(); }
  const isGroupOpen = (group) => (tab === "roles" && rolesQuery) || openGroups[group] === true;
  const toggleGroup = (group) => setOpenGroups((current) => ({ ...current, [group]: !isGroupOpen(group) }));
  if (tab === "matrix") return <main className="admin-main"><header><div className="brand">{logoPath ? <img className="hospital-brand-logo" src={logoPath} alt={hospitalName} /> : <Building2 size={48} />}<div><p className="eyebrow">Hospital workspace</p><h1>Access control</h1></div></div><p className="intro">Manage role capabilities and document access.</p></header><section className="access-control"><nav className="access-tabs"><button title="Open roles" onClick={() => setTab("roles")}><UsersRound size={16} /> Roles</button><button className="active" title="Open permission matrix"><ShieldCheck size={16} /> Permission matrix</button><button title="Open document access" onClick={() => setTab("scope")}><BookOpenCheck size={16} /> Document access</button></nav>{message && <p className="access-message">{message}</p>}<section className="users-panel permission-table"><div className="panel-heading"><ShieldCheck size={18} /><h2>Permission matrix</h2></div>{grouped.map(([group, members]) => <section className="matrix-group" key={group}><button className="role-group-toggle" title={`Toggle ${group}`} onClick={() => toggleGroup(group)} aria-expanded={isGroupOpen(group)}><span>{group}</span><ChevronDown size={15} /></button>{isGroupOpen(group) && <table><thead><tr><th>Role</th>{actions.map((action) => <th key={action.id}>{action.label}</th>)}<th>Scope</th></tr></thead><tbody>{members.map((role) => <tr key={role.id}><td><strong>{role.name}</strong></td>{actions.map((action) => <td key={action.id}><input type="checkbox" checked={(role.permissions || []).includes(action.id)} onChange={() => matrix(role, action.id)} /></td>)}<td>{role.scopeMode || "selected_documents"}</td></tr>)}</tbody></table>}</section>)}</section></section></main>;
  const roleCards = visibleRoleGroups.map(([group, members]) => <section className="role-group" key={group}><button className="role-group-toggle" onClick={() => toggleGroup(group)} aria-expanded={isGroupOpen(group)}><span>{group}</span><ChevronDown size={15} /></button>{isGroupOpen(group) && members.map((role) => <article className={`role-row ${role.id === selectedId ? "selected" : ""}`} key={role.id} onClick={() => choose(role)}><div><strong>{role.name}</strong><p>{count(role)} document assignments</p><div className="permission-summary">{actions.map((action) => <span className={role.permissions?.includes(action.id) ? "allowed" : "denied"} key={action.id}>{action.label}</span>)}</div></div><div><button className="icon-button" title="Edit role" onClick={(event) => { event.stopPropagation(); choose(role); }}><Pencil size={15} /></button><button className="icon-button" title="Delete role" onClick={(event) => { event.stopPropagation(); remove(role); }}><Trash2 size={15} /></button></div></article>)}</section>);
  return <main className="admin-main"><header><div className="brand">{logoPath ? <img className="hospital-brand-logo" src={logoPath} alt={hospitalName} /> : <Building2 size={48} />}<div><p className="eyebrow">Hospital workspace</p><h1>Access control</h1></div></div><p className="intro">Manage role capabilities and document access.</p></header><section className="access-control"><nav className="access-tabs"><button className={tab === "roles" ? "active" : ""} onClick={() => setTab("roles")}><UsersRound size={16} /> Roles</button><button className={tab === "matrix" ? "active" : ""} onClick={() => setTab("matrix")}><ShieldCheck size={16} /> Permission matrix</button><button className={tab === "scope" ? "active" : ""} onClick={() => setTab("scope")}><BookOpenCheck size={16} /> Document access</button></nav>{message && <p className="access-message">{message}</p>}{tab === "roles" && <section className="role-layout"><section className="users-panel"><div className="panel-heading"><UsersRound size={18} /><h2>Roles</h2><button className="icon-button" title="Add role" onClick={() => { setSelectedId(""); setDraft(blankRole); }}><Plus size={17} /></button></div><div className="role-list grouped-role-list">{roleCards}</div></section><form className="users-panel role-form" onSubmit={save}><div className="panel-heading"><ShieldCheck size={18} /><h2>{selectedRole ? "Role details" : "New role"}</h2></div><label className="role-name">Role name<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required /></label><fieldset className="permission-matrix"><legend>Allowed actions</legend>{actions.map((action) => <label key={action.id}><input type="checkbox" checked={draft.permissions.includes(action.id)} onChange={() => toggleAction(action.id)} /> {action.label}</label>)}</fieldset><button className="primary-button"><Save size={16} /> Save role</button></form></section>}{tab === "matrix" && <section className="users-panel permission-table"><div className="panel-heading"><ShieldCheck size={18} /><h2>Permission matrix</h2></div><table><thead><tr><th>Role</th>{actions.map((action) => <th key={action.id}>{action.label}</th>)}<th>Scope</th></tr></thead><tbody>{grouped.map(([group, members]) => <Fragment key={group}><tr className="role-group-row"><td colSpan={6}>{group}</td></tr>{members.map((role) => <tr key={role.id}><td><strong>{role.name}</strong></td>{actions.map((action) => <td key={action.id}><input type="checkbox" checked={(role.permissions || []).includes(action.id)} onChange={() => matrix(role, action.id)} /></td>)}<td>{count(role)} documents</td></tr>)}</Fragment>)}</tbody></table></section>}{tab === "scope" && <section className="document-access-layout"><aside className="users-panel scope-role-list"><div className="panel-heading"><UsersRound size={18} /><h2>Choose role</h2></div><div className="role-list grouped-role-list">{grouped.map(([group, members]) => <section className="role-group" key={group}><button className="role-group-toggle" onClick={() => toggleGroup(group)} aria-expanded={isGroupOpen(group)}><span>{group}</span><ChevronDown size={15} /></button>{isGroupOpen(group) && members.map((role) => <button className={`scope-role ${role.id === selectedId ? "selected" : ""}`} key={role.id} onClick={() => choose(role)}><span><strong>{role.name}</strong><small>{count(role)} assigned documents</small></span></button>)}</section>)}</div></aside><section className="users-panel scope-editor">{selectedRole && <><div className="panel-heading"><BookOpenCheck size={18} /><h2>{selectedRole.name}</h2><button className="primary-button" onClick={save}><Save size={15} /> Save access</button></div><div className="department-access-grid">{Object.entries(departments).map(([name, items]) => <button key={name} className={`department-access-card ${department === name ? "selected" : ""}`} onClick={() => setDepartment(name)}><span><strong>{name}</strong><small>{(draft.documentAccess[name] || []).length} of {items.length} selected</small></span><span className={complete(name) ? "department-state complete" : (draft.documentAccess[name] || []).length ? "department-state partial" : "department-state"}>{complete(name) ? "All" : (draft.documentAccess[name] || []).length ? "Partial" : "None"}</span></button>)}</div><section className="department-detail"><div><h3>{department}</h3><p>{selectedDocs.length} of {docs.length} selected</p></div><button className="text-button department-toggle" onClick={() => toggleDepartment(department)}>{complete(department) ? "Clear department" : "Select all in department"}</button></section><fieldset className="document-picker scope-picker"><legend>Individual document access</legend>{docs.map((document) => <label key={document.id}><input type="checkbox" checked={selectedDocs.includes(document.id)} onChange={() => toggleDocument(document.id)} /><span><strong>{document.documentName}</strong><small>{document.documentId}</small></span></label>)}</fieldset></>}</section></section>}</section></main>;
}
