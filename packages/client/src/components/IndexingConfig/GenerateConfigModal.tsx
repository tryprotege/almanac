import { AlertCircle, Loader2, X } from "lucide-react";
import { useState } from "react";
import { useMCPServers } from "../../hooks/useMCPServers";
import {
  useGenerateConfig,
  useSaveConfig,
} from "../../hooks/useIndexingConfigs";

interface GenerateConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GenerateConfigModal({
  isOpen,
  onClose,
}: GenerateConfigModalProps) {
  const { servers } = useMCPServers();
  const generateConfig = useGenerateConfig();
  const saveConfig = useSaveConfig();

  const [selectedServer, setSelectedServer] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [step, setStep] = useState<"input" | "generating" | "result">("input");

  const handleGenerate = async () => {
    if (!selectedServer) return;

    setStep("generating");

    try {
      const result = await generateConfig.mutateAsync({
        serverName: selectedServer,
        displayName: displayName || undefined,
      });

      setStep("result");
    } catch (error) {
      console.error("Failed to generate config:", error);
      setStep("input");
    }
  };

  const handleSave = async (status: "draft" | "active") => {
    if (!generateConfig.data?.config) return;

    try {
      await saveConfig.mutateAsync({
        config: generateConfig.data.config,
        status,
      });

      onClose();
      resetForm();
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  };

  const resetForm = () => {
    setSelectedServer("");
    setDisplayName("");
    setStep("input");
    generateConfig.reset();
  };

  const handleClose = () => {
    onClose();
    resetForm();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Generate Indexing Config
          </h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === "input" && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="server-select"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Select MCP Server
                </label>
                <select
                  id="server-select"
                  value={selectedServer}
                  onChange={(e) => setSelectedServer(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Choose a server...</option>
                  {servers?.map((server) => (
                    <option key={server.name} value={server.name}>
                      {server.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="display-name"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Display Name (Optional)
                </label>
                <input
                  id="display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={selectedServer || "My Service"}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
                  What happens next?
                </h3>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
                  <li>
                    Tools will be classified using LLM (READ/SEARCH/WRITE)
                  </li>
                  <li>Only READ tools will be used for indexing</li>
                  <li>Sample data will be fetched to understand structure</li>
                  <li>An IndexingConfig will be generated automatically</li>
                </ul>
              </div>
            </div>
          )}

          {step === "generating" && (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 text-primary-600 dark:text-primary-400 animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Generating Config...
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                This may take a moment while we analyze the MCP server
              </p>
            </div>
          )}

          {step === "result" && generateConfig.data && (
            <div className="space-y-4">
              {/* Tool Classification Summary */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                  Tool Classification
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-2 bg-success-100 dark:bg-success-900/30 rounded">
                    <div className="text-2xl font-bold text-success-700 dark:text-success-400">
                      {generateConfig.data.toolsUsed.length}
                    </div>
                    <div className="text-xs text-success-600 dark:text-success-500">
                      READ Tools
                    </div>
                  </div>
                  <div className="text-center p-2 bg-gray-100 dark:bg-gray-700 rounded">
                    <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                      {Object.keys(generateConfig.data.config.fetchers).length}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Fetchers
                    </div>
                  </div>
                  <div className="text-center p-2 bg-gray-100 dark:bg-gray-700 rounded">
                    <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                      {
                        Object.keys(generateConfig.data.config.recordTypes)
                          .length
                      }
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Record Types
                    </div>
                  </div>
                </div>
              </div>

              {/* Validation Results */}
              {generateConfig.data.validation.errors.length > 0 && (
                <div className="bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-error-600 dark:text-error-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-medium text-error-900 dark:text-error-200">
                        Validation Errors
                      </h3>
                      <ul className="mt-2 text-sm text-error-700 dark:text-error-300 space-y-1">
                        {generateConfig.data.validation.errors.map(
                          (error, i) => (
                            <li key={i}>
                              {error.path}: {error.message}
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {generateConfig.data.validation.warnings.length > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
                        Warnings
                      </h3>
                      <ul className="mt-2 text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                        {generateConfig.data.validation.warnings.map(
                          (warning, i) => (
                            <li key={i}>
                              {warning.path}: {warning.message}
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Success Message */}
              {generateConfig.data.validation.valid && (
                <div className="bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-success-600 dark:bg-success-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-success-900 dark:text-success-200">
                        Config generated successfully!
                      </h3>
                      <p className="mt-1 text-sm text-success-700 dark:text-success-300">
                        The configuration passed all validation checks and is
                        ready to use.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          {step === "input" && (
            <>
              <button onClick={handleClose} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={!selectedServer}
                className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate Config
              </button>
            </>
          )}

          {step === "result" && (
            <>
              <button onClick={handleClose} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => handleSave("draft")}
                disabled={saveConfig.isPending}
                className="btn btn-secondary"
              >
                Save as Draft
              </button>
              <button
                onClick={() => handleSave("active")}
                disabled={
                  saveConfig.isPending || !generateConfig.data?.validation.valid
                }
                className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveConfig.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  "Save & Activate"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
