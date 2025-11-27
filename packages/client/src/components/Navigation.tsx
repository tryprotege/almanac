interface NavigationProps {
  activeTab: "dashboard" | "settings";
  onTabChange: (tab: "dashboard" | "settings") => void;
}

export function Navigation({ activeTab, onTabChange }: NavigationProps) {
  const tabClass = (tab: string) =>
    `px-4 py-2 font-medium transition-colors ${
      activeTab === tab
        ? "text-primary-600 border-b-2 border-primary-600"
        : "text-gray-600 hover:text-gray-900"
    }`;

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <span className="text-2xl">🐝</span>
              <span className="ml-2 text-xl font-bold text-gray-900">eBee</span>
            </div>
            <div className="ml-8 flex space-x-4 items-center">
              <button
                onClick={() => onTabChange("dashboard")}
                className={tabClass("dashboard")}
              >
                📊 Dashboard
              </button>
              <button
                onClick={() => onTabChange("settings")}
                className={tabClass("settings")}
              >
                ⚙️ Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
