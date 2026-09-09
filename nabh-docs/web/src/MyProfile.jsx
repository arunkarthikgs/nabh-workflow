import { useEffect, useState } from "react";
import { Building2, Mail, UserCircle } from "lucide-react";

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
    </main>
  );
}
