import { Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useCreateMCPServer, useUpdateMCPServer } from "../hooks/useMCPServers";
import { MCPServerConfig } from "../lib/api";

interface MCPServerFormProps {
  isOpen: boolean;
  onClose: () => void;
  server?: MCPServerConfig | null;
}

interface FormData {
  name: string;
  type: "stdio" | "sse" | "streamable-http";
  command: string;
  args: string;
  env: Array<{ key: string; value: string; showValue: boolean }>;
  url: string;
  headers: Array<{ key: string; value: string; showValue: boolean }>;
  isDisabled: boolean;
}

export function MCPServerForm({ isOpen, onClose, server }: MCPServerFormProps) {
  const createMutation = useCreateMCPServer();
  const updateMutation = useUpdateMCPServer();

  const [formData, setFormData] = useState<FormData>({
    name: "",
    type: "stdio",
    command: "",
    args: "",
    env: [],
    url: "",
    headers: [],
    isDisabled: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form when server prop changes
  useEffect(() => {
    if (server) {
      setFormData({
        name: server.name,
        type: server.type,
        command: server.command || "",
        args: server.args?.join(" ") || "",
        env: server.env
          ? Object.entries(server.env).map(([key, value]) => ({
              key,
              value,
              showValue: false,
            }))
          : [],
        url: server.url || "",
        headers: server.headers
          ? Object.entries(server.headers).map(([key, value]) => ({
              key,
              value,
              showValue: false,
            }))
          : [],
        isDisabled: server.isDisabled || false,
      });
    } else {
      setFormData({
        name: "",
        type: "stdio",
        command: "",
        args: "",
        env: [],
        url: "",
        headers: [],
        isDisabled: false,
      });
    }
    setErrors({});
  }, [server, isOpen]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (formData.type === "stdio") {
      if (!formData.command.trim()) {
        newErrors.command = "Command is required for stdio servers";
      }
    } else if (formData.type === "sse" || formData.type === "streamable-http") {
      if (!formData.url.trim()) {
        newErrors.url = `URL is required for ${
          formData.type === "sse" ? "SSE" : "Streamable HTTP"
        } servers`;
      } else {
        try {
          new URL(formData.url);
        } catch {
          newErrors.url = "Invalid URL format";
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    const config: Omit<MCPServerConfig, "_id" | "createdAt" | "updatedAt"> = {
      name: formData.name.trim(),
      type: formData.type,
      isDisabled: formData.isDisabled,
    };

    if (formData.type === "stdio") {
      config.command = formData.command.trim();
      if (formData.args.trim()) {
        config.args = formData.args
          .split(" ")
          .map((arg) => arg.trim())
          .filter((arg) => arg);
      }
      if (formData.env.length > 0) {
        config.env = Object.fromEntries(
          formData.env
            .filter((e) => e.key && e.value)
            .map((e) => [e.key, e.value])
        );
      }
    } else if (formData.type === "sse" || formData.type === "streamable-http") {
      config.url = formData.url.trim();
      if (formData.headers.length > 0) {
        config.headers = Object.fromEntries(
          formData.headers
            .filter((h) => h.key && h.value)
            .map((h) => [h.key, h.value])
        );
      }
    }

    try {
      if (server) {
        await updateMutation.mutateAsync({
          name: server.name,
          config,
        });
      } else {
        await createMutation.mutateAsync(config);
      }
      onClose();
    } catch (error) {
      console.error("Failed to save MCP server:", error);
    }
  };

  const addEnvVar = () => {
    setFormData({
      ...formData,
      env: [...formData.env, { key: "", value: "", showValue: false }],
    });
  };

  const removeEnvVar = (index: number) => {
    setFormData({
      ...formData,
      env: formData.env.filter((_, i) => i !== index),
    });
  };

  const updateEnvVar = (
    index: number,
    field: "key" | "value",
    value: string
  ) => {
    const newEnv = [...formData.env];
    newEnv[index][field] = value;
    setFormData({ ...formData, env: newEnv });
  };

  const toggleEnvVisibility = (index: number) => {
    const newEnv = [...formData.env];
    newEnv[index].showValue = !newEnv[index].showValue;
    setFormData({ ...formData, env: newEnv });
  };

  const addHeader = () => {
    setFormData({
      ...formData,
      headers: [...formData.headers, { key: "", value: "", showValue: false }],
    });
  };

  const removeHeader = (index: number) => {
    setFormData({
      ...formData,
      headers: formData.headers.filter((_, i) => i !== index),
    });
  };

  const updateHeader = (
    index: number,
    field: "key" | "value",
    value: string
  ) => {
    const newHeaders = [...formData.headers];
    newHeaders[index][field] = value;
    setFormData({ ...formData, headers: newHeaders });
  };

  const toggleHeaderVisibility = (index: number) => {
    const newHeaders = [...formData.headers];
    newHeaders[index].showValue = !newHeaders[index].showValue;
    setFormData({ ...formData, headers: newHeaders });
  };

  if (!isOpen) return null;

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {server ? "Edit MCP Server" : "Add MCP Server"}
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="p-6 overflow-y-auto max-h-[calc(90vh-140px)] text-left"
        >
          {/* Name */}
          <div className="mb-4 ">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Server Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              disabled={isLoading || !!server}
              className="input"
              placeholder="my-mcp-server"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-error-600 dark:text-error-400">
                {errors.name}
              </p>
            )}
            {server && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Server name cannot be changed
              </p>
            )}
          </div>

          {/* Type */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Server Type *
            </label>
            <select
              value={formData.type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  type: e.target.value as "stdio" | "sse" | "streamable-http",
                })
              }
              disabled={isLoading}
              className="input"
            >
              <option value="stdio">STDIO (Command-based)</option>
              <option value="sse">SSE (Server-Sent Events)</option>
              <option value="streamable-http">Streamable HTTP</option>
            </select>
          </div>

          {/* STDIO Fields */}
          {formData.type === "stdio" && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Command *
                </label>
                <input
                  type="text"
                  value={formData.command}
                  onChange={(e) =>
                    setFormData({ ...formData, command: e.target.value })
                  }
                  disabled={isLoading}
                  className="input"
                  placeholder="node"
                />
                {errors.command && (
                  <p className="mt-1 text-sm text-error-600 dark:text-error-400">
                    {errors.command}
                  </p>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Arguments
                </label>
                <input
                  type="text"
                  value={formData.args}
                  onChange={(e) =>
                    setFormData({ ...formData, args: e.target.value })
                  }
                  disabled={isLoading}
                  className="input"
                  placeholder="path/to/server.js --option value"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Space-separated arguments
                </p>
              </div>

              {/* Environment Variables */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Environment Variables
                  </label>
                  <button
                    type="button"
                    onClick={addEnvVar}
                    disabled={isLoading}
                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Add Variable
                  </button>
                </div>
                {formData.env.map((env, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={env.key}
                      onChange={(e) =>
                        updateEnvVar(index, "key", e.target.value)
                      }
                      disabled={isLoading}
                      className="input flex-1"
                      placeholder="KEY"
                    />
                    <div className="flex-1 relative">
                      <input
                        type={env.showValue ? "text" : "password"}
                        value={env.value}
                        onChange={(e) =>
                          updateEnvVar(index, "value", e.target.value)
                        }
                        disabled={isLoading}
                        className="input w-full pr-10"
                        placeholder="value"
                      />
                      <button
                        type="button"
                        onClick={() => toggleEnvVisibility(index)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        {env.showValue ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeEnvVar(index)}
                      disabled={isLoading}
                      className="text-error-600 dark:text-error-400 hover:text-error-700 dark:hover:text-error-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* SSE and Streamable HTTP Fields */}
          {(formData.type === "sse" || formData.type === "streamable-http") && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  URL *
                </label>
                <input
                  type="text"
                  value={formData.url}
                  onChange={(e) =>
                    setFormData({ ...formData, url: e.target.value })
                  }
                  disabled={isLoading}
                  className="input"
                  placeholder="https://example.com/mcp"
                />
                {errors.url && (
                  <p className="mt-1 text-sm text-error-600 dark:text-error-400">
                    {errors.url}
                  </p>
                )}
              </div>

              {/* Headers */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Headers
                  </label>
                  <button
                    type="button"
                    onClick={addHeader}
                    disabled={isLoading}
                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Add Header
                  </button>
                </div>
                {formData.headers.map((header, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={header.key}
                      onChange={(e) =>
                        updateHeader(index, "key", e.target.value)
                      }
                      disabled={isLoading}
                      className="input flex-1"
                      placeholder="Header-Name"
                    />
                    <div className="flex-1 relative">
                      <input
                        type={header.showValue ? "text" : "password"}
                        value={header.value}
                        onChange={(e) =>
                          updateHeader(index, "value", e.target.value)
                        }
                        disabled={isLoading}
                        className="input w-full pr-10"
                        placeholder="value"
                      />
                      <button
                        type="button"
                        onClick={() => toggleHeaderVisibility(index)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        {header.showValue ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeHeader(index)}
                      disabled={isLoading}
                      className="text-error-600 dark:text-error-400 hover:text-error-700 dark:hover:text-error-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Disabled Toggle */}
          <div className="mb-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isDisabled}
                onChange={(e) =>
                  setFormData({ ...formData, isDisabled: e.target.checked })
                }
                disabled={isLoading}
                className="w-4 h-4 text-primary-600 dark:text-primary-500 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 dark:focus:ring-primary-400"
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Disable this server (prevent automatic connection)
              </span>
            </label>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="btn btn-primary"
          >
            {isLoading
              ? "Saving..."
              : server
              ? "Update Server"
              : "Create Server"}
          </button>
        </div>
      </div>
    </div>
  );
}
