import { Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import TasksPage from "./pages/TasksPage";
import TeamPage from "./pages/TeamPage";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";

// Temporary placeholder until the real page is built
function ComingSoon({ title }) {
  return (
    <Layout>
      <div className="p-8 flex-1">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">{title}</h2>
        <p className="text-gray-500">This page is coming soon.</p>
      </div>
    </Layout>
  );
}

function App() {
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
            <ComingSoon title="Settings" />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;