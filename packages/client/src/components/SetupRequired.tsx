import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Settings } from "lucide-react";
import { api } from "../lib/api";

interface EnvStatus {
  setupComplete: boolean;
  configured: string[];
  missing: string[];
  optional: string[];
}

interface SetupRequiredProps {
  onSetupComplete?: () => void;
}

interface EnvConfig {
  LLM_PROVIDER: string;
  LLM_API_KEY: string;
  LLM_BASE_URL: string;
  LLM_CHAT_MODEL: string;
  LLM_EMBEDDING_MODEL: string;
  LLM_INDEXING_CONFIG_MODEL: string;
  RERANKER_ENABLED: string;
  RERANKER_API_KEY: string;
  RERANKER_BASE_URL: string;
  RERANKER_MODEL: string;
  ENCRYPTION_KEY: string;
  DB_INDEXING_CONCURRENCY: string;
  SCHEMA_LEARNING_CONCURRENCY: string;
  VECTOR_INDEXING_CONCURRENCY: string;
  GRAPH_EXTRACTION_CONCURRENCY: string;
}

export function SetupRequired({ onSetupComplete }: SetupRequiredProps) {
  const [status, setStatus] = useState<EnvStatus | null>(null);
  const [config, setConfig] = useState<EnvConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statusRes, configRes] = await Promise.all([
        api.get("/config/env/status"),
        api.get("/config/env"),
      ]);

      if (statusRes.data.success && statusRes.data.data) {
        const envStatus = statusRes.data.data;
        setStatus(envStatus);

        if (envStatus.setupComplete && onSetupComplete) {
          onSetupComplete();
        }
      }

      if (configRes.data.success) {
        setConfig(configRes.data.data);
      }
    } catch (err) {
      console.error("Failed to load configuration:", err);
      setMessage({
        type: "error",
        text: "Failed to load configuration. Please ensure the server is running.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    setMessage(null);

    try {
      const response = await api.put("/config/env", config);
      setMessage({
        type: "success",
        text:
          response.data?.message ||
          "Configuration saved successfully. Restart the server to apply changes.",
      });

      setTimeout(() => {
        loadData();
      }, 1000);
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error.response?.data?.error || "Failed to save configuration",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRestart = async () => {
    if (!confirm("Are you sure you want to restart the server?")) return;

    try {
      await api.post("/config/restart");
      setMessage({
        type: "success",
        text: "Server is restarting... Page will reload shortly.",
      });
      setTimeout(() => window.location.reload(), 3000);
    } catch (error) {
      setMessage({
        type: "error",
        text: "Failed to restart server",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-secondary">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-brand-purple border-t-transparent mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading configuration...</p>
        </div>
      </div>
    );
  }

  if (!config || !status) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-secondary p-4">
        <div className="card max-w-md w-full">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <h3 className="font-semibold mb-2">Connection Error</h3>
              <p className="text-sm text-text-secondary mb-4">
                Unable to load environment configuration. Please ensure the
                server is running.
              </p>
              <button onClick={loadData} className="btn btn-secondary btn-sm">
                Retry Connection
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-secondary overflow-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-xl gradient-purple flex items-center justify-center mx-auto mb-4">
            <Settings className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Welcome to eBee</h1>
          <p className="text-text-secondary">
            Configure your environment to get started
          </p>
        </div>

        {/* Warning Banner */}
        {status.missing.length > 0 && (
          <div className="bg-warning-bg border border-warning-border rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-warning-text mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-warning-text mb-2">
                  Configuration Required
                </p>
                <p className="text-sm text-text-secondary mb-2">
                  The following environment variables need to be configured:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {status.missing.map((key) => (
                    <code
                      key={key}
                      className="text-xs bg-error-bg border border-error-border text-error-text px-2 py-0.5 rounded"
                    >
                      {key}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        {message && (
          <div
            className={`p-4 rounded-lg mb-6 ${
              message.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* LLM Configuration */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">LLM Configuration</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Provider</label>
              <select
                value={config.LLM_PROVIDER}
                onChange={(e) =>
                  setConfig({ ...config, LLM_PROVIDER: e.target.value })
                }
                className="input w-full"
              >
                <option value="openrouter">OpenRouter</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="azure">Azure</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                API Key <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={config.LLM_API_KEY}
                onChange={(e) =>
                  setConfig({ ...config, LLM_API_KEY: e.target.value })
                }
                className="input w-full"
                placeholder="Enter your LLM API key"
              />
              <p className="text-sm text-gray-500 mt-1">
                Get your API key from{" "}
                {config.LLM_PROVIDER === "openrouter" && (
                  <a
                    href="https://openrouter.ai/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    OpenRouter
                  </a>
                )}
                {config.LLM_PROVIDER === "openai" && (
                  <a
                    href="https://platform.openai.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    OpenAI
                  </a>
                )}
                {config.LLM_PROVIDER === "anthropic" && (
                  <a
                    href="https://console.anthropic.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Anthropic
                  </a>
                )}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Base URL (optional)
              </label>
              <input
                type="text"
                value={config.LLM_BASE_URL}
                onChange={(e) =>
                  setConfig({ ...config, LLM_BASE_URL: e.target.value })
                }
                className="input w-full"
                placeholder="Leave empty for default"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Chat Model
              </label>
              <input
                type="text"
                value={config.LLM_CHAT_MODEL}
                onChange={(e) =>
                  setConfig({ ...config, LLM_CHAT_MODEL: e.target.value })
                }
                className="input w-full"
                placeholder="e.g., openai/gpt-oss-20b"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Embedding Model
              </label>
              <input
                type="text"
                value={config.LLM_EMBEDDING_MODEL}
                onChange={(e) =>
                  setConfig({ ...config, LLM_EMBEDDING_MODEL: e.target.value })
                }
                className="input w-full"
                placeholder="e.g., qwen/qwen3-embedding-4b"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Indexing Config Model <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={config.LLM_INDEXING_CONFIG_MODEL}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    LLM_INDEXING_CONFIG_MODEL: e.target.value,
                  })
                }
                className="input w-full"
                placeholder="e.g., openai/gpt-oss-120b"
              />
            </div>
          </div>
        </div>

        {/* Reranker Configuration */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">
            Reranker Configuration (Optional)
          </h3>
          <div className="space-y-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={config.RERANKER_ENABLED === "true"}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    RERANKER_ENABLED: e.target.checked ? "true" : "false",
                  })
                }
                className="mr-2"
              />
              <label className="text-sm font-medium">Enable Reranker</label>
            </div>

            {config.RERANKER_ENABLED === "true" && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Reranker API Key
                  </label>
                  <input
                    type="password"
                    value={config.RERANKER_API_KEY}
                    onChange={(e) =>
                      setConfig({ ...config, RERANKER_API_KEY: e.target.value })
                    }
                    className="input w-full"
                    placeholder="Enter Fireworks API key"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Reranker Base URL
                  </label>
                  <input
                    type="text"
                    value={config.RERANKER_BASE_URL}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        RERANKER_BASE_URL: e.target.value,
                      })
                    }
                    className="input w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Reranker Model
                  </label>
                  <input
                    type="text"
                    value={config.RERANKER_MODEL}
                    onChange={(e) =>
                      setConfig({ ...config, RERANKER_MODEL: e.target.value })
                    }
                    className="input w-full"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Performance Configuration */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">
            Performance Configuration
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                DB Indexing Concurrency
              </label>
              <input
                type="number"
                value={config.DB_INDEXING_CONCURRENCY}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    DB_INDEXING_CONCURRENCY: e.target.value,
                  })
                }
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Schema Learning Concurrency
              </label>
              <input
                type="number"
                value={config.SCHEMA_LEARNING_CONCURRENCY}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    SCHEMA_LEARNING_CONCURRENCY: e.target.value,
                  })
                }
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Vector Indexing Concurrency
              </label>
              <input
                type="number"
                value={config.VECTOR_INDEXING_CONCURRENCY}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    VECTOR_INDEXING_CONCURRENCY: e.target.value,
                  })
                }
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Graph Extraction Concurrency
              </label>
              <input
                type="number"
                value={config.GRAPH_EXTRACTION_CONCURRENCY}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    GRAPH_EXTRACTION_CONCURRENCY: e.target.value,
                  })
                }
                className="input w-full"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? "Saving..." : "Save Configuration"}
          </button>
          <button onClick={handleRestart} className="btn btn-secondary">
            Restart Server
          </button>
        </div>
        {/* Already Configured */}
        {status.configured.length > 0 && (
          <div className="card">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-brand-success mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium mb-2">Already Configured</p>
                <div className="flex flex-wrap gap-1.5">
                  {status.configured.map((key) => (
                    <code
                      key={key}
                      className="text-xs bg-success-bg border border-success-border text-success-text px-2 py-0.5 rounded"
                    >
                      {key}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
