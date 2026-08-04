import { NavLink } from "react-router-dom";

function Sidebar() {
  const linkClass = ({ isActive }) =>
    `px-4 py-2 rounded-md font-medium transition ${
      isActive ? "bg-blue-100 text-blue-700" : "text-gray-700 hover:bg-gray-100"
    }`;

  return (
    <aside className="bg-white w-64 min-h-screen shadow-md px-4 py-6">
      <nav className="flex flex-col gap-2">
        <NavLink to="/dashboard" className={linkClass}>
          Dashboard
        </NavLink>
        <NavLink to="/tasks" className={linkClass}>
          My Tasks
        </NavLink>
        <NavLink to="/team" className={linkClass}>
          Team
        </NavLink>
        <NavLink to="/settings" className={linkClass}>
          Settings
        </NavLink>
      </nav>
    </aside>
  );
}

export default Sidebar;