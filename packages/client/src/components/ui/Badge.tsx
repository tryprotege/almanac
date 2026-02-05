import { ReactNode } from 'react';

type BadgeVariant = 'success' | 'warning' | 'error' | 'neutral';

interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
  dot?: boolean;
}

export function Badge({ variant, children, dot }: BadgeProps) {
  const variantClass = `badge-${variant}`;

  return (
    <span className={`badge ${variantClass}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-100" />}
      {children}
    </span>
  );
}
