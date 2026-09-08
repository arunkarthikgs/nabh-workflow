import { useEffect, useState } from "react";
import { Building2, CheckCircle2, ClipboardCheck, GraduationCap, Layers, RefreshCw, X } from "lucide-react";
import { institutionalProfileFields } from "./hospitalFormFields.js";

function ProfileTab({ hospitalId, details, onSaved, disabled }) {
  const [form, setForm] = useState(() => Object.fromEntries(institutionalProfileFields.map(([key]) => [key, details?.[key] || ""])));
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState("");

  useEffect(() => {
    setForm(Object.fromEntries(institutionalProfileFields.map(([key]) => [key, details?.[key] || ""])));
  }, [details]);

  function uploadLogo(event) {
    const [file] = event.target.files;
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 1_500_000) { setMessage("Use a PNG, JPEG, or WebP logo smaller than 1.5 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setFieldErrors({});
    try {
      const response = await fetch(`/api/admin/hospitals/${encodeURIComponent(hospitalId)}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ details: form, logoDataUrl })
      });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || "Unable to save profile.");
        error.fields = data.fields || {};
        throw error;
      }
      setMessage(data.profileComplete ? "Institutional profile complete." : "Saved. A few required fields are still missing.");
      onSaved(data);
    } catch (err) {
      setMessage(err.message);
      setFieldErrors(err.fields || {});
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={save}>
      <h2>Institutional profile</h2>
      <p>This information drives the accreditation recommendation and the document workspace. Identity and regulatory details (NABH accreditation number, license, PAN/GST) are set once during hospital registration.</p>
      <div className="admin-fields">
        {institutionalProfileFields.map(([key, label, type, options]) => (
          <label key={key} className={fieldErrors[key] ? "field-error" : ""}>
            {label}
            {type === "select" ? (
              <select value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}>
                <option value="">Select</option>
                {options.map((option) => <option key={option}>{option}</option>)}
              </select>
            ) : (
              <input type={type || (key.includes("Email") ? "email" : "text")} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
            )}
            {fieldErrors[key] && <small className="field-error-message">{fieldErrors[key]}</small>}
          </label>
        ))}
      </div>
      <div className="profile-logo-upload">
        <label>Hospital logo<input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={uploadLogo} /></label>
        {logoDataUrl && <img src={logoDataUrl} alt="Selected hospital logo" />}
        <small>PNG, JPEG, or WebP. Maximum size 1.5 MB.</small>
      </div>
      {message && <p className="access-message">{message}</p>}
      <button className="primary-button" type="submit" disabled={saving || disabled}>{saving ? "Saving..." : "Save profile"}</button>
    </form>
  );
}

function AccreditationTab({ hospitalId, profileComplete, disabled }) {
  const [state, setState] = useState(null);
  const [decidedBy, setDecidedBy] = useState("");
  const [decisionNotes, setDecisionNotes] = useState("");
  const [message, setMessage] = useState("");
  const [pendingProgramme, setPendingProgramme] = useState("");

  useEffect(() => {
    fetch(`/api/admin/hospitals/${encodeURIComponent(hospitalId)}/accreditation`)
      .then((response) => response.json())
      .then(setState);
  }, [hospitalId]);

  async function confirmSelection() {
    const programme = pendingProgramme;
    if (!programme || !decidedBy.trim()) { setMessage("Enter the authorised representative's name before confirming."); return; }
    const response = await fetch(`/api/admin/hospitals/${encodeURIComponent(hospitalId)}/accreditation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programme, decidedBy: decidedBy.trim(), notes: decisionNotes.trim() })
    });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error); return; }
    setState((current) => ({ ...current, selection: data.selection }));
    setPendingProgramme("");
    setDecisionNotes("");
    setMessage(data.job ? "Accreditation programme saved. Your document workspace is now being prepared - check the Documents tab shortly." : "Accreditation programme saved.");
  }

  if (!state) return <p className="loading-state"><RefreshCw size={15} className="spin-icon" /> Loading recommendation...</p>;

  return (
    <section className="accreditation-workspace">
      <section className="accreditation-section recommendation-section">
        <div className="accreditation-section-heading"><div><p className="eyebrow">Eligibility assessment</p><h2>Recommended NABH accreditation programme</h2></div><span className={`accreditation-status accreditation-status-${state.recommendation.status}`}>{state.recommendation.status === "eligible" ? "Eligible" : state.recommendation.status === "conditional" ? "Conditional" : "Not eligible"}</span></div>
        <p className="accreditation-intro">Based on the institutional profile recorded for this hospital, the system recommends:</p>
        <div className="recommendation-callout"><CheckCircle2 size={20} /><div><strong>{state.recommendation.programme}</strong><p>{state.recommendation.rationale}</p></div></div>
        {state.recommendation.requirements?.length > 0 && <div className="recommendation-details"><strong>Additional information or evidence required</strong><ul>{state.recommendation.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul></div>}
        {!profileComplete && <p className="access-message">Complete the institutional profile for a more accurate recommendation.</p>}
        <p className="accreditation-disclaimer">This is an eligibility recommendation based on recorded information. Confirm the final programme and documentary evidence with NABH before applying.</p>
        <button className="primary-button" disabled={disabled || Boolean(state.selection) || !state.recommendation.programme || state.recommendation.status === "ineligible"} onClick={() => setPendingProgramme(state.recommendation.programme)}>Use recommended programme</button>
      </section>
      <section className="accreditation-section desired-programme-section">
        <div className="accreditation-section-heading"><div><p className="eyebrow">Programme selection</p><h2>Select the Desired accreditation programme type</h2></div></div>
        <p className="accreditation-intro">Choose the programme your hospital intends to pursue. Your selection will be confirmed before the document workspace is prepared.</p>
        <label className="programme-select-field">Desired accreditation programme<select value={state.selection?.programme || ""} disabled={disabled || Boolean(state.selection)} onChange={(event) => event.target.value && setPendingProgramme(event.target.value)}><option value="">Select a programme type</option>{state.programmes.map((programme) => <option key={programme} value={programme}>{programme}</option>)}</select></label>
        {state.selection && <div className="current-programme"><span>Programme locked after confirmation</span><strong>{state.selection.programme}</strong><small>Confirmed by {state.selection.decidedBy} on {new Date(state.selection.decidedAt).toLocaleDateString()}. Contact a Super Admin if a reset is required.</small></div>}
        {message && <p className="access-message">{message}</p>}
      </section>
      {pendingProgramme && <div className="preview-backdrop" role="presentation" onClick={() => setPendingProgramme("")}><section className="preview-dialog accreditation-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="accreditation-confirmation-title" onClick={(event) => event.stopPropagation()}><div className="preview-header accreditation-confirm-header"><div className="accreditation-confirm-mark"><CheckCircle2 size={20} /></div><div><p className="eyebrow">Confirm programme selection</p><h2 id="accreditation-confirmation-title">{pendingProgramme}</h2></div><button className="icon-button" type="button" title="Close confirmation" onClick={() => setPendingProgramme("")}><X size={18} /></button></div><div className="accreditation-confirm-body"><p>Confirm that this is the accreditation programme your hospital intends to pursue.</p><label>Authorised representative name<input value={decidedBy} onChange={(event) => setDecidedBy(event.target.value)} placeholder="Enter your full name" autoFocus /></label><label>Notes for this hospital<textarea rows={4} value={decisionNotes} onChange={(event) => setDecisionNotes(event.target.value)} placeholder="Add context, scope, or notes for the accreditation decision" /></label><div className="accreditation-confirm-note">The selection will be stored for this hospital and used to prepare its programme-specific document workspace.</div></div><div className="accreditation-confirm-actions"><button className="secondary-button" type="button" onClick={() => setPendingProgramme("")}>Cancel</button><button className="primary-button" type="button" onClick={confirmSelection}><CheckCircle2 size={16} /> Confirm programme</button></div></section></div>}
    </section>
  );
}

const READINESS_COLUMNS = [
  ["not_started", "Not started"],
  ["information_required", "Info required"],
  ["draft_generated", "Draft"],
  ["under_review", "Under review"],
  ["approved", "Approved"],
  ["implemented", "Implemented"],
  ["evidence_available", "Evidence available"]
];

function WorkspaceOverviewTab({ hospitalId, hospitalStatus, onNavigateToDocuments }) {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/admin/hospitals/${encodeURIComponent(hospitalId)}/workspace-overview`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Document repository has not been initialized yet.");
        return data;
      })
      .then(setOverview)
      .catch((err) => setError(err.message));
  }, [hospitalId]);

  if (error) return <p className="access-message">{error}</p>;
  if (!overview) return <p className="loading-state"><RefreshCw size={15} className="spin-icon" /> Loading workspace overview...</p>;
  const categoryRows = Object.entries(overview.categories);
  const columnTotals = Object.fromEntries(READINESS_COLUMNS.map(([status]) => [status, categoryRows.reduce((total, [, counts]) => total + (counts[status] || 0), 0)]));

  return (
    <section className="readiness-dashboard">
      {hospitalStatus === "pending" && <div className="workspace-status-banner pending"><strong>Onboarding pending approval</strong><span>Your hospital profile has been received. A Super Admin must approve onboarding before your organisation is marked active.</span></div>}
      {hospitalStatus === "inactive" && <div className="workspace-status-banner inactive"><strong>Hospital access is inactive</strong><span>Your hospital profile is currently inactive. Contact the platform administrator to restore active status.</span></div>}
      {hospitalStatus === "active" && <div className="workspace-status-banner active"><strong>Hospital is active</strong><span>Your organisation is active and can continue its NABH readiness work.</span></div>}
      <div className="readiness-summary"><div><p className="eyebrow">Workspace readiness</p><h2>NABH implementation dashboard</h2><p>{overview.total} tracked documents across {Object.keys(overview.categories).length} categories.</p></div><div className="readiness-score"><strong>{overview.readinessPercent}%</strong><span>approved or further</span></div></div>
      <div className="readiness-table-wrap"><table className="readiness-table"><thead><tr><th>Category</th>{READINESS_COLUMNS.map(([, label]) => <th key={label}>{label}</th>)}<th>Total</th></tr></thead><tbody>{categoryRows.map(([category, counts]) => { const rowTotal = READINESS_COLUMNS.reduce((total, [status]) => total + (counts[status] || 0), 0); return <tr key={category}><th scope="row">{category}</th>{READINESS_COLUMNS.map(([status, label]) => <td key={status}><button type="button" className={`readiness-cell readiness-${status}`} title={`View ${label.toLowerCase()} documents in ${category}`} onClick={() => onNavigateToDocuments(category, status)}>{counts[status] || 0}</button></td>)}<td className="readiness-total">{rowTotal}</td></tr>; })}</tbody><tfoot><tr><th scope="row">Total</th>{READINESS_COLUMNS.map(([status]) => <td className="readiness-total" key={status}>{columnTotals[status]}</td>)}<td className="readiness-grand-total">{overview.total}</td></tr></tfoot></table></div>
    </section>
  );
}

function ServicesTab({ hospitalId, disabled }) {
  const [trainingCatalog, setTrainingCatalog] = useState([]);
  const [consultingCatalog, setConsultingCatalog] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [form, setForm] = useState({ category: "training", serviceId: "", mode: "virtual", preferredDate: "", notes: "" });
  const [generatedPack, setGeneratedPack] = useState(null);
  const [message, setMessage] = useState("");

  function loadBookings() {
    fetch(`/api/admin/hospitals/${encodeURIComponent(hospitalId)}/bookings`).then((response) => response.json()).then((data) => setBookings(data.bookings || []));
  }

  useEffect(() => {
    fetch("/api/training/catalog").then((response) => response.json()).then((data) => setTrainingCatalog(data.catalog || []));
    fetch("/api/consulting/catalog").then((response) => response.json()).then((data) => setConsultingCatalog(data.catalog || []));
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitalId]);

  const catalog = form.category === "training" ? trainingCatalog : consultingCatalog;

  async function submitBooking(event) {
    event.preventDefault();
    if (disabled) { setMessage("Hospital is not yet onboarded. Changes are disabled until a Super Admin approves onboarding."); return; }
    setMessage("");
    if (!form.serviceId) { setMessage("Choose a service."); return; }
    const response = await fetch(`/api/admin/hospitals/${encodeURIComponent(hospitalId)}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error); return; }
    setMessage(`Requested ${data.booking.serviceName}. A Macula Healthcare expert will confirm the fee and schedule.`);
    loadBookings();
  }

  async function generatePack(serviceId) {
    if (disabled) { setMessage("Hospital is not yet onboarded. Changes are disabled until a Super Admin approves onboarding."); return; }
    const response = await fetch(`/api/admin/hospitals/${encodeURIComponent(hospitalId)}/training/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceId })
    });
    const data = await response.json();
    if (response.ok) setGeneratedPack(data.pack);
  }

  async function attachRecording(bookingId) {
    if (disabled) { setMessage("Hospital is not yet onboarded. Changes are disabled until a Super Admin approves onboarding."); return; }
    const reference = window.prompt("Recording URL or storage path:");
    if (!reference) return;
    const consent = window.confirm("Confirm attendee/staff consent was obtained to record and store this session.");
    const response = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/recording`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent, reference })
    });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error); return; }
    loadBookings();
  }

  return (
    <section className="admin-form">
      <h2>Training &amp; Macula Healthcare consulting</h2>
      {disabled && <p className="access-message">Hospital is not yet onboarded. Changes are disabled until a Super Admin approves onboarding.</p>}
      <p>Generate hospital-customized training material yourself, or book a Macula Healthcare expert for training and consulting services.</p>

      <div className="admin-fields">
        <label>Category
          <select value={form.category} disabled={disabled} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value, serviceId: "" }))}>
            <option value="training">Training</option>
            <option value="consulting">Consulting</option>
          </select>
        </label>
        <label>Service
          <select value={form.serviceId} disabled={disabled} onChange={(event) => setForm((current) => ({ ...current, serviceId: event.target.value }))}>
            <option value="">Select a service</option>
            {catalog.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>Mode
          <select value={form.mode} disabled={disabled} onChange={(event) => setForm((current) => ({ ...current, mode: event.target.value }))}>
            <option value="virtual">Virtual</option>
            <option value="onsite">Onsite</option>
          </select>
        </label>
        <label>Preferred date<input type="date" disabled={disabled} value={form.preferredDate} onChange={(event) => setForm((current) => ({ ...current, preferredDate: event.target.value }))} /></label>
      </div>
      <label>Notes<textarea rows={2} disabled={disabled} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
      <div className="toolbar">
        <button className="primary-button" disabled={disabled} onClick={submitBooking}>Request booking</button>
        {form.category === "training" && form.serviceId && <button className="primary-button" disabled={disabled} type="button" title="Generate training material" onClick={() => generatePack(form.serviceId)}><GraduationCap size={16} /> Generate training material</button>}
      </div>
      {message && <p className="access-message">{message}</p>}

      {generatedPack && (
        <div className="access-message">
          <strong>{generatedPack.topic}</strong>
          <p>Presentation outline: {generatedPack.presentationOutline.join(" → ")}</p>
          <p>Handout: {generatedPack.handout}</p>
          <p>Assessment questions: {generatedPack.assessmentQuestions.join(" | ")}</p>
        </div>
      )}

      <h3>Booking requests</h3>
      {bookings.length === 0 ? <p className="empty">No bookings yet.</p> : (
        <table>
          <thead><tr><th>Service</th><th>Category</th><th>Mode</th><th>Preferred date</th><th>Status</th><th>Recording</th></tr></thead>
          <tbody>
            {bookings.map((booking) => (
              <tr key={booking.id}>
                <td>{booking.serviceName}</td>
                <td>{booking.category}</td>
                <td>{booking.mode}</td>
                <td>{booking.preferredDate || "-"}</td>
                <td>{booking.status}</td>
                <td>
                  {booking.category === "training" ? (
                    booking.recording ? <span title={booking.recording.reference}>Stored</span> : <button className="icon-button" disabled={disabled} title="Attach recording" onClick={() => attachRecording(booking.id)}>Attach</button>
                  ) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function PlatformWorkspace({ hospitalId, hospitalName, onNavigateToDocuments, homeOnly = false }) {
  const [tab, setTab] = useState(homeOnly ? "overview" : "profile");
  const [hospital, setHospital] = useState(null);

  function loadHospital() {
    fetch("/api/admin/hospitals")
      .then((response) => response.json())
      .then((data) => setHospital((data.hospitals || []).find((item) => item.id === hospitalId) || null));
  }

  useEffect(loadHospital, [hospitalId]);
  useEffect(() => { setTab(homeOnly ? "overview" : "profile"); }, [homeOnly]);

  const details = hospital?.details;
  const profileComplete = Boolean(details && ["hospitalType", "ownershipType", "operationalBeds", "addressLine1", "city", "state", "pinCode", "mainPhone", "officialEmail"].every((field) => (details[field] || "").toString().trim()));

  return (
    <main className="admin-main">
      <header>
        <div className="brand">
          <Building2 size={20} />
          <div>
            <p className="eyebrow">NABH readiness platform</p>
            <h1>{hospitalName} readiness workspace</h1>
          </div>
        </div>
      </header>
      {!homeOnly && <div className="access-tabs">
        <button className={tab === "profile" ? "active" : ""} title="Open institutional profile" onClick={() => setTab("profile")}><Building2 size={14} /> Institutional profile</button>
        <button className={tab === "accreditation" ? "active" : ""} title="Open accreditation" onClick={() => setTab("accreditation")}><ClipboardCheck size={14} /> Accreditation</button>
        <button className={tab === "services" ? "active" : ""} title="Open training and consulting" onClick={() => setTab("services")}><GraduationCap size={14} /> Training &amp; consulting</button>
      </div>}
      {!homeOnly && !profileComplete && tab !== "profile" && <p className="access-message">Complete your institutional profile before finalizing AI-generated documents.</p>}
      {hospital?.status !== "active" && !homeOnly && <p className="access-message">Hospital is not yet onboarded. Changes are disabled until a Super Admin approves onboarding.</p>}
      {tab === "profile" && <ProfileTab hospitalId={hospitalId} details={details} onSaved={loadHospital} disabled={hospital?.status !== "active"} />}
      {tab === "accreditation" && <AccreditationTab hospitalId={hospitalId} profileComplete={profileComplete} disabled={hospital?.status !== "active"} />}
      {tab === "overview" && <WorkspaceOverviewTab hospitalId={hospitalId} hospitalStatus={hospital?.status || "pending"} onNavigateToDocuments={onNavigateToDocuments} />}
      {tab === "services" && <ServicesTab hospitalId={hospitalId} disabled={hospital?.status !== "active"} />}
    </main>
  );
}
