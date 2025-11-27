import { OverviewStats } from "../lib/api";

interface RecentActivityProps {
  stats: OverviewStats | undefined;
}

function formatTimeAgo(date: string | undefined): string {
  if (!date) return "Never";

  const now = new Date();
  const syncDate = new Date(date);
  const diffMs = now.getTime() - syncDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minutes ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} days ago`;
}

export function RecentActivity({ stats }: RecentActivityProps) {
  const activities = [];

  // Generate activity from stats
  if (stats?.bySource) {
    for (const [source, data] of Object.entries(stats.bySource)) {
      if (data.records > 0) {
        activities.push({
          message: `Synced ${data.records} records from ${source}`,
          time: formatTimeAgo(data.lastSync),
          icon: "📥",
        });
      }
    }
  }

  // Sort by most recent (though we're making assumptions here)
  activities.sort((a, b) => {
    // Simple heuristic: "just now" comes first, then by time value
    if (a.time === "just now") return -1;
    if (b.time === "just now") return 1;
    return 0;
  });

  // Limit to 5 most recent
  const recentActivities = activities.slice(0, 5);

  if (recentActivities.length === 0) {
    recentActivities.push({
      message: "No recent sync activity",
      time: "",
      icon: "ℹ️",
    });
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        📊 Recent Activity
      </h2>
      <div className="space-y-3">
        {recentActivities.map((activity, index) => (
          <div
            key={index}
            className="flex items-start space-x-3 text-sm text-gray-600 dark:text-gray-300"
          >
            <span className="text-lg flex-shrink-0">{activity.icon}</span>
            <div>
              <span>{activity.message}</span>
              {activity.time && (
                <span className="text-gray-400 dark:text-gray-500 ml-2">
                  ({activity.time})
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
