import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import TaskBoard from "../components/TaskBoard";

function DashboardPage() {
  return (
    <div>
      <Navbar />
      <div className="flex">
        <Sidebar />
        <TaskBoard />
      </div>
    </div>
  );
}

export default DashboardPage;