import { useState } from "react";
import { ModelConfiguration } from "../components/ModelConfiguration";
import { PersonaEditor } from "../components/PersonaEditor";

type SettingsTab = "persona" | "models";

export function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("persona");

  const tabs = [
    {
      id: "persona" as SettingsTab,
      label: "👤 Persona",
      description: "Set your context for AI understanding",
    },
    {
      id: "models" as SettingsTab,
      label: "🤖 Models",
      description: "Configure LLM and embedding models",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="mt-2 text-gray-600">
            Configure your eBee instance and personalize your experience
          </p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-4 px-6 text-center border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? "border-primary-600 text-primary-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span>{tab.label}</span>
                    <span className="text-xs font-normal text-gray-500">
                      {tab.description}
                    </span>
                  </div>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === "persona" && <PersonaEditor />}
          {activeTab === "models" && <ModelConfiguration />}
        </div>
      </div>
    </div>
  );
}
