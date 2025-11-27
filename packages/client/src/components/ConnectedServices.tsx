import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useMCPServers } from "../hooks/useMCPServers";
import { mcpServersApi } from "../lib/api";

function formatTimeAgo(date: string | undefined): string {
  if (!date) return "Never";

  const now = new Date();
  const syncDate = new Date(date);
  const diffMs = now.getTime() - syncDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function ConnectedServices() {
  const { servers, isLoading } = useMCPServers();
  const queryClient = useQueryClient();

  const connectMutation = useMutation({
    mutationFn: (name: string) => mcpServersApi.connect(name),
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      toast.success(`Connected to ${name}`);
    },
    onError: (error: Error, name) => {
      toast.error(`Failed to connect to ${name}: ${error.message}`);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (name: string) => mcpServersApi.disconnect(name),
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      toast.success(`Disconnected from ${name}`);
    },
    onError: (error: Error, name) => {
      toast.error(`Failed to disconnect from ${name}: ${error.message}`);
    },
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          🔌 Connected Services
        </h2>
        <div className="animate-pulse space-y-4">
          <div className="h-16 bg-gray-200 rounded"></div>
          <div className="h-16 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          🔌 Connected Services
        </h2>
        <p className="text-gray-500 text-center py-8">
          No MCP servers configured yet
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        🔌 Connected Services
      </h2>
      <div className="space-y-3">
        {servers.map((server) => {
          const isConnected = !server.isDisabled;

          return (
            <div
              key={server.name}
              className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <span className="text-2xl">{isConnected ? "✅" : "⚠️"}</span>
                <div>
                  <div className="font-medium text-gray-900">{server.name}</div>
                  <div className="text-sm text-gray-500">
                    {isConnected ? "Connected" : "Disconnected"} •{" "}
                    {formatTimeAgo(server.updatedAt)}
                  </div>
                </div>
              </div>
              <div>
                {isConnected ? (
                  <button
                    onClick={() => disconnectMutation.mutate(server.name)}
                    disabled={disconnectMutation.isPending}
                    className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => connectMutation.mutate(server.name)}
                    disabled={connectMutation.isPending}
                    className="px-3 py-1 text-sm text-primary-600 hover:bg-primary-50 rounded-md transition-colors disabled:opacity-50"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
