import { useEffect, useState } from "react";
import { Building2, KeyRound, Mail, UserCircle } from "lucide-react";

const profileFields = [
  ["userId", "User ID"],
  ["email", "Email"],
  ["role", "Role"],
  ["mobileNumber", "Mobile number"],
  ["department", "Department"],
  ["employeeId", "Employee ID"],
  ["employmentType", "Employment type"],
  ["address", "Address"]
];

export default function MyProfile({ hospitalName }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    fetch("/api/admin/me/profile")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load your profile.");
        return result;
      })
      .then(setProfile)
      .catch((requestError) => setError(requestError.message));
  }, []);

  async function changePassword(event) {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordError("");
    if (passwords.newPassword !== passwords.confirmPassword) return setPasswordError("New password and confirmation do not match.");
    setSavingPassword(true);
    try {
      const response = await fetch("/api/admin/me/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(passwords) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update your password.");
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordMessage(result.message);
    } catch (requestError) { setPasswordError(requestError.message); } finally { setSavingPassword(false); }
  }

  if (error) return <main className="admin-main"><p className="status error">{error}</p></main>;
  if (!profile) return <main className="admin-main"><p className="loading-state"><UserCircle size={20} /> Loading your profile...</p></main>;

  return (
    <main className="admin-main my-profile-page">
      <header>
        <div className="brand">
          <UserCircle size={46} />
          <div><p className="eyebrow">Account</p><h1>My Profile</h1></div>
        </div>
        <p className="intro">View your account details and hospital assignment.</p>
      </header>
      <section className="users-panel my-profile-card">
        <div className="my-profile-heading">
          <div className="profile-avatar"><UserCircle size={38} /></div>
          <div><h2>{profile.user.name || "User"}</h2><p>{profile.user.email || "No email recorded"}</p></div>
        </div>
        <div className="profile-hospital-banner"><Building2 size={18} /><span><strong>{profile.hospital.name}</strong><small>{profile.hospital.code} · {profile.hospital.status}</small></span><Mail size={16} /></div>
        <div className="profile-details-grid">
          {profileFields.map(([key, label]) => <div className="profile-detail" key={key}><small>{label}</small><strong>{profile.user[key] || "Not provided"}</strong></div>)}
        </div>
      </section>
      <section className="users-panel my-profile-card password-card">
        <div className="panel-heading"><KeyRound size={18} /><h2>Reset password</h2></div>
        <form className="profile-form" onSubmit={changePassword}>
          <label>Current password<input type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => setPasswords((current) => ({ ...current, currentPassword: event.target.value }))} required /></label>
          <label>New password<input type="password" autoComplete="new-password" minLength={8} value={passwords.newPassword} onChange={(event) => setPasswords((current) => ({ ...current, newPassword: event.target.value }))} required /></label>
          <label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} value={passwords.confirmPassword} onChange={(event) => setPasswords((current) => ({ ...current, confirmPassword: event.target.value }))} required /></label>
          {passwordError && <p className="status error">{passwordError}</p>}
          {passwordMessage && <p className="access-message">{passwordMessage}</p>}
          <button className="primary-button" type="submit" disabled={savingPassword}><KeyRound size={16} /> {savingPassword ? "Updating..." : "Update password"}</button>
        </form>
      </section>
    </main>
  );
}
