import { NavLink } from "react-router-dom";
import useUnreadCount from "../hooks/useUnreadCount";

function Sidebar() {
  const unread = useUnreadCount();

  const linkClass = ({ isActive }) =>
    `px-4 py-2 rounded-md font-medium transition flex items-center justify-between ${
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
        <NavLink to="/chat" className={linkClass}>
          <span>Chat</span>
          {unread > 0 && (
            <span className="bg-blue-600 text-white text-xs font-semibold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
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