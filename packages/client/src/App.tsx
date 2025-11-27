import { useState } from "react";
import "./App.css";
import { Navigation } from "./components/Navigation";
import { Connections } from "./pages/Connections";
import { Dashboard } from "./pages/Dashboard";
import { Schema } from "./pages/Schema";
import { Settings } from "./pages/Settings";

function App() {
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "connections" | "schema" | "settings"
  >("dashboard");

  const renderPage = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard />;
      case "connections":
        return <Connections />;
      case "schema":
        return <Schema />;
      case "settings":
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      {renderPage()}
    </div>
  );
}

export default App;
