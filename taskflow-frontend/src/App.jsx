import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import api from "./api/api";
import { getCurrentUser, saveCurrentUser } from "./utils/taskHelpers";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import TasksPage from "./pages/TasksPage";
import TeamPage from "./pages/TeamPage";
import SettingsPage from "./pages/SettingsPage";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  // Keep the saved user (name, email, role) in sync with the server.
  // Runs on first load and whenever the user comes back to this tab.
  useEffect(() => {
    const syncUser = async () => {
      const saved = getCurrentUser();
      if (!localStorage.getItem("token") || !saved) return;

      try {
        const { data } = await api.get("/users/me");
        const changed =
          saved.role !== data.role ||
          saved.name !== data.name ||
          saved.email !== data.email;

        if (changed) {
          saveCurrentUser({ name: data.name, email: data.email, role: data.role });
          window.location.reload(); // pages read the user on load, so reload once
        }
      } catch (err) {
        // A 401 (expired or deactivated) is handled by the axios interceptor
        console.error("Could not sync user:", err);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") syncUser();
    };

    syncUser();
    window.addEventListener("focus", syncUser);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", syncUser);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks"
        element={
          <ProtectedRoute>
            <TasksPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/team"
        element={
          <ProtectedRoute>
            <TeamPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;