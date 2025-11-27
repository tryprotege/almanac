import { NavLink } from "react-router-dom";

export function Navigation() {
  const getLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 font-medium transition-colors ${
      isActive
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
              <NavLink to="/dashboard" className={getLinkClass}>
                📊 Dashboard
              </NavLink>
              <NavLink to="/connections" className={getLinkClass}>
                🔌 Connections
              </NavLink>
              <NavLink to="/schema" className={getLinkClass}>
                🕸️ Schema
              </NavLink>
              <NavLink to="/settings" className={getLinkClass}>
                ⚙️ Settings
              </NavLink>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
