import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Calendar, CheckCircle2, FileText, KeyRound, Lock, ShieldCheck } from "lucide-react";
import hospitalLogo from "./assets/nabh-readiness-system.png";

const exampleAccounts = [
  ["Super Admin", "superadmin", "", "Admin@123"],
  ["Aarogyam Hospital", "10000000", "dr.ananya.rao.jph@example.test", "Hospital@123"],
  ["Asha Oncology Hospital", "10000011", "dr.ananya.rao.sch@example.test", "Hospital@123"],
  ["Dhanvantari Health Clinic", "10000021", "dr.ananya.rao.nhm@example.test", "Hospital@123"],
  ["Kaveri Cardiac Institute", "10000031", "dr.ananya.rao.mmh@example.test", "Hospital@123"],
  ["Lotus Eye Care", "10000042", "dr.ananya.rao.clh@example.test", "Hospital@123"],
  ["Maitri Mental Health", "10000052", "dr.ananya.rao.kvh@example.test", "Hospital@123"],
  ["Prana Mother Child Care", "10000062", "dr.ananya.rao.trh@example.test", "Hospital@123"]
];

const loginSlideSources = ["/home-1.png", "/home-2.png", "/home-3.png"];

function LoginVisual() {
  const [slides, setSlides] = useState(loginSlideSources);
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return undefined;
    const timer = window.setInterval(() => setActiveSlide((current) => (current + 1) % slides.length), 6000);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  useEffect(() => {
    if (activeSlide >= slides.length) setActiveSlide(0);
  }, [activeSlide, slides.length]);

  if (!slides.length) return null;
  return <div className="login-visual" aria-label="NABH readiness platform preview">
    {slides.map((source, index) => <img key={source} className={index === activeSlide ? "active" : ""} src={source} alt="Hospital registration and accreditation workspace" onError={() => setSlides((current) => current.filter((item) => item !== source))} />)}
    {slides.length > 1 && <div className="login-visual-dots">{slides.map((source, index) => <button key={source} className={index === activeSlide ? "active" : ""} type="button" aria-label={`Show preview ${index + 1}`} onClick={() => setActiveSlide(index)} />)}</div>}
  </div>;
}

export default function LoginGate({ onLogin, onShowRegister }) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetting, setResetting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const response = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: userId.trim(), email: userId.trim(), password }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Invalid credentials."); return; }
    onLogin(data.session);
  }

  async function requestReset(event) {
    event.preventDefault();
    setResetting(true); setResetMessage(""); setError("");
    try {
      const response = await fetch("/api/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: resetIdentifier.trim(), email: resetIdentifier.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to request a password reset.");
      setResetMessage(data.message);
    } catch (requestError) { setError(requestError.message); } finally { setResetting(false); }
  }

  function showReset() { setShowForgotPassword(true); setError(""); setResetMessage(""); }
  function showSignIn() { setShowForgotPassword(false); setError(""); setResetMessage(""); }

  return <main className="login-main">
    <section className="login-intro">
      <div className="login-clinical-panel">
        <div className="login-platform-brand"><div className="login-mark"><ShieldCheck size={20} /></div><div><strong>NABH Docs</strong><span>5th Edition Standards Hub</span></div><b>v5.0</b></div>
        <p className="eyebrow">Secure accreditation workspace</p>
        <h1>Unified healthcare accreditation and audit repository.</h1>
        <p>Centralize standard operating procedures, clinical indicators, objective elements, and evidence logs for institutional compliance.</p>
        <div className="login-readiness-card">
          <div className="login-readiness-heading"><div><strong>Audit readiness workspace</strong><span>Controlled documentation and review cycles</span></div><b>Ready</b></div>
          <div className="login-readiness-bar"><span /></div>
          <div className="login-readiness-items"><span><CheckCircle2 size={14} /> Templates indexed</span><span><Calendar size={14} /> Review cycles tracked</span></div>
        </div>
        <div className="login-security-banner"><ShieldCheck size={16} /><span><strong>Governed access:</strong> revision history, timestamps, and document ownership stay visible to authorized teams.</span></div>
        <div className="login-note"><FileText size={16} /><span>Master list of documents</span></div>
        <LoginVisual />
        <div className="login-security-stamp"><span><Lock size={13} /> Confidentiality and access governed</span><code>NABH-SEC-5TH-ED</code></div>
      </div>
    </section>
    <form className="login-panel" onSubmit={showForgotPassword ? requestReset : submit}>
      <img src={hospitalLogo} alt="NABH Docs" className="login-logo" />
      <p className="eyebrow">Secure workspace access</p>
      <h2>{showForgotPassword ? "Reset your password" : "Sign In"}</h2>
      {showForgotPassword ? <>
        <p className="login-form-copy">Enter your email or user ID and we will send the password reset link to your registered email address.</p>
        <label>Email or User ID<input value={resetIdentifier} onChange={(event) => setResetIdentifier(event.target.value)} autoComplete="username" autoFocus required /></label>
        {error && <p className="status error">{error}</p>}{resetMessage && <p className="access-message">{resetMessage}</p>}
        <button className="login-submit" disabled={resetting}><KeyRound size={16} /> {resetting ? "Sending link..." : "Send reset link"}</button>
        <button type="button" className="login-back-button" onClick={showSignIn}><ArrowLeft size={15} /> Back to sign in</button>
      </> : <>
        <p className="login-form-copy">Sign in to continue managing hospital records and accreditation workflows.</p>
        <label>User ID or email<input value={userId} onChange={(event) => setUserId(event.target.value)} autoComplete="username" /></label>
        <div className="login-password-row"><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label><button type="button" className="login-inline-forgot" onClick={showReset}>Forgot password?</button></div>
        {error && <p className="status error">{error}</p>}
        <button className="login-submit">Continue <ArrowRight size={16} /></button>
        {onShowRegister && <button type="button" className="login-submit" style={{ background: "transparent", color: "#3547d1" }} onClick={onShowRegister}>New hospital? Register here</button>}
        <div className="example-logins"><p>Example accounts</p>{exampleAccounts.map(([label, id, email, secret]) => <button type="button" key={id} onClick={() => { setUserId(id); setPassword(secret); setError(""); }}><span>{label}</span><code>{id}{email && ` · ${email}`}</code></button>)}</div>
        <p className="login-hint">Hospital administrator passwords use <code>Hospital@123</code>.</p>
      </>}
    </form>
  </main>;
}
