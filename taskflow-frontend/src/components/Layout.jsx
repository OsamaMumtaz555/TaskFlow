import Navbar from "./Navbar";
import Sidebar from "./Sidebar";

// Wraps every page with the top bar and the sidebar
function Layout({ children }) {
  return (
    <div>
      <Navbar />
      <div className="flex">
        <Sidebar />
        {children}
      </div>
    </div>
  );
}

export default Layout;  