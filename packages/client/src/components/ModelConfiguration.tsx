import { Eye, EyeOff, RefreshCw, Save, TestTube } from "lucide-react";
import { useEffect, useState } from "react";
import { useModelConfig } from "../hooks/useModelConfig";

export function ModelConfiguration() {
  const {
    config,
    isLoading,
    updateConfig,
    isUpdating,
    testConnection,
    isTesting,
  } = useModelConfig();

  const [formData, setFormData] = useState({
    llmProvider: "openrouter" as
      | "openai"
      | "openrouter"
      | "azure"
      | "anthropic",
    llmApiKey: "",
    llmBaseURL: "",
    llmChatModel: "",
    llmEmbeddingModel: "",
    rerankerEnabled: false,
    rerankerApiKey: "",
    rerankerBaseURL: "",
    rerankerModel: "",
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [showRerankerKey, setShowRerankerKey] = useState(false);

  useEffect(() => {
    if (config) {
      setFormData({
        llmProvider: config.llmProvider,
        llmApiKey: config.llmApiKey || "",
        llmBaseURL: config.llmBaseURL || "",
        llmChatModel: config.llmChatModel,
        llmEmbeddingModel: config.llmEmbeddingModel,
        rerankerEnabled: config.rerankerEnabled,
        rerankerApiKey: config.rerankerApiKey || "",
        rerankerBaseURL: config.rerankerBaseURL || "",
        rerankerModel: config.rerankerModel || "",
      });
    }
  }, [config]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateConfig(formData);
  };

  const handleTestConnection = () => {
    testConnection({
      llmProvider: formData.llmProvider,
      llmApiKey: formData.llmApiKey,
      llmBaseURL: formData.llmBaseURL,
      llmChatModel: formData.llmChatModel,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-6 h-6 animate-spin text-primary-600 dark:text-primary-400" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* LLM Configuration */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          LLM Configuration
        </h3>

        {/* Provider Selection */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Provider
            </label>
            <select
              value={formData.llmProvider}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  llmProvider: e.target.value as any,
                })
              }
              className="input"
            >
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="azure">Azure OpenAI</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Select your LLM provider
            </p>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={formData.llmApiKey}
                onChange={(e) =>
                  setFormData({ ...formData, llmApiKey: e.target.value })
                }
                className="input pr-10"
                placeholder="sk-..."
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                {showApiKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Your API key is encrypted and stored securely
            </p>
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Base URL (Optional)
            </label>
            <input
              type="url"
              value={formData.llmBaseURL}
              onChange={(e) =>
                setFormData({ ...formData, llmBaseURL: e.target.value })
              }
              className="input"
              placeholder="https://api.openrouter.ai/api/v1"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Custom API endpoint (leave empty for provider default)
            </p>
          </div>

          {/* Chat Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Chat Model
            </label>
            <input
              type="text"
              value={formData.llmChatModel}
              onChange={(e) =>
                setFormData({ ...formData, llmChatModel: e.target.value })
              }
              className="input"
              placeholder="openai/gpt-4o-mini"
              required
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Model for chat completions and text generation
            </p>
          </div>

          {/* Embedding Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Embedding Model
            </label>
            <input
              type="text"
              value={formData.llmEmbeddingModel}
              onChange={(e) =>
                setFormData({ ...formData, llmEmbeddingModel: e.target.value })
              }
              className="input"
              placeholder="text-embedding-3-small"
              required
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Model for generating vector embeddings
            </p>
          </div>
        </div>
      </div>

      {/* Reranker Configuration */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Reranker Configuration
          </h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.rerankerEnabled}
              onChange={(e) =>
                setFormData({ ...formData, rerankerEnabled: e.target.checked })
              }
              className="rounded border-gray-300 dark:border-gray-600 text-primary-600 dark:text-primary-500 focus:ring-primary-500 dark:focus:ring-primary-400"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Enable Reranker
            </span>
          </label>
        </div>

        {formData.rerankerEnabled && (
          <div className="space-y-4">
            {/* Reranker API Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Reranker API Key
              </label>
              <div className="relative">
                <input
                  type={showRerankerKey ? "text" : "password"}
                  value={formData.rerankerApiKey}
                  onChange={(e) =>
                    setFormData({ ...formData, rerankerApiKey: e.target.value })
                  }
                  className="input pr-10"
                  placeholder="API key for reranker service"
                />
                <button
                  type="button"
                  onClick={() => setShowRerankerKey(!showRerankerKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  {showRerankerKey ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Reranker Base URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Reranker Base URL
              </label>
              <input
                type="url"
                value={formData.rerankerBaseURL}
                onChange={(e) =>
                  setFormData({ ...formData, rerankerBaseURL: e.target.value })
                }
                className="input"
                placeholder="https://api.deepinfra.com/v1/inference"
              />
            </div>

            {/* Reranker Model */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Reranker Model
              </label>
              <input
                type="text"
                value={formData.rerankerModel}
                onChange={(e) =>
                  setFormData({ ...formData, rerankerModel: e.target.value })
                }
                className="input"
                placeholder="Qwen/Qwen3-Reranker-8B"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Model for reranking search results
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isUpdating}
          className="btn btn-primary flex items-center gap-2"
        >
          {isUpdating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Configuration
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleTestConnection}
          disabled={isTesting || !formData.llmApiKey || !formData.llmChatModel}
          className="btn btn-secondary flex items-center gap-2"
        >
          {isTesting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <TestTube className="w-4 h-4" />
              Test Connection
            </>
          )}
        </button>
      </div>

      {config?.updatedAt && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Last updated: {new Date(config.updatedAt).toLocaleString()}
        </p>
      )}
    </form>
  );
}
