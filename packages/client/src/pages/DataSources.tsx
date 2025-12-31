import {
  AlertCircle,
  Database,
  FileJson,
  Loader2,
  Play,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMCPServers, useDeleteMCPServer } from "../hooks/useMCPServers";
import {
  useIndexingConfigs,
  useDeleteConfig,
  useSyncConfig,
} from "../hooks/useIndexingConfigs";
import { DataSourceWizard } from "../components/DataSourceWizard";
import { PageHeader } from "../components/ui/PageHeader";
import { Badge } from "../components/ui/Badge";
import type { MCPServerConfig } from "../lib/api";

export default function DataSources() {
  const navigate = useNavigate();
  const {
    servers,
    isLoading: serversLoading,
    error: serversError,
  } = useMCPServers();
  const {
    data: configs,
    isLoading: configsLoading,
    error: configsError,
  } = useIndexingConfigs();
  const deleteConfig = useDeleteConfig();
  const deleteMCPServer = useDeleteMCPServer();
  const syncConfig = useSyncConfig();

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<MCPServerConfig | null>(
    null
  );
  const [syncingSource, setSyncingSource] = useState<string | null>(null);
  const [configServerName, setConfigServerName] = useState<string | null>(null);

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
          server.name.includes("notion") ||
          server.name.includes("github") ||
          server.name.includes("slack")
            ? ("preset" as const)
            : ("custom" as const),
        status:
          config?.status || (server.isDisabled ? "disabled" : "connected"),
        recordCount: 0, // TODO: Get from stats API
        hasIndexing: !!config,
        server,
        config,
      };
    }) || [];

  const handleSync = async (serverName: string) => {
    setSyncingSource(serverName);
    try {
      await syncConfig.mutateAsync({ serverName, incremental: false });
    } finally {
      setSyncingSource(null);
    }
  };

  const handleEdit = (server: MCPServerConfig) => {
    setEditingSource(server);
    setIsWizardOpen(true);
  };

  const handleCloseWizard = () => {
    setIsWizardOpen(false);
    setEditingSource(null);
  };

  const handleDelete = async (serverName: string) => {
    if (confirm(`Delete ${serverName} and all its indexed data?`)) {
      try {
        // Delete indexing config if it exists
        await deleteConfig.mutateAsync(serverName);
      } catch (error) {
        console.error("Error deleting indexing config:", error);
        // Continue to delete server even if config deletion fails
      }

      try {
        // Delete the MCP server itself
        await deleteMCPServer.mutateAsync(serverName);
      } catch (error) {
        console.error("Error deleting MCP server:", error);
      }
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="success">Active</Badge>;
      case "connected":
        return <Badge variant="success">Connected</Badge>;
      case "disabled":
        return <Badge variant="neutral">Disabled</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <PageHeader
          title="Data Sources"
          subtitle="Connect and index data from MCP servers"
        />
        <button
          onClick={() => setIsWizardOpen(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Source
        </button>
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
                <p className="text-2xl font-bold text-text-primary">
                  {dataSources.length}
                </p>
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
                  {dataSources.filter((s) => s.status === "active").length}
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
                  {dataSources.filter((s) => s.status === "connected").length}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary-600 dark:text-primary-400 animate-spin" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="card bg-error-50 dark:bg-error-900/20 border-error-200 dark:border-error-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-error-600 dark:text-error-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-error-900 dark:text-error-200">
                Error loading data sources
              </h3>
              <p className="mt-1 text-sm text-error-700 dark:text-error-300">
                {error instanceof Error ? error.message : "Unknown error"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && dataSources.length === 0 && (
        <div className="card text-center py-12">
          <Database className="w-12 h-12 text-text-quaternary mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">
            No Data Sources
          </h3>
          <p className="text-text-tertiary mb-6">
            Connect your first data source to start indexing
          </p>
          <button
            onClick={() => setIsWizardOpen(true)}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Your First Source
          </button>
        </div>
      )}

      {/* Data Sources Grid */}
      {!isLoading && !error && dataSources.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            Your Data Sources
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dataSources.map((source) => (
              <div
                key={source.id}
                className="card hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                      <Database className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-text-primary">
                        {source.name}
                      </h3>
                      <p className="text-xs text-text-quaternary">
                        {source.type === "preset"
                          ? "Preset Service"
                          : "Custom MCP"}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(source.status)}
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-tertiary">Records</span>
                    <span className="font-medium text-text-primary">
                      {source.recordCount.toLocaleString()}
                    </span>
                  </div>
                  {source.config && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-text-tertiary">Fetchers</span>
                      <span className="font-medium text-text-primary">
                        {source.config.fetcherCount}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {source.hasIndexing && source.status === "active" && (
                    <button
                      onClick={() => handleSync(source.name)}
                      disabled={syncingSource === source.name}
                      className="flex-1 btn btn-secondary text-sm flex items-center justify-center gap-1"
                    >
                      {syncingSource === source.name ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Sync
                        </>
                      )}
                    </button>
                  )}
                  {source.type === "custom" && (
                    <button
                      onClick={() =>
                        navigate(
                          `/data-sources/${encodeURIComponent(
                            source.name
                          )}/config`
                        )
                      }
                      className="btn btn-secondary text-sm p-2"
                      title="View Indexing Config"
                    >
                      <FileJson className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(source.server)}
                    className="btn btn-secondary text-sm p-2"
                    title="Settings"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(source.name)}
                    className="btn btn-secondary text-sm p-2 text-error-600 hover:text-error-700"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data Source Wizard */}
      <DataSourceWizard
        isOpen={isWizardOpen}
        onClose={handleCloseWizard}
        existingSource={editingSource}
      />
    </div>
  );
}
