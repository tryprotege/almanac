import {
  CheckCircle,
  Loader2,
  Power,
  PowerOff,
  Settings,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import {
  useConnectMCPServer,
  useDeleteMCPServer,
  useDisconnectMCPServer,
  useMCPServerStatus,
} from "../hooks/useMCPServers";
import { MCPServerConfig } from "../lib/api";

interface MCPServerCardProps {
  server: MCPServerConfig;
  onEdit: (server: MCPServerConfig) => void;
}

export function MCPServerCard({ server, onEdit }: MCPServerCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const connectMutation = useConnectMCPServer();
  const disconnectMutation = useDisconnectMCPServer();
  const deleteMutation = useDeleteMCPServer();
  const { data: statusData, isLoading: statusLoading } = useMCPServerStatus(
    server.name,
    !server.isDisabled
  );

  const isConnected = statusData?.connected || false;
  const isLoading =
    statusLoading ||
    connectMutation.isPending ||
    disconnectMutation.isPending ||
    deleteMutation.isPending;

  const handleConnect = () => {
    if (isConnected) {
      disconnectMutation.mutate(server.name);
    } else {
      connectMutation.mutate(server.name);
    }
  };

  const handleDelete = () => {
    deleteMutation.mutate(server.name);
    setShowDeleteConfirm(false);
  };

  return (
    <div className="card relative">
      {/* Connection Status Badge */}
      <div className="absolute top-4 right-4">
        {isLoading ? (
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        ) : isConnected ? (
          <CheckCircle className="w-5 h-5 text-success-500" />
        ) : (
          <XCircle className="w-5 h-5 text-gray-400" />
        )}
      </div>

      {/* Server Info */}
      <div className="pr-12">
        <h3 className="text-lg font-semibold text-gray-900">{server.name}</h3>
        <div className="mt-2 space-y-1">
          <div className="flex items-center text-sm">
            <span className="text-gray-500 w-16">Type:</span>
            <span className="text-gray-700 font-medium">{server.type}</span>
          </div>
          {server.type === "stdio" && server.command && (
            <div className="flex items-start text-sm">
              <span className="text-gray-500 w-16 flex-shrink-0">Command:</span>
              <span className="text-gray-700 font-mono text-xs break-all">
                {server.command}
                {server.args && server.args.length > 0
                  ? ` ${server.args.join(" ")}`
                  : ""}
              </span>
            </div>
          )}
          {server.type === "sse" && server.url && (
            <div className="flex items-start text-sm">
              <span className="text-gray-500 w-16 flex-shrink-0">URL:</span>
              <span className="text-gray-700 font-mono text-xs break-all">
                {server.url}
              </span>
            </div>
          )}
          {server.env && Object.keys(server.env).length > 0 && (
            <div className="flex items-start text-sm">
              <span className="text-gray-500 w-16 flex-shrink-0">Env:</span>
              <span className="text-gray-700 text-xs">
                {Object.keys(server.env).length} variable(s)
              </span>
            </div>
          )}
        </div>

        {/* Status Badge */}
        <div className="mt-3">
          {server.isDisabled ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              Disabled
            </span>
          ) : isConnected ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-100 text-success-800">
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              Disconnected
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      {!showDeleteConfirm ? (
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={handleConnect}
            disabled={isLoading || server.isDisabled}
            className={`btn flex items-center gap-2 ${
              isConnected
                ? "bg-gray-200 text-gray-900 hover:bg-gray-300"
                : "btn-primary"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isConnected ? (
              <>
                <PowerOff className="w-4 h-4" />
                Disconnect
              </>
            ) : (
              <>
                <Power className="w-4 h-4" />
                Connect
              </>
            )}
          </button>
          <button
            onClick={() => onEdit(server)}
            disabled={isLoading}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Edit
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isLoading}
            className="btn bg-error-600 text-white hover:bg-error-700 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      ) : (
        <div className="mt-4 bg-error-50 border border-error-200 rounded-lg p-3">
          <p className="text-sm text-error-800 mb-3">
            Are you sure you want to delete this MCP server? This action cannot
            be undone.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              disabled={isLoading}
              className="btn bg-error-600 text-white hover:bg-error-700 text-sm"
            >
              Yes, Delete
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="btn btn-secondary text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Timestamps */}
      {server.createdAt && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            Created: {new Date(server.createdAt).toLocaleString()}
          </p>
          {server.updatedAt && (
            <p className="text-xs text-gray-500">
              Updated: {new Date(server.updatedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
