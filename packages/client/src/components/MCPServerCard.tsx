import {
  CheckCircle,
  Loader2,
  Power,
  PowerOff,
  RefreshCw,
  Settings,
  Trash2,
  XCircle,
  MessageSquare,
  Github,
  Video,
  HardDrive,
  FileText,
  Server,
} from "lucide-react";
import { useState } from "react";
import { capitalCase } from "change-case";
import {
  useConnectMCPServer,
  useDeleteMCPServer,
  useDisconnectMCPServer,
  useMCPServerStatus,
  useSyncMCPServer,
} from "../hooks/useMCPServers";
import { MCPServerConfig } from "../lib/api";

interface MCPServerCardProps {
  server: MCPServerConfig;
  onEdit: (server: MCPServerConfig) => void;
}

// Helper function to get service icon based on server name
function getServiceIcon(serverName: string) {
  const name = serverName.toLowerCase();

  if (name.includes("slack")) {
    return MessageSquare;
  } else if (name.includes("github")) {
    return Github;
  } else if (name.includes("fathom")) {
    return Video;
  } else if (name.includes("google") || name.includes("drive")) {
    return HardDrive;
  } else if (name.includes("notion")) {
    return FileText;
  }

  return Server;
}

export function MCPServerCard({ server, onEdit }: MCPServerCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [_syncJobId, setSyncJobId] = useState<string | null>(null);

  const connectMutation = useConnectMCPServer();
  const disconnectMutation = useDisconnectMCPServer();
  const deleteMutation = useDeleteMCPServer();
  const syncMutation = useSyncMCPServer();
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

  const handleSync = async () => {
    try {
      const result = await syncMutation.mutateAsync({
        configId: server._id,
        name: server.name,
      });

      // Get jobId from response
      const jobId = result.data.data?.jobId;
      if (jobId) {
        setSyncJobId(jobId);
      }
    } catch (error) {
      // Error already handled by mutation
    }
  };

  const ServiceIcon = getServiceIcon(server.name);

  return (
    <div className="card relative flex flex-col">
      {/* Connection Status Badge */}
      <div className="absolute top-4 right-4">
        {isLoading ? (
          <Loader2 className="w-5 h-5 text-gray-400 dark:text-gray-500 animate-spin" />
        ) : isConnected ? (
          <CheckCircle className="w-5 h-5 text-success-500 dark:text-success-400" />
        ) : (
          <XCircle className="w-5 h-5 text-gray-400 dark:text-gray-500" />
        )}
      </div>

      {/* Server Info */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`p-2.5 rounded-lg text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30`}
          >
            <ServiceIcon className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {capitalCase(server.name)}
          </h3>
        </div>
        <div className="mt-2 space-y-1 grid grid-cols-[15%_85%] gap-2 text-left">
          <div className="flex items-left text-sm col-start-auto">
            <span className="text-gray-500 dark:text-gray-400 w-16">Type:</span>
          </div>
          <div>
            <span className="text-gray-700 dark:text-gray-300 font-medium">
              {server.type}
            </span>
          </div>
          {server.type === "stdio" && server.command && (
            <>
              <div className="flex items-start text-sm">
                <span className="text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">
                  Command:
                </span>
              </div>
              <div>
                <span className="text-gray-700 dark:text-gray-300 font-mono text-xs break-all">
                  {server.command}
                  {server.args && server.args.length > 0
                    ? ` ${server.args.join(" ")}`
                    : ""}
                </span>
              </div>
            </>
          )}
          {server.type === "sse" && server.url && (
            <>
              {" "}
              <div className="flex items-start text-sm">
                <span className="text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">
                  URL:
                </span>
              </div>
              <div>
                <span className="text-gray-700 dark:text-gray-300 font-mono text-xs break-all">
                  {server.url}
                </span>
              </div>
            </>
          )}
          {server.env && Object.keys(server.env).length > 0 && (
            <>
              <div className="flex items-start text-sm">
                <span className="text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">
                  Env:
                </span>
              </div>
              <div>
                <span className="text-gray-700 dark:text-gray-300 text-xs">
                  {Object.keys(server.env).length} variable(s)
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sync Progress Bar */}
      {/* {isSyncing && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {syncProgress.state === "waiting" ? "Queued..." : "Syncing..."}
            </span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {syncProgress.progress}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
            <div
              className="bg-primary-600 dark:bg-primary-500 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${syncProgress.progress}%` }}
            ></div>
          </div>
        </div>
      )} */}

      {/* Actions */}
      {!showDeleteConfirm ? (
        <div className="mt-auto ">
          {/* Status Badge */}
          <div className="mt-3">
            {server.isDisabled ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                Disabled
              </span>
            ) : isConnected ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-100 dark:bg-success-900 text-success-800 dark:text-success-200">
                Connected
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                Disconnected
              </span>
            )}
          </div>
          <div className="pt-4 flex items-center justify-center gap-2 flex-wrap">
            <button
              onClick={handleConnect}
              disabled={isLoading || server.isDisabled}
              className={`btn flex items-center gap-2 ${
                isConnected
                  ? "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600"
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
            {isConnected && (
              <button
                onClick={handleSync}
                disabled={syncMutation.isPending || isLoading}
                className="btn btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    syncMutation.isPending ? "animate-spin" : ""
                  }`}
                />
                Sync
              </button>
            )}
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
              className="btn bg-error-600 dark:bg-error-500 text-white hover:bg-error-700 dark:hover:bg-error-600 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg p-3">
          <p className="text-sm text-error-800 dark:text-error-200 mb-3">
            Are you sure you want to delete this MCP server? This action cannot
            be undone.
          </p>
          <div className="flex items-center gap-2 justify-center">
            <button
              onClick={handleDelete}
              disabled={isLoading}
              className="btn bg-error-600 dark:bg-error-500 text-white hover:bg-error-700 dark:hover:bg-error-600 text-sm"
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
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Created: {new Date(server.createdAt).toLocaleString()}
          </p>
          {server.updatedAt && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Updated: {new Date(server.updatedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
