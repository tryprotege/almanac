import { Menu, X } from "lucide-react";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useTheme } from "../contexts/ThemeContext";

export function Navigation() {
  const { theme, toggleTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const getLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded ${
      isActive
        ? "text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400"
        : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
    }`;

  const getMobileLinkClass = ({ isActive }: { isActive: boolean }) =>
    `block px-4 py-2 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 rounded ${
      isActive
        ? "text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20"
        : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
    }`;

  const handleLinkClick = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <nav
      className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <span className="text-2xl" role="img" aria-label="Bee icon">
                🐝
              </span>
              <span className="ml-2 text-xl font-bold text-gray-900 dark:text-white">
                eBee
              </span>
            </div>
            {/* Desktop Navigation */}
            <div className="hidden md:ml-8 md:flex md:space-x-4 md:items-center">
              <NavLink
                to="/dashboard"
                className={getLinkClass}
                aria-label="Go to Dashboard"
              >
                <span role="img" aria-hidden="true">
                  📊
                </span>{" "}
                Dashboard
              </NavLink>
              <NavLink
                to="/connections"
                className={getLinkClass}
                aria-label="Go to Connections"
              >
                <span role="img" aria-hidden="true">
                  🔌
                </span>{" "}
                Connections
              </NavLink>
              <NavLink
                to="/schema"
                className={getLinkClass}
                aria-label="Go to Schema"
              >
                <span role="img" aria-hidden="true">
                  🕸️
                </span>{" "}
                Schema
              </NavLink>
              <NavLink
                to="/settings"
                className={getLinkClass}
                aria-label="Go to Settings"
              >
                <span role="img" aria-hidden="true">
                  ⚙️
                </span>{" "}
                Settings
              </NavLink>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
              aria-label={`Switch to ${
                theme === "light" ? "dark" : "light"
              } mode`}
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              )}
            </button>
            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" aria-hidden="true" />
              ) : (
                <Menu className="w-6 h-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMobileMenuOpen && (
        <div
          id="mobile-menu"
          className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        >
          <div className="px-4 py-3 space-y-1">
            <NavLink
              to="/dashboard"
              className={getMobileLinkClass}
              onClick={handleLinkClick}
              aria-label="Go to Dashboard"
            >
              <span role="img" aria-hidden="true">
                📊
              </span>{" "}
              Dashboard
            </NavLink>
            <NavLink
              to="/connections"
              className={getMobileLinkClass}
              onClick={handleLinkClick}
              aria-label="Go to Connections"
            >
              <span role="img" aria-hidden="true">
                🔌
              </span>{" "}
              Connections
            </NavLink>
            <NavLink
              to="/schema"
              className={getMobileLinkClass}
              onClick={handleLinkClick}
              aria-label="Go to Schema"
            >
              <span role="img" aria-hidden="true">
                🕸️
              </span>{" "}
              Schema
            </NavLink>
            <NavLink
              to="/settings"
              className={getMobileLinkClass}
              onClick={handleLinkClick}
              aria-label="Go to Settings"
            >
              <span role="img" aria-hidden="true">
                ⚙️
              </span>{" "}
              Settings
            </NavLink>
          </div>
        </div>
      )}
    </nav>
  );
}
