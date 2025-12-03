import { AlertCircle, Loader2, Plus, Server } from "lucide-react";
import { useState } from "react";
import { MCPServerCard } from "../components/MCPServerCard";
import { MCPServerForm } from "../components/MCPServerForm";
import { useMCPServers } from "../hooks/useMCPServers";
import { MCPServerConfig } from "../lib/api";

export default function Connections() {
  const { servers, isLoading, error } = useMCPServers();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServerConfig | null>(
    null
  );

  const handleAddServer = () => {
    setEditingServer(null);
    setIsFormOpen(true);
  };

  const handleEditServer = (server: MCPServerConfig) => {
    setEditingServer(server);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingServer(null);
  };

  return (
    <div className=" bg-gray-50 dark:bg-gray-900">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                MCP Server Connections
              </h1>
              <p className="mt-2 text-gray-600 dark:text-gray-300">
                Manage your Model Context Protocol server connections
              </p>
            </div>
            <button
              onClick={handleAddServer}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Server
            </button>
          </div>
        </div>

        {/* Stats Summary */}
        {!isLoading && servers.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                  <Server className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Total Servers
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {servers.length}
                  </p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-success-100 dark:bg-success-900/30 rounded-lg">
                  <Server className="w-6 h-6 text-success-600 dark:text-success-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Connected
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {servers.filter((s) => !s.isDisabled).length}
                  </p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <Server className="w-6 h-6 text-gray-600 dark:text-gray-300" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Disabled
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {servers.filter((s) => s.isDisabled).length}
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
                  Error loading servers
                </h3>
                <p className="mt-1 text-sm text-error-700 dark:text-error-300">
                  {error.message || "Failed to load MCP servers"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && servers.length === 0 && (
          <div className="card text-center py-12">
            <Server className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No MCP Servers
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Get started by adding your first MCP server connection
            </p>
            <button
              onClick={handleAddServer}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Your First Server
            </button>
          </div>
        )}

        {/* Server List */}
        {!isLoading && !error && servers.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Configured Servers
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              {servers.map((server) => (
                <MCPServerCard
                  key={server.name}
                  server={server}
                  onEdit={handleEditServer}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Form Modal */}
      <MCPServerForm
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        server={editingServer}
      />
    </div>
  );
}
