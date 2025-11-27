interface StatsCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: string;
  loading?: boolean;
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon,
  loading = false,
}: StatsCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">
          {title}
        </h3>
        <span className="text-2xl">{icon}</span>
      </div>

      {loading ? (
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
        </div>
      ) : (
        <>
          <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
            {typeof value === "number" ? value.toLocaleString() : value}
          </div>
          {subtitle && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {subtitle}
            </div>
          )}
        </>
      )}
    </div>
  );
}
