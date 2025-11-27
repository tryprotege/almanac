import { useState } from "react";
import "./App.css";
import { Navigation } from "./components/Navigation";
import { Dashboard } from "./pages/Dashboard";
import { Settings } from "./pages/Settings";

function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "settings">(
    "dashboard"
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === "dashboard" ? <Dashboard /> : <Settings />}
    </div>
  );
}

export default App;
