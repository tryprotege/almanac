import {
  CheckSquare,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Server,
  Workflow,
  X,
} from 'lucide-react';
import { ActivityFeed } from '../components/ui/ActivityFeed';
import { Badge } from '../components/ui/Badge';
import { DataTable } from '../components/ui/DataTable';
import { MetricCard } from '../components/ui/MetricCard';
import { PageHeader } from '../components/ui/PageHeader';
import { IconDisplay } from '../components/ui/IconDisplay';
import { useStats } from '../hooks/useStats';
import { useDataSources, useSyncDataSource } from '../hooks/useDataSources';
import { useSyncConfigs } from '../hooks/useSyncConfigs';
import { useSyncStatuses } from '../hooks/useSyncStatus';
import { statsApi, ActivityItem } from '../lib/api';
import { capitalCase } from 'change-case';
import { useEffect, useState } from 'react';

// Helper function to format relative time
function formatRelativeTime(date: Date | string | undefined): string {
  if (!date) return 'Never';

  const now = new Date();
  const syncDate = new Date(date);
  const diffMs = now.getTime() - syncDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
}

export default function Dashboard() {
  const { stats, isLoading, error } = useStats();
  const { servers, isLoading: sourcesLoading } = useDataSources();
  const { data: configs, isLoading: configsLoading } = useSyncConfigs();
  const { data: syncStatuses } = useSyncStatuses();
  const syncMutation = useSyncDataSource();
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  // Fetch recent activity
  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const response = await statsApi.activity();
        if (response.data.success && response.data.data) {
          setActivity(response.data.data);
        }
      } catch (err) {
        console.error('Failed to fetch activity:', err);
      } finally {
        setActivityLoading(false);
      }
    };

    fetchActivity();
    // Refresh activity every 30 seconds
    const interval = setInterval(fetchActivity, 30000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="py-8">
        <div className="bg-error-bg border border-error-border rounded-lg p-4">
          <p className="text-error-text">Failed to load statistics: {error.message}</p>
        </div>
      </div>
    );
  }

  // Build complete data sources list from all configured sources
  const dataSourcesList =
    servers?.map((server) => {
      const sourceData = stats?.bySource?.[server.name];
      const config = configs?.find((c) => c.serverName === server.name);
      const hasData = sourceData && sourceData.records > 0;

      // Check if this server is currently syncing or queued
      const isSyncing = syncStatuses?.syncing.some((s) => s.serverName === server.name);
      const isQueued = syncStatuses?.queued.some((s) => s.serverName === server.name);

      // Determine status based on sync state
      let status: string;
      if (isSyncing) {
        status = 'Syncing';
      } else if (isQueued) {
        status = 'Queued';
      } else if (hasData) {
        status = 'Has Data';
      } else {
        status = 'No Data';
      }

      return {
        name: capitalCase(server.name),
        icon: config?.icon,
        records: sourceData?.records || 0,
        embedded: sourceData?.embedded || 0,
        graphIndexed: sourceData?.graphIndexed || 0,
        status,
        lastSync: formatRelativeTime(sourceData?.lastSync),
        serverId: server._id,
        serverName: server.name,
        isSyncing,
        isQueued,
      };
    }) || [];

  const handleSync = async (serverId: string | undefined, serverName: string) => {
    if (!serverId) return;

    await syncMutation.mutateAsync({
      configId: serverId,
      name: serverName,
    });
  };

  const handleSyncAll = async () => {
    setIsSyncingAll(true);

    // Filter data sources that have server IDs and are not currently syncing
    const activeSources = dataSourcesList.filter(
      (source) => source.serverId && !source.isSyncing && !source.isQueued,
    );

    if (activeSources.length === 0) {
      setIsSyncingAll(false);
      return;
    }

    await Promise.all(
      activeSources.map(async (source) => {
        if (source.serverId) {
          await syncMutation.mutateAsync({
            configId: source.serverId,
            name: source.serverName,
          });
        }
      }),
    );

    setIsSyncingAll(false);
  };

  return (
    <div className="pb-8">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your Almanac system statistics and connected services"
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
              tooltip="Total records synced across all data sources"
            />
            <MetricCard
              title="Vector Embeddings"
              value={stats?.totalVectors || 0}
              icon={Search}
              iconColor="blue"
              loading={isLoading}
              tooltip="Total vector embeddings stored in Qdrant for semantic search"
            />
            <MetricCard
              title="Graph Nodes"
              value={stats?.totalGraphNodes || 0}
              icon={Workflow}
              iconColor="orange"
              loading={isLoading}
              tooltip="Total nodes in the knowledge graph"
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
              tooltip="Total number of configured data sources"
            />
            <MetricCard
              title="Active"
              value={stats?.dataSources?.connected || 0}
              icon={CheckSquare}
              iconColor="green"
              loading={isLoading}
              tooltip="Data sources currently connected and running"
            />
            <MetricCard
              title="Inactive"
              value={stats?.dataSources?.disconnected || 0}
              icon={X}
              iconColor="gray"
              loading={isLoading}
              tooltip="Data sources configured but not currently connected"
            />
          </div>

          {/* Data Sources Table */}
          <DataTable
            title="Data Sources"
            syncAll={!!dataSourcesList.length ? handleSyncAll : undefined}
            syncing={isSyncingAll}
            columns={[
              {
                key: 'name',
                header: 'Source Name',
                render: (item) => (
                  <div className="flex items-center gap-2">
                    {item.icon && <IconDisplay icon={item.icon} size="sm" />}
                    <span>{item.name}</span>
                  </div>
                ),
              },
              { key: 'records', header: 'Records' },
              { key: 'embedded', header: 'Embedded' },
              { key: 'graphIndexed', header: 'Graph' },
              {
                key: 'status',
                header: 'Status',
                render: (item) => {
                  const getVariant = () => {
                    switch (item.status) {
                      case 'Syncing':
                        return 'warning';
                      case 'Queued':
                        return 'neutral';
                      case 'Has Data':
                        return 'success';
                      default:
                        return 'neutral';
                    }
                  };

                  return (
                    <Badge
                      variant={getVariant()}
                      dot={item.status === 'Has Data' || item.status === 'Syncing'}
                    >
                      {item.status}
                    </Badge>
                  );
                },
              },
              { key: 'lastSync', header: 'Last Sync' },
              {
                key: 'actions',
                header: 'Actions',
                render: (item) => (
                  <button
                    onClick={() => handleSync(item.serverId, item.serverName)}
                    disabled={item.isSyncing || item.isQueued || syncMutation.isPending}
                    className="btn btn-icon-sm btn-ghost disabled:opacity-50 disabled:cursor-not-allowed"
                    title={item.isSyncing ? 'Syncing...' : item.isQueued ? 'Queued' : 'Sync Data'}
                  >
                    {item.isSyncing ||
                    (syncMutation.isPending && syncMutation.variables?.name === item.serverName) ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </button>
                ),
              },
            ]}
            data={dataSourcesList}
            loading={isLoading || sourcesLoading || configsLoading}
            showAll={() => {
              // Navigate to data sources page
              window.location.href = '/data-sources';
            }}
          />
        </div>

        {/* Right Column: Recent Activity */}
        <div className="lg:col-span-1">
          <div className="card">
            <h3 className="text-base font-semibold text-text-primary mb-6">Recent Activity</h3>
            <ActivityFeed items={activity} loading={activityLoading} />
          </div>
        </div>
      </div>
    </div>
  );
}
