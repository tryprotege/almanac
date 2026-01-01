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
  Shield,
} from "lucide-react";
import { useState, useEffect } from "react";
import { capitalCase } from "change-case";
import {
  useConnectDataSource,
  useDeleteDataSource,
  useDisconnectDataSource,
  useDataSourceStatus,
  useSyncDataSource,
} from "../hooks/useDataSources";
import { DataSourceConfig } from "../lib/api";
import { OAuthConnectButton } from "./OAuthConnectButton";

interface MCPServerCardProps {
  server: DataSourceConfig;
  onEdit: (server: DataSourceConfig) => void;
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
  const [oauthStatus, setOauthStatus] = useState<{
    connected: boolean;
    expiresAt?: string;
  } | null>(null);

  const connectMutation = useConnectDataSource();
  const disconnectMutation = useDisconnectDataSource();
  const deleteMutation = useDeleteDataSource();
  const syncMutation = useSyncDataSource();
  const { data: statusData, isLoading: statusLoading } = useDataSourceStatus(
    server.name,
    !server.isDisabled
  );

  const isConnected = statusData?.connected || false;
  const isLoading =
    statusLoading ||
    connectMutation.isPending ||
    disconnectMutation.isPending ||
    deleteMutation.isPending;

  // Check OAuth status if server uses OAuth
  useEffect(() => {
    if (server.authType === "oauth" && server._id) {
      fetch(`/api/oauth/status/${server._id}`)
        .then((res) => res.json())
        .then((data) => setOauthStatus(data))
        .catch(() => setOauthStatus(null));
    }
  }, [server._id, server.authType]);

  const requiresOAuth = server.authType === "oauth";
  const oauthConnected = oauthStatus?.connected || false;
  const oauthExpired = requiresOAuth && !oauthConnected;

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
    if (!server._id) return;

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
      {/* Server Info */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-lg text-brand-purple bg-brand-purple/10">
            <ServiceIcon className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary">
            {capitalCase(server.name)}
          </h3>
        </div>
        <div className="mt-2 space-y-1 grid grid-cols-[15%_85%] gap-2 text-left">
          <div className="flex items-left text-sm col-start-auto">
            <span className="text-text-tertiary w-16">Type:</span>
          </div>
          <div>
            <span className="text-text-secondary font-medium">
              {server.type}
            </span>
          </div>
          {server.type === "stdio" && server.command && (
            <>
              <div className="flex items-start text-sm">
                <span className="text-text-tertiary w-16 flex-shrink-0">
                  Command:
                </span>
              </div>
              <div>
                <span className="text-text-secondary font-mono text-xs break-all">
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
                <span className="text-text-tertiary w-16 flex-shrink-0">
                  URL:
                </span>
              </div>
              <div>
                <span className="text-text-secondary font-mono text-xs break-all">
                  {server.url}
                </span>
              </div>
            </>
          )}
          {server.env && Object.keys(server.env).length > 0 && (
            <>
              <div className="flex items-start text-sm">
                <span className="text-text-tertiary w-16 flex-shrink-0">
                  Env:
                </span>
              </div>
              <div>
                <span className="text-text-secondary text-xs">
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
          <div className="mt-3 flex gap-2">
            {server.isDisabled ? (
              <span className="badge badge-neutral">Disabled</span>
            ) : isConnected ? (
              <span className="badge badge-success">Ready</span>
            ) : (
              <span className="badge badge-neutral">Not Ready</span>
            )}
            {requiresOAuth && oauthExpired && (
              <span className="badge badge-error flex items-center gap-1">
                <Shield className="w-3 h-3" />
                OAuth Expired
              </span>
            )}
          </div>
          <div className="pt-4 flex items-center justify-center gap-2 flex-wrap">
            {/* Reconnect OAuth Button (only if OAuth expired) */}
            {oauthExpired && server._id && (
              <OAuthConnectButton
                mcpServerId={server._id}
                mcpServerName={server.name}
                serverType={server.type}
                authConfig={server.oauth}
                onSuccess={() => {
                  // Refresh OAuth status
                  fetch(`/api/oauth/status/${server._id}`)
                    .then((res) => res.json())
                    .then((data) => setOauthStatus(data))
                    .catch(() => setOauthStatus(null));
                }}
              />
            )}
            {/* Sync Button - only show when connected (not for OAuth expired) */}
            {isConnected && !oauthExpired && (
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
              className="btn bg-brand-error text-white hover:bg-brand-error/90 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 bg-brand-error/10 border border-brand-error/30 rounded-lg p-3">
          <p className="text-sm text-brand-error mb-3">
            Are you sure you want to delete this data source? This action cannot
            be undone.
          </p>
          <div className="flex items-center gap-2 justify-center">
            <button
              onClick={handleDelete}
              disabled={isLoading}
              className="btn bg-brand-error text-white hover:bg-brand-error/90 text-sm"
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
        <div className="mt-4 pt-4 border-t border-border-secondary">
          <p className="text-xs text-text-quaternary">
            Created: {new Date(server.createdAt).toLocaleString()}
          </p>
          {server.updatedAt && (
            <p className="text-xs text-text-quaternary">
              Updated: {new Date(server.updatedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
