import {
  AlertCircle,
  FileJson,
  Loader2,
  Plus,
  Play,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useIndexingConfigs,
  useDeleteConfig,
  useSyncConfig,
} from "../hooks/useIndexingConfigs";
import { GenerateConfigModal } from "../components/IndexingConfig/GenerateConfigModal";
import { PageHeader } from "../components/ui/PageHeader";
import { Badge } from "../components/ui/Badge";

export default function IndexingConfigs() {
  const navigate = useNavigate();
  const { data: configs, isLoading, error } = useIndexingConfigs();
  const deleteConfig = useDeleteConfig();
  const syncConfig = useSyncConfig();
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [syncingServer, setSyncingServer] = useState<string | null>(null);

  const handleEdit = (serverName: string) => {
    navigate(`/indexing/${encodeURIComponent(serverName)}`);
  };

  const handleSync = async (serverName: string, incremental: boolean) => {
    setSyncingServer(serverName);
    try {
      await syncConfig.mutateAsync({ serverName, incremental });
    } finally {
      setSyncingServer(null);
    }
  };

  const handleDelete = async (serverName: string) => {
    if (
      confirm(
        `Are you sure you want to delete the indexing config for ${serverName}?`
      )
    ) {
      await deleteConfig.mutateAsync(serverName);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="success">Active</Badge>;
      case "draft":
        return <Badge variant="neutral">Draft</Badge>;
      case "disabled":
        return <Badge variant="error">Disabled</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <PageHeader
          title="Indexing Configurations"
          subtitle="Manage auto-generated configs for MCP server indexing"
        />
        <button
          onClick={() => setIsGenerateModalOpen(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Generate Config
        </button>
      </div>

      {/* Stats Summary */}
      {!isLoading && configs && configs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                <FileJson className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Total Configs
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {configs.length}
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-success-100 dark:bg-success-900/30 rounded-lg">
                <FileJson className="w-6 h-6 text-success-600 dark:text-success-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Active
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {configs.filter((c) => c.status === "active").length}
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <FileJson className="w-6 h-6 text-gray-600 dark:text-gray-300" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Draft
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {configs.filter((c) => c.status === "draft").length}
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
                Error loading configs
              </h3>
              <p className="mt-1 text-sm text-error-700 dark:text-error-300">
                {error instanceof Error ? error.message : "Unknown error"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && (!configs || configs.length === 0) && (
        <div className="card text-center py-12">
          <FileJson className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No Indexing Configs
          </h3>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            Generate your first config to start indexing MCP server data
          </p>
          <button
            onClick={() => setIsGenerateModalOpen(true)}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Generate First Config
          </button>
        </div>
      )}

      {/* Configs Table */}
      {!isLoading && !error && configs && configs.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Server
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Display Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Fetchers
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Record Types
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Updated
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                {configs.map((config) => (
                  <tr
                    key={config.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {config.serverName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {config.displayName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(config.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {config.fetcherCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {config.recordTypeCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {new Date(config.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(config.serverName)}
                          className="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300"
                          title="Edit config"
                        >
                          Edit
                        </button>
                        {config.status === "active" && (
                          <button
                            onClick={() => handleSync(config.serverName, false)}
                            disabled={syncingServer === config.serverName}
                            className="text-success-600 hover:text-success-900 dark:text-success-400 dark:hover:text-success-300 disabled:opacity-50 flex items-center gap-1"
                            title="Full sync"
                          >
                            {syncingServer === config.serverName ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                            Sync
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(config.serverName)}
                          className="text-error-600 hover:text-error-900 dark:text-error-400 dark:hover:text-error-300 flex items-center gap-1"
                          title="Delete config"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Generate Config Modal */}
      <GenerateConfigModal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
      />
    </div>
  );
}
