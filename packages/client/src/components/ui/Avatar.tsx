interface AvatarProps {
  src?: string;
  fallback?: string;
  size?: "sm" | "md" | "lg";
  online?: boolean;
}

export function Avatar({ src, fallback, size = "md", online }: AvatarProps) {
  const sizeClasses = {
    sm: "w-6 h-6 text-xs",
    md: "w-8 h-8 text-sm",
    lg: "w-10 h-10 text-base",
  };

  return (
    <div className={`relative ${sizeClasses[size]}`}>
      {src ? (
        <img
          src={src}
          alt={fallback || "Avatar"}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        <div className="w-full h-full rounded-full bg-bg-active flex items-center justify-center font-semibold text-text-tertiary">
          {fallback?.charAt(0).toUpperCase() || "?"}
        </div>
      )}
      {online && (
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-brand-success-light rounded-full border-2 border-bg-primary" />
      )}
    </div>
  );
}
