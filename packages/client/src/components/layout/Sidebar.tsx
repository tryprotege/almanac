import { BarChart2, GitBranch, Link, Settings } from 'lucide-react';
import { Logomark } from './Logomark';
import { NavItem } from './NavItem';

export function Sidebar() {
  return (
    <aside className="sidebar">
      {/* Header with Logo */}
      <div className="sidebar-header">
        <Logomark />
      </div>

      {/* Navigation Items */}
      <nav className="sidebar-nav">
        <NavItem icon={BarChart2} label="Dashboard" to="/dashboard" />
        <NavItem icon={Link} label="Data Sources" to="/data-sources" />
        <NavItem icon={GitBranch} label="Schema" to="/schema" />
        <NavItem icon={Settings} label="Settings" to="/settings" />
      </nav>

      {/* Footer - simplified per user request */}
      <div className="sidebar-footer">{/* No user card or help card per requirements */}</div>
    </aside>
  );
}
