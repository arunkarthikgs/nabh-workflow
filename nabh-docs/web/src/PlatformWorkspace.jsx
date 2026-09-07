import { useEffect, useState } from "react";
import { Building2, ClipboardCheck, GraduationCap, Layers, X } from "lucide-react";
import { institutionalProfileFields } from "./hospitalFormFields.js";

function ProfileTab({ hospitalId, details, onSaved }) {
  const [form, setForm] = useState(() => Object.fromEntries(institutionalProfileFields.map(([key]) => [key, details?.[key] || ""])));
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/hospitals/${encodeURIComponent(hospitalId)}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ details: form })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save profile.");
      setMessage(data.profileComplete ? "Institutional profile complete." : "Saved. A few required fields are still missing.");
      onSaved(data);
    } catch (err) {
      setMessage(err.message);
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
          <label key={key}>
            {label}
            {type === "select" ? (
              <select value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}>
                <option value="">Select</option>
                {options.map((option) => <option key={option}>{option}</option>)}
              </select>
            ) : (
              <input type={type || (key.includes("Email") ? "email" : "text")} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
            )}
          </label>
        ))}
      </div>
      {message && <p className="access-message">{message}</p>}
      <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save profile"}</button>
    </form>
  );
}

function AccreditationTab({ hospitalId, profileComplete }) {
  const [state, setState] = useState(null);
  const [decidedBy, setDecidedBy] = useState("");
  const [message, setMessage] = useState("");
  const [pendingProgramme, setPendingProgramme] = useState("");

  useEffect(() => {
    fetch(`/api/admin/hospitals/${encodeURIComponent(hospitalId)}/accreditation`)
      .then((response) => response.json())
      .then(setState);
  }, [hospitalId]);

  async function confirmSelection() {
    const programme = pendingProgramme;
    if (!programme) return;
    const response = await fetch(`/api/admin/hospitals/${encodeURIComponent(hospitalId)}/accreditation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programme, decidedBy })
    });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error); return; }
    setState((current) => ({ ...current, selection: data.selection }));
    setPendingProgramme("");
    setMessage(data.job ? "Accreditation programme saved. Your document workspace is now being prepared - check the Documents tab shortly." : "Accreditation programme saved.");
  }

  if (!state) return <p className="empty">Loading recommendation...</p>;

  return (
    <section className="admin-form">
      <h2>Recommended NABH accreditation programme</h2>
      <p className="access-message">Eligibility screening based on the facility profile. Confirm the final programme and all documentary evidence with NABH before applying.</p>
      {!profileComplete && <p className="access-message">Complete the institutional profile for a more accurate recommendation.</p>}
      <p><strong>{state.recommendation.programme}</strong></p>
      <p>{state.recommendation.rationale}</p>
      <p className="access-message"><strong>Status: {state.recommendation.status === "eligible" ? "Eligible based on recorded information" : state.recommendation.status === "conditional" ? "More evidence required" : "Not eligible based on recorded information"}</strong></p>
      {state.recommendation.requirements?.length > 0 && <ul className="access-message">{state.recommendation.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul>}
      <label>Your name (for the decision record)<input value={decidedBy} onChange={(event) => setDecidedBy(event.target.value)} /></label>
      <label>NABH accreditation programme
        <select value={state.selection?.programme || ""} onChange={(event) => event.target.value && setPendingProgramme(event.target.value)}>
          <option value="">Select a programme</option>
          {state.programmes.map((programme) => <option key={programme} value={programme}>{programme}</option>)}
        </select>
      </label>
      <div className="toolbar">
        <button className="primary-button" disabled={!state.recommendation.programme || state.recommendation.status === "ineligible"} onClick={() => setPendingProgramme(state.recommendation.programme)}>Accept recommendation</button>
      </div>
      {state.selection && <p className="access-message">Currently pursuing: <strong>{state.selection.programme}</strong> (selected by {state.selection.decidedBy} on {new Date(state.selection.decidedAt).toLocaleDateString()})</p>}
      {message && <p className="access-message">{message}</p>}
      {pendingProgramme && <div className="preview-backdrop" role="presentation" onClick={() => setPendingProgramme("")}><section className="preview-dialog accreditation-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="accreditation-confirmation-title" onClick={(event) => event.stopPropagation()}><div className="preview-header"><div><p className="eyebrow">Confirm NABH accreditation</p><h2 id="accreditation-confirmation-title">{pendingProgramme}</h2></div><button className="icon-button" type="button" title="Close confirmation" onClick={() => setPendingProgramme("")}><X size={18} /></button></div><div className="accreditation-confirm-body"><p>This saves the accreditation decision and begins preparing the document workspace for this programme.</p><p>You can change the programme later. Doing so will resynchronize the workspace with the newly selected programme.</p></div><div className="accreditation-confirm-actions"><button className="secondary-button" type="button" onClick={() => setPendingProgramme("")}>Cancel</button><button className="primary-button" type="button" onClick={confirmSelection}>Confirm accreditation</button></div></section></div>}
    </section>
  );
}

function WorkspaceOverviewTab({ hospitalId }) {
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
  if (!overview) return <p className="empty">Loading workspace overview...</p>;

  return (
    <section className="admin-form">
      <h2>NABH implementation workspace</h2>
      <p>{overview.total} tracked documents across {Object.keys(overview.categories).length} categories &middot; <strong>{overview.readinessPercent}%</strong> approved or further along.</p>
      <table>
        <thead>
          <tr><th>Category</th><th>Not Started</th><th>Info Required</th><th>Draft</th><th>Under Review</th><th>Approved</th><th>Implemented</th><th>Evidence Available</th></tr>
        </thead>
        <tbody>
          {Object.entries(overview.categories).map(([category, counts]) => (
            <tr key={category}>
              <td>{category}</td>
              <td>{counts.not_started}</td>
              <td>{counts.information_required}</td>
              <td>{counts.draft_generated}</td>
              <td>{counts.under_review}</td>
              <td>{counts.approved}</td>
              <td>{counts.implemented}</td>
              <td>{counts.evidence_available}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ServicesTab({ hospitalId }) {
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
    const response = await fetch(`/api/admin/hospitals/${encodeURIComponent(hospitalId)}/training/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceId })
    });
    const data = await response.json();
    if (response.ok) setGeneratedPack(data.pack);
  }

  async function attachRecording(bookingId) {
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
      <p>Generate hospital-customized training material yourself, or book a Macula Healthcare expert for training and consulting services.</p>

      <div className="admin-fields">
        <label>Category
          <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value, serviceId: "" }))}>
            <option value="training">Training</option>
            <option value="consulting">Consulting</option>
          </select>
        </label>
        <label>Service
          <select value={form.serviceId} onChange={(event) => setForm((current) => ({ ...current, serviceId: event.target.value }))}>
            <option value="">Select a service</option>
            {catalog.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>Mode
          <select value={form.mode} onChange={(event) => setForm((current) => ({ ...current, mode: event.target.value }))}>
            <option value="virtual">Virtual</option>
            <option value="onsite">Onsite</option>
          </select>
        </label>
        <label>Preferred date<input type="date" value={form.preferredDate} onChange={(event) => setForm((current) => ({ ...current, preferredDate: event.target.value }))} /></label>
      </div>
      <label>Notes<textarea rows={2} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
      <div className="toolbar">
        <button className="primary-button" onClick={submitBooking}>Request booking</button>
        {form.category === "training" && form.serviceId && <button className="primary-button" type="button" onClick={() => generatePack(form.serviceId)}><GraduationCap size={16} /> Generate training material</button>}
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
                    booking.recording ? <span title={booking.recording.reference}>Stored</span> : <button className="icon-button" title="Attach recording" onClick={() => attachRecording(booking.id)}>Attach</button>
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

export default function PlatformWorkspace({ hospitalId, hospitalName }) {
  const [tab, setTab] = useState("profile");
  const [hospital, setHospital] = useState(null);

  function loadHospital() {
    fetch("/api/admin/hospitals")
      .then((response) => response.json())
      .then((data) => setHospital((data.hospitals || []).find((item) => item.id === hospitalId) || null));
  }

  useEffect(loadHospital, [hospitalId]);

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
      <div className="access-tabs">
        <button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}><Building2 size={14} /> Institutional profile</button>
        <button className={tab === "accreditation" ? "active" : ""} onClick={() => setTab("accreditation")}><ClipboardCheck size={14} /> Accreditation</button>
        <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}><Layers size={14} /> Workspace overview</button>
        <button className={tab === "services" ? "active" : ""} onClick={() => setTab("services")}><GraduationCap size={14} /> Training &amp; consulting</button>
      </div>
      {!profileComplete && tab !== "profile" && <p className="access-message">Complete your institutional profile before finalizing AI-generated documents.</p>}
      {tab === "profile" && <ProfileTab hospitalId={hospitalId} details={details} onSaved={loadHospital} />}
      {tab === "accreditation" && <AccreditationTab hospitalId={hospitalId} profileComplete={profileComplete} />}
      {tab === "overview" && <WorkspaceOverviewTab hospitalId={hospitalId} />}
      {tab === "services" && <ServicesTab hospitalId={hospitalId} />}
    </main>
  );
}
