import { useNavigate } from "react-router-dom";
import NotificationBell from "./NotificationBell";

function Navbar() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/");
  };

  return (
    <nav className="bg-blue-600 text-white px-6 py-4 flex justify-between items-center shadow-md">
      <h1 className="text-xl font-bold">TaskFlow</h1>

      <div className="flex items-center gap-4">
        <NotificationBell />
        <span className="text-sm">Welcome, {user?.name}</span>
        <button
          onClick={handleLogout}
          className="bg-white text-blue-600 px-3 py-1 rounded-md text-sm font-medium hover:bg-gray-100 transition"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}

export default Navbar; 