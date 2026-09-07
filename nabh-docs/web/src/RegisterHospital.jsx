import { useState } from "react";
import { ArrowRight, Building2 } from "lucide-react";
import hospitalLogo from "./assets/nabh-readiness-system.png";
import { emptyHospitalDetails } from "./hospitalFormFields.js";

const blankForm = () => ({ name: "", code: "", adminName: "", adminEmail: "", logoDataUrl: "", details: emptyHospitalDetails() });

export default function RegisterHospital({ onBackToLogin }) {
  const [form, setForm] = useState(blankForm);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const change = (event) => {
    const { name, value } = event.target;
    setForm((current) => (name in current.details ? { ...current, details: { ...current.details, [name]: value } } : { ...current, [name]: value }));
  };

  function uploadLogo(event) {
    const [file] = event.target.files;
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 1_500_000) { setError("Use a PNG, JPEG, or WebP logo smaller than 1.5 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, logoDataUrl: reader.result }));
    reader.readAsDataURL(file);
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, acceptedTerms, location: [form.details.city, form.details.state].filter(Boolean).join(", ") })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to register hospital.");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <main className="login-main">
        <section className="login-intro">
          <div className="login-mark"><Building2 size={20} /></div>
          <p className="eyebrow">Registration complete</p>
          <h1>{result.hospital.name} is ready to explore the platform.</h1>
          <p>Your hospital profile has been created. A password setup email is being sent to <strong>{result.hospital.users[0]?.email}</strong>.</p>
        </section>
        <form className="login-panel" onSubmit={(event) => event.preventDefault()}>
          <img src={hospitalLogo} alt="NABH Docs" className="login-logo" />
          <p className="eyebrow">Next step</p>
          <h2>Check your email</h2>
          <p className="access-message">User ID: <strong>{result.hospital.users[0]?.userId || "Assigned after activation"}</strong><br />Hospital code: <strong>{result.hospital.code}</strong></p>
          {result.email?.transport === "pending" && <p className="access-message">Email delivery is being completed in the background. It may take a moment to arrive.</p>}
          {result.warnings?.map((warning) => <p className="access-message" key={warning}>{warning}</p>)}
          {result.repository?.provisioning && <p className="access-message">Your document workspace is being prepared in the background and will be ready shortly after you sign in.</p>}
          {result.email?.transport === "dev-outbox" && <p className="access-message">Local dev mode: no SMTP is configured, so the email was written to <code>output/outbox/{result.email.file}</code> instead of being delivered. Open that file to find the setup link.</p>}
          {result.email?.previewUrl && <p className="access-message">Test SMTP mode: no real inbox receives this email. <a href={result.email.previewUrl} target="_blank" rel="noopener noreferrer">View the sent email</a>.</p>}
          <button className="login-submit" onClick={onBackToLogin}>Back to sign in <ArrowRight size={16} /></button>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-main">
      <header>
        <div className="brand">
          <Building2 size={46} />
          <div>
            <p className="eyebrow">NABH readiness platform</p>
            <h1>Register your hospital</h1>
          </div>
        </div>
        <p className="intro">Same identity and regulatory details captured when our team onboards a hospital. Complete the rest of your institutional profile after signing in to get your accreditation recommendation and document workspace.</p>
      </header>
      <form className="admin-form registration-form" onSubmit={submit}>
        <section>
          <h3>Administrator account</h3>
          <div className="admin-fields">
            <label>Your name <b>*</b><input name="adminName" value={form.adminName} onChange={change} required /></label>
            <label>Your email <b>*</b><input name="adminEmail" type="email" value={form.adminEmail} onChange={change} required /></label>
          </div>
        </section>
        <section>
          <h3>Hospital identity</h3>
          <div className="admin-fields">
            <label>Legal hospital name <b>*</b><input name="name" value={form.name} onChange={change} required /></label>
            <label>Hospital logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo} /></label>
            {form.logoDataUrl && <img className="hospital-mini-logo" src={form.logoDataUrl} alt="Hospital logo" />}
          </div>
        </section>
        <p className="access-message">Accreditation and regulatory information can be completed after registration in the Institutional Profile.</p>
        <label className="terms-checkbox"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required /> I accept the <a href="https://nabhpulse.com/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and <a href="https://nabhpulse.com/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</label>
        {error && <p className="status error">{error}</p>}
        <div className="toolbar">
          <button className="primary-button" disabled={submitting}><ArrowRight size={16} /> {submitting ? "Registering..." : "Create account"}</button>
          <button type="button" className="primary-button" onClick={onBackToLogin}>Back to sign in</button>
        </div>
      </form>
    </main>
  );
}
