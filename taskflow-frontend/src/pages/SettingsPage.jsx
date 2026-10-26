import { useState } from "react";
import api from "../api/api";
import Layout from "../components/Layout";
import { getCurrentUser, saveCurrentUser } from "../utils/taskHelpers";

const roleColor = {
  Admin: "bg-purple-100 text-purple-700",
  Member: "bg-blue-100 text-blue-700",
};

// Small success / error banner
function Message({ message }) {
  if (!message.text) return null;
  const style =
    message.type === "success"
      ? "bg-green-50 text-green-700"
      : "bg-red-50 text-red-700";
  return (
    <p className={`${style} text-sm rounded-md px-4 py-2 mb-4`}>
      {message.text}
    </p>
  );
}

function SettingsPage() {
  const [user, setUser] = useState(getCurrentUser());

  // Profile form
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [profileMessage, setProfileMessage] = useState({ type: "", text: "" });
  const [savingProfile, setSavingProfile] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ type: "", text: "" });
  const [savingPassword, setSavingPassword] = useState(false);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileMessage({ type: "", text: "" });

    if (!name.trim() || !email.trim()) {
      setProfileMessage({ type: "error", text: "Name and email are required" });
      return;
    }
    if (name.trim() === user.name && email.trim() === user.email) {
      setProfileMessage({ type: "error", text: "No changes to save" });
      return;
    }

    setSavingProfile(true);
    try {
      const response = await api.put("/users/me", {
        name: name.trim(),
        email: email.trim(),
      });
      const updated = saveCurrentUser({
        name: response.data.name,
        email: response.data.email,
      });
      setUser(updated);
      setProfileMessage({ type: "success", text: "Profile updated" });
    } catch (err) {
      console.error("Failed to update profile:", err);
      setProfileMessage({
        type: "error",
        text: err.response?.data?.message || "Could not update profile",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordMessage({ type: "", text: "" });

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMessage({ type: "error", text: "Please fill in all password fields" });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMessage({
        type: "error",
        text: "New password must be at least 8 characters",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "New passwords do not match" });
      return;
    }

    setSavingPassword(true);
    try {
      await api.put("/users/me/password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage({ type: "success", text: "Password updated successfully" });
    } catch (err) {
      console.error("Failed to change password:", err);
      setPasswordMessage({
        type: "error",
        text: err.response?.data?.message || "Could not change password",
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const inputClass =
    "w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const passwordType = showPasswords ? "text" : "password";

  return (
    <Layout>
      <div className="p-8 flex-1">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Settings</h2>

        <div className="max-w-xl flex flex-col gap-6">
          {/* Profile */}
          <form
            onSubmit={handleProfileSubmit}
            className="bg-white p-6 rounded-lg shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Profile</h3>
              <span
                className={`text-xs px-2 py-1 rounded-full font-medium ${roleColor[user?.role]}`}
              >
                {user?.role}
              </span>
            </div>

            <Message message={profileMessage} />

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
                <p className="text-xs text-gray-400 mt-1">
                  You log in with this email.
                </p>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-md hover:bg-blue-700 transition disabled:opacity-60"
                >
                  {savingProfile ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </div>
          </form>

          {/* Password */}
          <form
            onSubmit={handlePasswordSubmit}
            className="bg-white p-6 rounded-lg shadow-sm"
          >
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Change Password
            </h3>

            <Message message={passwordMessage} />

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current password
                </label>
                <input
                  type={passwordType}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New password
                </label>
                <input
                  type={passwordType}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputClass}
                />
                <p className="text-xs text-gray-400 mt-1">At least 8 characters.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm new password
                </label>
                <input
                  type={passwordType}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-500">
                <input
                  type="checkbox"
                  checked={showPasswords}
                  onChange={(e) => setShowPasswords(e.target.checked)}
                />
                Show passwords
              </label>

              <div>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-md hover:bg-blue-700 transition disabled:opacity-60"
                >
                  {savingPassword ? "Updating..." : "Update Password"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}

export default SettingsPage;