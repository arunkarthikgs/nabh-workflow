import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import hospitalLogo from "./assets/nabh-readiness-system.png";

export default function SetPassword({ token, onComplete }) {
  const [state, setState] = useState({ status: "loading" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [hospitalCode, setHospitalCode] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/set-password/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "This setup link is invalid or has expired.");
        setHospitalCode(data.hospitalCode || "");
        setAddressLine1(data.address || "");
        setCity(data.city || "");
        setContactPhone(data.contactPhone || "");
        setState({ status: "ready", ...data });
      })
      .catch((err) => setState({ status: "error", error: err.message }));
  }, [token]);

  async function submit(event) {
    event.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, hospitalCode: hospitalCode.trim().toUpperCase(), addressLine1: addressLine1.trim(), city: city.trim(), contactPhone: contactPhone.trim() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to set your password.");
      onComplete(data.session);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (state.status === "loading") return <main className="login-main"><p className="empty">Checking your setup link...</p></main>;
  if (state.status === "error") {
    return (
      <main className="login-main">
        <section className="login-intro">
          <div className="login-mark"><ShieldCheck size={20} /></div>
          <p className="eyebrow">Set password</p>
          <h1>This link can't be used.</h1>
          <p>{state.error}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-main">
      <header>
        <div className="brand">
          <img src={hospitalLogo} alt="NABH Readiness System" />
          <div><p className="eyebrow">NABH readiness platform</p><h1>Complete hospital registration</h1></div>
        </div>
        <p className="intro">Review your hospital details, choose a hospital code, and set your password to activate the administrator account.</p>
      </header>
      <form className="admin-form registration-form registration-activation-form" onSubmit={submit}>
        <section>
          <h3>Hospital and administrator details</h3>
          <div className="admin-fields">
            <label>Hospital name<input value={state.hospitalName} readOnly /></label>
            <label>Hospital address<input value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} required /></label>
            <label>Hospital city<input value={city} onChange={(event) => setCity(event.target.value)} required /></label>
            <label>Hospital Admin name<input value={state.adminName} readOnly /></label>
            <label>Hospital email<input value={state.email} readOnly /></label>
            <label>Contact phone<input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} required /></label>
          </div>
        </section>
        <section>
          <h3>Hospital code</h3>
          <div className="admin-fields">
            <label>Hospital code<input value={hospitalCode} maxLength={4} pattern="[A-Za-z0-9]{4}" onChange={(event) => setHospitalCode(event.target.value.toUpperCase())} required /></label>
          </div>
          <p className="access-message">Hospital code must be exactly four letters or numbers.</p>
        </section>
        <section>
          <h3>Set password</h3>
          <div className="admin-fields">
            <label>New password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required /></label>
            <label>Confirm password<input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" required /></label>
          </div>
        </section>
        {error && <p className="status error">{error}</p>}
        <button className="primary-button" disabled={submitting}>{submitting ? "Completing registration..." : "Complete registration"} <ArrowRight size={16} /></button>
      </form>
    </main>
  );
}
