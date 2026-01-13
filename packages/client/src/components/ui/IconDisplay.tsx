import React from 'react';

interface IconDisplayProps {
  icon?: string;
  fallbackIcon?: React.ComponentType<{ className?: string }>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * IconDisplay - Flexible icon component that supports:
 * - Emoji (e.g., "💬", "📊")
 * - Image URLs (e.g., "https://example.com/logo.png")
 * - Inline SVG (e.g., "<svg>...</svg>")
 * - Fallback to Lucide icon component
 */
export function IconDisplay({
  icon,
  fallbackIcon: FallbackIcon,
  size = 'md',
  className = '',
}: IconDisplayProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const textSizeClasses = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-xl',
  };

  // No icon provided, use fallback
  if (!icon) {
    return FallbackIcon ? <FallbackIcon className={`${sizeClasses[size]} ${className}`} /> : null;
  }

  // Check if it's a URL (starts with http:// or https://)
  if (icon.startsWith('http://') || icon.startsWith('https://')) {
    return (
      <img
        src={icon}
        alt="icon"
        className={`${sizeClasses[size]} object-contain ${className}`}
        onError={(e) => {
          // Hide image and show fallback if available
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          // TODO: Could trigger fallback icon to display
        }}
      />
    );
  }

  // Check if it's inline SVG (starts with <svg)
  if (icon.trim().startsWith('<svg')) {
    return (
      <div
        className={`${sizeClasses[size]} ${className}`}
        dangerouslySetInnerHTML={{ __html: icon }}
      />
    );
  }

  // Otherwise treat as emoji or text
  return <span className={`${textSizeClasses[size]} leading-none ${className}`}>{icon}</span>;
}
