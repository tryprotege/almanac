import { useState } from "react";
import { ModelConfiguration } from "../components/ModelConfiguration";
import { PersonaEditor } from "../components/PersonaEditor";

type SettingsTab = "persona" | "models";

export default function Settings() {
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
    <div className=" bg-gray-50 dark:bg-gray-900 py-8">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Settings
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            Configure your eBee instance and personalize your experience
          </p>
        </div>

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex -mb-px">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-4 px-6 text-center border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? "border-primary-600 dark:border-primary-400 text-primary-600 dark:text-primary-400"
                      : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span>{tab.label}</span>
                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
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
