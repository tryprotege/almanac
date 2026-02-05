import { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  to: string;
}

export function NavItem({ icon: Icon, label, to }: NavItemProps) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
      <Icon />
      <span>{label}</span>
    </NavLink>
  );
}
