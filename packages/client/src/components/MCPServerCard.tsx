import {
  Loader2,
  RefreshCw,
  Settings,
  Trash2,
  MessageSquare,
  Github,
  Video,
  HardDrive,
  FileText,
  Server,
  Shield,
  FileCode,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { capitalCase } from "change-case";
import {
  useDeleteDataSource,
  useDataSourceStatus,
  useSyncDataSource,
} from "../hooks/useDataSources";
import { DataSourceConfig, SyncConfigSummary } from "../lib/api";
import { OAuthConnectButton } from "./OAuthConnectButton";
import { IconDisplay } from "./ui/IconDisplay";

interface MCPServerCardProps {
  server: DataSourceConfig;
  syncConfig?: SyncConfigSummary;
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

// Helper function to format connection details for subtitle
function getConnectionDetails(server: DataSourceConfig): string {
  const parts: string[] = [server.type];

  if (server.type === "stdio" && server.command) {
    const commandStr =
      server.command + (server.args?.length ? ` ${server.args.join(" ")}` : "");
    parts.push(commandStr);
  } else if (server.type === "sse" && server.url) {
    parts.push(server.url);
  }

  return parts.join(" • ");
}

export function MCPServerCard({
  server,
  syncConfig,
  onEdit,
}: MCPServerCardProps) {
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [_syncJobId, setSyncJobId] = useState<string | null>(null);
  const [oauthStatus, setOauthStatus] = useState<{
    connected: boolean;
    expiresAt?: string;
  } | null>(null);

  const deleteMutation = useDeleteDataSource();
  const syncMutation = useSyncDataSource();
  const { data: statusData, isLoading: statusLoading } = useDataSourceStatus(
    server.name,
    !server.isDisabled
  );

  const isConnected = statusData?.connected || false;
  const isLoading = statusLoading || deleteMutation.isPending;

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

      const jobId = result.data.data?.jobId;
      if (jobId) {
        setSyncJobId(jobId);
      }
    } catch (error) {
      // Error already handled by mutation
    }
  };

  const ServiceIcon = getServiceIcon(server.name);
  const connectionDetails = getConnectionDetails(server);

  return (
    <div className="card relative flex flex-col">
      {/* Compact Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="p-2 rounded-lg text-brand-purple bg-brand-purple/10 flex-shrink-0">
          <IconDisplay
            icon={syncConfig?.icon}
            fallbackIcon={ServiceIcon}
            size="md"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-text-primary truncate">
              {capitalCase(server.name)}
            </h3>
            {/* Status Indicator Dot */}
            {server.isDisabled ? (
              <span
                className="w-2 h-2 rounded-full bg-text-quaternary flex-shrink-0"
                title="Disabled"
              />
            ) : isConnected ? (
              <span
                className="w-2 h-2 rounded-full bg-brand-success-light flex-shrink-0"
                title="Ready"
              />
            ) : (
              <span
                className="w-2 h-2 rounded-full bg-text-quaternary flex-shrink-0"
                title="Not Ready"
              />
            )}
          </div>
          {/* Compact Connection Details */}
          <p className="text-xs text-text-tertiary truncate font-mono">
            {connectionDetails}
          </p>
        </div>
      </div>

      {/* OAuth Reconnection Alert - Only when expired */}
      {oauthExpired && server._id && (
        <div className="mb-3 bg-warning-bg border border-warning-border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-warning-text flex-shrink-0" />
            <span className="text-sm font-medium text-warning-text">
              OAuth session expired
            </span>
          </div>
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
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="mb-3 bg-error-bg border border-error-border rounded-lg p-3">
          <p className="text-sm text-error-text mb-3">
            Delete this data source? This action cannot be undone.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              disabled={isLoading}
              className="btn bg-error-border text-white hover:bg-error-text text-xs px-3 py-1.5"
            >
              Yes, Delete
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="btn btn-secondary text-xs px-3 py-1.5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Icon Action Bar */}
      {!showDeleteConfirm && (
        <div className="flex items-center gap-1 pt-3 border-t border-border-secondary">
          {/* Configure Indexing - show unless disabled or OAuth expired */}
          {!server.isDisabled && !oauthExpired && (
            <button
              onClick={() => navigate(`/data-sources/${server.name}/config`)}
              className="btn btn-icon-sm btn-ghost"
              title="Configure Indexing"
            >
              <FileCode className="w-4 h-4" />
            </button>
          )}

          {/* Sync - show unless disabled or OAuth expired */}
          {!server.isDisabled && !oauthExpired && (
            <button
              onClick={handleSync}
              disabled={syncMutation.isPending || isLoading}
              className="btn btn-icon-sm btn-ghost disabled:opacity-50 disabled:cursor-not-allowed"
              title="Sync Data"
            >
              <RefreshCw
                className={`w-4 h-4 ${
                  syncMutation.isPending ? "animate-spin" : ""
                }`}
              />
            </button>
          )}

          {/* Edit */}
          <button
            onClick={() => onEdit(server)}
            disabled={isLoading}
            className="btn btn-icon-sm btn-ghost"
            title="Edit Configuration"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Spacer to push delete to the right */}
          <div className="flex-1" />

          {/* Delete */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isLoading}
            className="btn btn-icon-sm btn-ghost text-error-text hover:bg-error-bg"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Timestamps Footer */}
      {server.createdAt && (
        <div className="mt-3 pt-3 border-t border-border-secondary">
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
