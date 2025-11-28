import { ConnectedServices } from "../components/ConnectedServices";
import { RecentActivity } from "../components/RecentActivity";
import { StatsCard } from "../components/StatsCard";
import { useStats } from "../hooks/useStats";

export default function Dashboard() {
  const { stats, isLoading, error } = useStats();

  if (error) {
    return (
      <div className=" bg-gray-50 dark:bg-gray-900">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-800 dark:text-red-200">
              Failed to load statistics: {error.message}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className=" bg-gray-50 dark:bg-gray-900">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            Overview of your eBee system statistics and connected services
          </p>
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatsCard
            title="Total Records"
            value={stats?.totalRecords || 0}
            subtitle="documents"
            icon="📄"
            loading={isLoading}
          />
          <StatsCard
            title="Vector Embeddings"
            value={stats?.totalVectors || 0}
            subtitle="embeddings"
            icon="🔍"
            loading={isLoading}
          />
          <StatsCard
            title="Graph Database"
            value={stats?.totalGraphNodes || 0}
            subtitle={`nodes • ${
              stats?.totalGraphRelationships || 0
            } relationships`}
            icon="🕸️"
            loading={isLoading}
          />
        </div>

        {/* MCP Servers Status */}
        {stats?.mcpServers && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatsCard
              title="MCP Servers"
              value={stats.mcpServers.total}
              subtitle="configured"
              icon="🔌"
              loading={isLoading}
            />
            <StatsCard
              title="Connected"
              value={stats.mcpServers.connected}
              subtitle="active connections"
              icon="✅"
              loading={isLoading}
            />
            <StatsCard
              title="Disconnected"
              value={stats.mcpServers.disconnected}
              subtitle="inactive"
              icon="⚠️"
              loading={isLoading}
            />
          </div>
        )}

        {/* Connected Services */}
        <div className="mb-8">
          <ConnectedServices />
        </div>

        {/* Recent Activity */}
        <div>
          <RecentActivity stats={stats} />
        </div>
      </div>
    </div>
  );
}
