import { LucideIcon } from 'lucide-react';

type IconColor = 'purple' | 'blue' | 'orange' | 'indigo' | 'green' | 'gray';

interface FeaturedIconProps {
  icon: LucideIcon;
  color: IconColor;
  size?: 'sm' | 'md' | 'lg';
}

const colorMap: Record<IconColor, string> = {
  purple: '#7f56d9',
  blue: '#2e90fa',
  orange: '#dc6803',
  indigo: '#444ce7',
  green: '#079455',
  gray: '#61656c',
};

export function FeaturedIcon({ icon: Icon, color, size = 'md' }: FeaturedIconProps) {
  const bgColor = colorMap[color];
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-14 h-14',
  };

  return (
    <div
      className={`featured-icon ${sizeClasses[size]}`}
      style={{
        background: `radial-gradient(circle, ${bgColor}15 0%, transparent 70%)`,
      }}
    >
      <div className="featured-icon-inner w-8 h-8" style={{ backgroundColor: bgColor }}>
        <Icon className="w-5 h-5 text-text-secondary" strokeWidth={2} />
      </div>
    </div>
  );
}
