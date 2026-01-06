import { Avatar } from "./Avatar";

export interface ActivityItem {
  avatar?: string;
  service: string;
  time: string;
  description: string;
  isNew?: boolean;
}

interface ActivityFeedProps {
  items: ActivityItem[];
  loading?: boolean;
}

export function ActivityFeed({ items, loading }: ActivityFeedProps) {
  if (loading) {
    return (
      <div className="space-y-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-8 h-8 bg-bg-active rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-bg-active rounded w-32" />
              <div className="h-3 bg-bg-active rounded w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {items.map((item, index) => (
        <div key={index} className="activity-item">
          <div className="activity-avatar-wrapper">
            <Avatar src={item.avatar} fallback={item.service} size="md" />
            {index < items.length - 1 && <div className="activity-connector" />}
          </div>
          <div className="activity-content">
            <div className="activity-header">
              <span className="text-sm font-medium text-text-secondary">
                {item.service}
              </span>
              <span className="text-xs text-text-tertiary">{item.time}</span>
            </div>
            <p className="text-sm text-text-tertiary">{item.description}</p>
          </div>
          {item.isNew && <div className="activity-new-dot" />}
        </div>
      ))}
    </div>
  );
}
