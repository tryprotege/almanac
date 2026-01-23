import { AlertCircle, Database, Loader2, Plus, RefreshCw, Store } from 'lucide-react';
import { useState } from 'react';
import { useDataSources, useSyncDataSource } from '../hooks/useDataSources';
import { useSyncConfigs } from '../hooks/useSyncConfigs';
import { useSyncStatuses } from '../hooks/useSyncStatus';
import { DataSourceWizard } from '../components/DataSourceWizard';
import { MarketplaceModal } from '../components/MarketplaceModal';
import { MCPServerCard } from '../components/MCPServerCard';
import { PageHeader } from '../components/ui/PageHeader';
import type { DataSourceConfig } from '../lib/api';

export default function DataSources() {
  const { servers, isLoading: serversLoading, error: serversError } = useDataSources();
  const { data: configs, isLoading: configsLoading, error: configsError } = useSyncConfigs();

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isMarketplaceOpen, setIsMarketplaceOpen] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<DataSourceConfig | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncAllError, setSyncAllError] = useState<string | null>(null);
  const syncMutation = useSyncDataSource();

  // Fetch sync statuses with polling
  const { data: syncStatuses } = useSyncStatuses();

  const isLoading = serversLoading || configsLoading;
  const error = serversError || configsError;

  // Merge servers and configs into unified data sources
  const dataSources =
    servers?.map((server) => {
      const config = configs?.find((c) => c.serverName === server.name);
      return {
        id: server.name,
        name: server.name,
        type:
          server.name.includes('notion') ||
          server.name.includes('github') ||
          server.name.includes('slack')
            ? ('preset' as const)
            : ('custom' as const),
        status: config?.status || (server.isDisabled ? 'disabled' : 'connected'),
        recordCount: 0, // TODO: Get from stats API
        hasIndexing: !!config,
        server,
        config,
      };
    }) || [];

  const handleEdit = (server: DataSourceConfig) => {
    setEditingSource(server);
    setIsWizardOpen(true);
  };

  const handleCloseWizard = () => {
    setIsWizardOpen(false);
    setEditingSource(null);
    setSelectedPresetId(null);
  };

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    setIsWizardOpen(true);
  };

  const handleSyncAll = async () => {
    setIsSyncingAll(true);
    setSyncAllError(null);

    // Filter active data sources
    const activeSources = dataSources.filter((s) => s.status === 'active');

    if (activeSources.length === 0) {
      setSyncAllError('No active data sources to sync');
      setIsSyncingAll(false);
      return;
    }

    const errors: { serverName: string; error: string }[] = [];
    let successCount = 0;

    await Promise.all(
      activeSources.map(async ({ server }) => {
        server._id &&
          (await syncMutation.mutateAsync({
            configId: server._id,
            name: server.name,
          }));
      }),
    );

    // Show summary
    if (errors.length > 0) {
      const errorMessages = errors.map((e) => `${e.serverName}: ${e.error}`).join(', ');
      setSyncAllError(
        `Synced ${successCount}/${activeSources.length} sources. Failures: ${errorMessages}`,
      );
    } else {
      console.log(`Successfully queued ${successCount} data sources for sync`);
    }

    setIsSyncingAll(false);
  };

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <PageHeader title="Data Sources" subtitle="Connect and index data from MCP servers" />
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMarketplaceOpen(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Store className="w-5 h-5" />
            Add from Marketplace
          </button>
          <button
            onClick={() => setIsWizardOpen(true)}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Custom Source
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      {!isLoading && dataSources.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-[#9e77ed]/10 rounded-lg">
                <Database className="w-6 h-6 text-[#9e77ed]" />
              </div>
              <div>
                <p className="text-sm text-text-tertiary">Total Sources</p>
                <p className="text-2xl font-bold text-text-primary">{dataSources.length}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-[#17b26a]/10 rounded-lg">
                <Database className="w-6 h-6 text-[#17b26a]" />
              </div>
              <div>
                <p className="text-sm text-text-tertiary">Active & Indexing</p>
                <p className="text-2xl font-bold text-text-primary">
                  {dataSources.filter((s) => s.status === 'active').length}
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-[#2e90fa]/10 rounded-lg">
                <Database className="w-6 h-6 text-[#2e90fa]" />
              </div>
              <div>
                <p className="text-sm text-text-tertiary">Connected Only</p>
                <p className="text-2xl font-bold text-text-primary">
                  {dataSources.filter((s) => s.status === 'connected').length}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-brand-purple animate-spin" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="card bg-error-bg border-error-border">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-error-text flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-error-text">Error loading data sources</h3>
              <p className="mt-1 text-sm text-error-text/80">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && dataSources.length === 0 && (
        <div className="card text-center py-12">
          <Database className="w-12 h-12 text-text-quaternary mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">No Data Sources</h3>
          <p className="text-text-tertiary mb-6">
            Connect your first data source to start indexing
          </p>
          <div className="flex items-center gap-3 justify-center">
            <button
              onClick={() => setIsMarketplaceOpen(true)}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              <Store className="w-5 h-5" />
              Browse Marketplace
            </button>
            <button
              onClick={() => setIsWizardOpen(true)}
              className="btn btn-secondary inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Custom Source
            </button>
          </div>
        </div>
      )}

      {/* Data Sources Grid */}
      {!isLoading && !error && dataSources.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Your Data Sources</h2>
            <button
              onClick={handleSyncAll}
              disabled={
                isSyncingAll || dataSources.filter((s) => s.status === 'active').length === 0
              }
              className="btn btn-secondary flex items-center gap-2 text-sm"
            >
              {isSyncingAll ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Sync All
                </>
              )}
            </button>
          </div>

          {/* Sync All Error */}
          {syncAllError && (
            <div className="card bg-error-bg border-error-border mb-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-error-text flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-error-text">Sync Error</h3>
                  <p className="mt-1 text-sm text-error-text/80">{syncAllError}</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dataSources.map((source) => {
              // Check if this server is currently syncing or queued
              const isSyncing = syncStatuses?.syncing.some((s) => s.serverName === source.name);

              return (
                <MCPServerCard
                  key={source.id}
                  server={source.server}
                  syncConfig={source.config}
                  onEdit={handleEdit}
                  isSyncing={isSyncing}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Marketplace Modal */}
      <MarketplaceModal
        isOpen={isMarketplaceOpen}
        onClose={() => setIsMarketplaceOpen(false)}
        onSelectPreset={handleSelectPreset}
      />

      {/* Data Source Wizard */}
      <DataSourceWizard
        isOpen={isWizardOpen}
        onClose={handleCloseWizard}
        existingSource={editingSource}
        presetId={selectedPresetId}
      />
    </div>
  );
}
