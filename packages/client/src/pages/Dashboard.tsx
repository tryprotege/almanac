import {
  CheckSquare,
  FileText,
  Search,
  Server,
  Workflow,
  X,
} from "lucide-react";
import { ActivityFeed, ActivityItem } from "../components/ui/ActivityFeed";
import { Badge } from "../components/ui/Badge";
import { DataTable } from "../components/ui/DataTable";
import { MetricCard } from "../components/ui/MetricCard";
import { PageHeader } from "../components/ui/PageHeader";
import { useStats } from "../hooks/useStats";

export default function Dashboard() {
  const { stats, isLoading, error } = useStats();

  if (error) {
    return (
      <div className="py-8">
        <div className="bg-error-bg border border-error-border rounded-lg p-4">
          <p className="text-error-text">
            Failed to load statistics: {error.message}
          </p>
        </div>
      </div>
    );
  }

  // Mock recent activity data (replace with real data from API)
  const recentActivity: ActivityItem[] = [
    {
      service: "GitHub",
      time: "2 minutes ago",
      description: "Indexed 15 new repositories",
      isNew: true,
    },
    {
      service: "Notion",
      time: "10 minutes ago",
      description: "Synced 24 pages and 8 databases",
    },
    {
      service: "Fathom",
      time: "1 hour ago",
      description: "Updated analytics data",
    },
  ];

  // Mock newly connected servers (replace with real data)
  const newlyConnected = [
    { name: "GitHub", status: "Online", lastSync: "2 minutes ago" },
    { name: "Notion", status: "Online", lastSync: "10 minutes ago" },
    { name: "Fathom", status: "Online", lastSync: "1 hour ago" },
  ];

  return (
    <div className="pb-8">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your eBee system statistics and connected services"
      />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Metrics & Table */}
        <div className="lg:col-span-2 space-y-6">
          {/* First Row of Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              title="Total Records"
              value={stats?.totalRecords || 0}
              icon={FileText}
              iconColor="purple"
              loading={isLoading}
            />
            <MetricCard
              title="Vector Embeddings"
              value={stats?.totalVectors || 0}
              icon={Search}
              iconColor="blue"
              loading={isLoading}
            />
            <MetricCard
              title="Graph Nodes"
              value={stats?.totalGraphNodes || 0}
              icon={Workflow}
              iconColor="orange"
              loading={isLoading}
            />
          </div>

          {/* Second Row of Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              title="Data Sources"
              value={stats?.dataSources?.total || 0}
              icon={Server}
              iconColor="indigo"
              loading={isLoading}
            />
            <MetricCard
              title="Connected"
              value={stats?.dataSources?.connected || 0}
              icon={CheckSquare}
              iconColor="green"
              loading={isLoading}
            />
            <MetricCard
              title="Disconnected"
              value={stats?.dataSources?.disconnected || 0}
              icon={X}
              iconColor="gray"
              loading={isLoading}
            />
          </div>

          {/* Newly Connected Table */}
          <DataTable
            title="Newly Connected"
            columns={[
              { key: "name", header: "Server Name" },
              {
                key: "status",
                header: "Status",
                render: (item) => (
                  <Badge variant="success" dot>
                    {item.status}
                  </Badge>
                ),
              },
              { key: "lastSync", header: "Last Sync" },
            ]}
            data={newlyConnected}
            loading={isLoading}
            showAll={() => {
              // Navigate to data sources page
              window.location.href = "/data-sources";
            }}
          />
        </div>

        {/* Right Column: Recent Activity */}
        <div className="lg:col-span-1">
          <div className="card">
            <h3 className="text-base font-semibold text-text-primary mb-6">
              Recent Activity
            </h3>
            <ActivityFeed items={recentActivity} loading={isLoading} />
          </div>
        </div>
      </div>
    </div>
  );
}
