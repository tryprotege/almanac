import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { DataSourceConfig } from "../../lib/api";

interface AdvancedConfigFormProps {
  server?: DataSourceConfig | null;
  onBack: () => void;
  onSubmit: (
    config: Omit<DataSourceConfig, "_id" | "createdAt" | "updatedAt">
  ) => void;
  isLoading: boolean;
}

interface FormData {
  name: string;
  type: "stdio" | "sse" | "streamable-http";
  command: string;
  args: string;
  env: Array<{ key: string; value: string; showValue: boolean }>;
  url: string;
  headers: Array<{ key: string; value: string; showValue: boolean }>;
  authType: "none" | "api-key" | "oauth";
  isDisabled: boolean;
}

export function AdvancedConfigForm({
  server,
  onBack,
  onSubmit,
  isLoading,
}: AdvancedConfigFormProps) {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    type: "stdio",
    command: "",
    args: "",
    env: [],
    url: "",
    headers: [],
    authType: "none",
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
        authType: server.authType || "none",
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
        authType: "none",
        isDisabled: false,
      });
    }
    setErrors({});
  }, [server]);

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

      // OAuth validation removed - handled automatically by SDK
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    const config: Omit<DataSourceConfig, "_id" | "createdAt" | "updatedAt"> = {
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

      // Add authType
      config.authType = formData.authType;

      // Add headers if not using OAuth
      if (formData.authType !== "oauth" && formData.headers.length > 0) {
        // Only add headers if not using OAuth
        config.headers = Object.fromEntries(
          formData.headers
            .filter((h) => h.key && h.value)
            .map((h) => [h.key, h.value])
        );
      }
    }

    onSubmit(config);
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

  return (
    <form onSubmit={handleSubmit} className="p-6 text-left space-y-4">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Server Name *
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          disabled={isLoading || !!server}
          className="input"
          placeholder="my-mcp-server"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-brand-error">{errors.name}</p>
        )}
        {server && (
          <p className="mt-1 text-xs text-text-quaternary">
            Server name cannot be changed
          </p>
        )}
      </div>

      {/* Type */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
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
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
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
              <p className="mt-1 text-sm text-brand-error">{errors.command}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
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
            <p className="mt-1 text-xs text-text-quaternary">
              Space-separated arguments
            </p>
          </div>

          {/* Environment Variables */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-text-secondary">
                Environment Variables
              </label>
              <button
                type="button"
                onClick={addEnvVar}
                disabled={isLoading}
                className="text-sm text-brand-purple hover:text-brand-purple/80 flex items-center gap-1"
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
                  onChange={(e) => updateEnvVar(index, "key", e.target.value)}
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-quaternary hover:text-text-secondary"
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
                  className="text-brand-error hover:text-brand-error/80"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Authentication (only for network-based servers) */}
      {(formData.type === "sse" || formData.type === "streamable-http") && (
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Authentication
          </label>
          <select
            value={formData.authType}
            onChange={(e) =>
              setFormData({
                ...formData,
                authType: e.target.value as "none" | "api-key" | "oauth",
              })
            }
            disabled={isLoading}
            className="input"
          >
            <option value="none">None</option>
            <option value="api-key">API Key (via headers)</option>
            <option value="oauth">OAuth 2.1</option>
          </select>
          <p className="mt-1 text-xs text-text-quaternary">
            {formData.authType === "none" && "No authentication required"}
            {formData.authType === "api-key" &&
              "Add API key as a custom header below"}
            {formData.authType === "oauth" &&
              "OAuth flow will be triggered after server creation"}
          </p>
        </div>
      )}

      {/* SSE and Streamable HTTP Fields */}
      {(formData.type === "sse" || formData.type === "streamable-http") && (
        <>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
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
              <p className="mt-1 text-sm text-brand-error">{errors.url}</p>
            )}
          </div>

          {/* Headers (only show if not using OAuth, since OAuth uses Bearer token) */}
          {formData.authType !== "oauth" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-text-secondary">
                  Headers
                </label>
                <button
                  type="button"
                  onClick={addHeader}
                  disabled={isLoading}
                  className="text-sm text-brand-purple hover:text-brand-purple/80 flex items-center gap-1"
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
                    onChange={(e) => updateHeader(index, "key", e.target.value)}
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
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-quaternary hover:text-text-secondary"
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
                    className="text-brand-error hover:text-brand-error/80"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* OAuth Configuration - Simplified */}
          {formData.authType === "oauth" && (
            <div className="border border-brand-purple/30 rounded-lg p-4 bg-brand-purple/10">
              <div className="flex items-start gap-3">
                <div className="text-brand-purple text-xl">🔐</div>
                <div>
                  <h4 className="text-sm font-semibold text-text-primary mb-1">
                    OAuth 2.1 Authentication
                  </h4>
                  <p className="text-sm text-text-secondary mb-2">
                    OAuth will be configured automatically when you connect. The
                    server will discover OAuth endpoints and handle
                    authentication for you.
                  </p>
                  <p className="text-xs text-text-quaternary">
                    After creating this server, click "Connect" to start the
                    OAuth flow. You'll be redirected to authorize access.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Disabled Toggle */}
      <div>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={formData.isDisabled}
            onChange={(e) =>
              setFormData({ ...formData, isDisabled: e.target.checked })
            }
            disabled={isLoading}
            className="w-4 h-4 text-brand-purple border-border-primary rounded focus:ring-brand-purple"
          />
          <span className="ml-2 text-sm text-text-secondary">
            Disable this server (prevent automatic connection)
          </span>
        </label>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-border-secondary">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="btn btn-secondary w-full sm:flex-1 sm:max-w-[200px]"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="btn btn-primary w-full sm:flex-1 sm:max-w-[200px]"
        >
          {isLoading ? "Saving..." : server ? "Update Server" : "Create Server"}
        </button>
      </div>
    </form>
  );
}
