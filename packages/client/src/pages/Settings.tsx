import { useState } from "react";
import { ModelConfiguration } from "../components/ModelConfiguration";
import { PersonaEditor } from "../components/PersonaEditor";
import { PageHeader } from "../components/ui/PageHeader";

type SettingsTab = "persona" | "models";

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("persona");

  const tabs = [
    {
      id: "persona" as SettingsTab,
      label: "Persona",
    },
    {
      id: "models" as SettingsTab,
      label: "Models",
    },
  ];

  return (
    <div className="pb-8">
      <PageHeader title="Settings" />

      {/* Horizontal Tabs */}
      <div className="horizontal-tabs mb-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={activeTab === tab.id ? "active" : ""}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "persona" && <PersonaEditor />}
        {activeTab === "models" && <ModelConfiguration />}
      </div>
    </div>
  );
}
