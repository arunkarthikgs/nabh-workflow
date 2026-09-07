import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import hospitalLogo from "./assets/nabh-readiness-system.png";

export default function SetPassword({ token, onComplete }) {
  const [state, setState] = useState({ status: "loading" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/set-password/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "This setup link is invalid or has expired.");
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
        body: JSON.stringify({ token, password })
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
    <main className="login-main">
      <section className="login-intro">
        <div className="login-mark"><ShieldCheck size={20} /></div>
        <p className="eyebrow">Activate your account</p>
        <h1>Set your password for {state.hospitalName}.</h1>
        <p>Signing in as {state.email}. Once your password is set, you'll be taken straight to your hospital home page.</p>
      </section>
      <form className="login-panel" onSubmit={submit}>
        <img src={hospitalLogo} alt="NABH Docs" className="login-logo" />
        <p className="eyebrow">First-time setup</p>
        <h2>Choose a password</h2>
        <label>New password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label>
        <label>Confirm password<input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" /></label>
        {error && <p className="status error">{error}</p>}
        <button className="login-submit" disabled={submitting}>{submitting ? "Setting password..." : "Set password & continue"} <ArrowRight size={16} /></button>
      </form>
    </main>
  );
}
