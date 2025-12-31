import {
  AlertCircle,
  ArrowLeft,
  FileJson,
  Loader2,
  Plus,
  RefreshCw,
  Edit,
  Save,
  X,
  LayoutGrid,
  Database,
  GitBranch,
  Code,
  BarChart3,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  useIndexingConfig,
  useGenerateConfig,
  useSaveConfig,
} from "../hooks/useIndexingConfigs";
import { useState, useEffect } from "react";
import ConfigTabs from "../components/IndexingConfig/ConfigTabs";
import DataMappingTab from "../components/IndexingConfig/DataMappingTab";
import EntitiesTab from "../components/IndexingConfig/EntitiesTab";

type GenerationStep = "idle" | "generating" | "result";

export default function IndexingConfigDetail() {
  const { serverName } = useParams<{ serverName: string }>();
  const navigate = useNavigate();
  const [generationStep, setGenerationStep] = useState<GenerationStep>("idle");
  const [generatedResult, setGeneratedResult] = useState<any>(null);

  // JSON editor state
  const [isEditing, setIsEditing] = useState(false);
  const [editedJson, setEditedJson] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  // Guidance modal state
  const [showGuidanceModal, setShowGuidanceModal] = useState(false);
  const [userGuidance, setUserGuidance] = useState("");

  // Disable refetching while generating to prevent state reset
  const { data: config, isLoading } = useIndexingConfig(serverName || null);
  const generateConfig = useGenerateConfig();
  const saveConfig = useSaveConfig();

  // Debug logging
  useEffect(() => {
    console.log("IndexingConfigDetail mounted/updated", {
      serverName,
      generationStep,
      hasGeneratedResult: !!generatedResult,
      hasConfig: !!config,
    });
  }, [serverName, generationStep, generatedResult, config]);

  if (isLoading) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary-600 dark:text-primary-400 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </button>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  Indexing Config: {serverName}
                </h1>
                <p className="mt-2 text-gray-600 dark:text-gray-300">
                  {generationStep === "result"
                    ? "Configuration generated - review and save below"
                    : generationStep === "generating"
                    ? "Generating configuration..."
                    : "No indexing configuration found"}
                </p>
              </div>
            </div>
          </div>

          {/* No Config - Idle State */}
          {generationStep === "idle" && (
            <div className="card text-center py-12">
              <FileJson className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No Indexing Config
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                This data source doesn't have an indexing configuration yet.
                Generate one to start indexing data.
              </p>
              <button
                onClick={async () => {
                  console.log("Starting config generation for:", serverName);
                  setGenerationStep("generating");
                  try {
                    console.log("Calling generateConfig.mutateAsync...");
                    const result = await generateConfig.mutateAsync({
                      serverName: serverName!,
                    });
                    console.log(
                      "Config generation completed successfully:",
                      result
                    );
                    setGeneratedResult(result);
                    setGenerationStep("result");
                    console.log("State updated to result");
                  } catch (error) {
                    console.error("Failed to generate config:", error);
                    setGenerationStep("idle");
                  }
                }}
                className="btn btn-primary inline-flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Generate Config
              </button>

              <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 max-w-2xl mx-auto text-left">
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

          {/* Generating State */}
          {generationStep === "generating" && (
            <div className="card text-center py-12">
              <Loader2 className="w-12 h-12 text-primary-600 dark:text-primary-400 animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Generating Config...
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Analyzing MCP server and generating indexing configuration
              </p>
            </div>
          )}

          {/* Result State */}
          {generationStep === "result" && generatedResult && (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-success-100 dark:bg-success-900/30 rounded-lg">
                      <FileJson className="w-6 h-6 text-success-600 dark:text-success-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        READ Tools
                      </p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {generatedResult.toolsUsed.length}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                      <FileJson className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Fetchers
                      </p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {Object.keys(generatedResult.config.fetchers).length}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <FileJson className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Record Types
                      </p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {Object.keys(generatedResult.config.recordTypes).length}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Validation Results */}
              {generatedResult.validation.errors.length > 0 && (
                <div className="card bg-error-50 dark:bg-error-900/20 border-error-200 dark:border-error-800">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-error-600 dark:text-error-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-medium text-error-900 dark:text-error-200">
                        Validation Errors
                      </h3>
                      <ul className="mt-2 text-sm text-error-700 dark:text-error-300 space-y-1">
                        {generatedResult.validation.errors.map(
                          (error: any, i: number) => (
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

              {generatedResult.validation.warnings.length > 0 && (
                <div className="card bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
                        Warnings
                      </h3>
                      <ul className="mt-2 text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                        {generatedResult.validation.warnings.map(
                          (warning: any, i: number) => (
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
              {generatedResult.validation.valid && (
                <div className="card bg-success-50 dark:bg-success-900/20 border-success-200 dark:border-success-800">
                  <div className="flex items-start gap-3">
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

              {/* Sync Pipeline */}
              {generatedResult.config.syncOrder &&
                generatedResult.config.syncOrder.length > 0 && (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
                    <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase mb-3">
                      Sync Pipeline
                    </h3>
                    <div className="flex items-center gap-2 overflow-x-auto pb-2">
                      {generatedResult.config.syncOrder.map(
                        (fetcherName: string, index: number) => (
                          <div
                            key={fetcherName}
                            className="flex items-center gap-2 flex-shrink-0"
                          >
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 rounded-lg shadow-sm">
                              <span className="flex items-center justify-center w-5 h-5 bg-blue-600 dark:bg-blue-500 text-white text-xs font-bold rounded-full">
                                {index + 1}
                              </span>
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {fetcherName}
                              </span>
                            </div>
                            {index <
                              generatedResult.config.syncOrder.length - 1 && (
                              <svg
                                className="w-4 h-4 text-blue-400 dark:text-blue-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

              {/* Tabbed Config Preview */}
              <div className="card">
                <ConfigTabs
                  tabs={[
                    {
                      id: "dataMapping",
                      label: "Data Mapping",
                      icon: <Database className="w-4 h-4" />,
                    },
                    {
                      id: "entities",
                      label: "Graph Entities",
                      icon: <GitBranch className="w-4 h-4" />,
                    },
                    {
                      id: "json",
                      label: "Raw JSON",
                      icon: <Code className="w-4 h-4" />,
                    },
                  ]}
                >
                  {(activeTab) => {
                    if (activeTab === "dataMapping") {
                      return <DataMappingTab config={generatedResult.config} />;
                    }
                    if (activeTab === "entities") {
                      return <EntitiesTab config={generatedResult.config} />;
                    }
                    if (activeTab === "json") {
                      return (
                        <div className="bg-gray-900 rounded-lg overflow-hidden">
                          <pre className="p-4 overflow-x-auto text-sm max-h-96 text-gray-100 leading-relaxed">
                            <code className="language-json">
                              {JSON.stringify(generatedResult.config, null, 2)}
                            </code>
                          </pre>
                        </div>
                      );
                    }
                    return null;
                  }}
                </ConfigTabs>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setGenerationStep("idle");
                    setGeneratedResult(null);
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      await saveConfig.mutateAsync({
                        config: generatedResult.config,
                        status: "draft",
                      });
                      window.location.reload();
                    } catch (error) {
                      console.error("Failed to save config:", error);
                    }
                  }}
                  disabled={saveConfig.isPending}
                  className="btn btn-secondary"
                >
                  Save as Draft
                </button>
                <button
                  onClick={async () => {
                    console.log("Save & Activate clicked");
                    console.log("Config to save:", generatedResult.config);
                    try {
                      const result = await saveConfig.mutateAsync({
                        config: generatedResult.config,
                        status: "active",
                      });
                      console.log("Save successful:", result);
                      // Wait a moment before reloading to ensure save completes
                      setTimeout(() => {
                        window.location.reload();
                      }, 500);
                    } catch (error) {
                      console.error("Failed to save config:", error);
                      alert(
                        "Failed to save config. Check console for details."
                      );
                    }
                  }}
                  disabled={
                    saveConfig.isPending || !generatedResult?.validation.valid
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
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Handle regeneration states even when config exists
  if (generationStep === "generating") {
    return (
      <div className="bg-gray-50 dark:bg-gray-900">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
          <div className="card text-center py-12">
            <Loader2 className="w-12 h-12 text-primary-600 dark:text-primary-400 animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Regenerating Config...
            </h3>
            <p className="text-gray-600 dark:text-gray-300">
              Analyzing MCP server and generating new indexing configuration
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (generationStep === "result" && generatedResult) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
          {/* Same result UI as in !config block */}
          <div className="mb-8">
            <button
              onClick={() => {
                setGenerationStep("idle");
                setGeneratedResult(null);
              }}
              className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Config
            </button>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Regenerated Configuration
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-300">
              Review and save the new configuration for {config.serverName}
            </p>
          </div>

          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="card">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-success-100 dark:bg-success-900/30 rounded-lg">
                    <FileJson className="w-6 h-6 text-success-600 dark:text-success-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      READ Tools
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {generatedResult.toolsUsed.length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                    <FileJson className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Fetchers
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {Object.keys(generatedResult.config.fetchers).length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <FileJson className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Record Types
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {Object.keys(generatedResult.config.recordTypes).length}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Validation Results */}
            {generatedResult.validation.errors.length > 0 && (
              <div className="card bg-error-50 dark:bg-error-900/20 border-error-200 dark:border-error-800">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-error-600 dark:text-error-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-error-900 dark:text-error-200">
                      Validation Errors
                    </h3>
                    <ul className="mt-2 text-sm text-error-700 dark:text-error-300 space-y-1">
                      {generatedResult.validation.errors.map(
                        (error: any, i: number) => (
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

            {generatedResult.validation.warnings.length > 0 && (
              <div className="card bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
                      Warnings
                    </h3>
                    <ul className="mt-2 text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                      {generatedResult.validation.warnings.map(
                        (warning: any, i: number) => (
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
            {generatedResult.validation.valid && (
              <div className="card bg-success-50 dark:bg-success-900/20 border-success-200 dark:border-success-800">
                <div className="flex items-start gap-3">
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

            {/* Sync Pipeline */}
            {generatedResult.config.syncOrder &&
              generatedResult.config.syncOrder.length > 0 && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
                  <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase mb-3">
                    Sync Pipeline
                  </h3>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {generatedResult.config.syncOrder.map(
                      (fetcherName: string, index: number) => (
                        <div
                          key={fetcherName}
                          className="flex items-center gap-2 flex-shrink-0"
                        >
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 rounded-lg shadow-sm">
                            <span className="flex items-center justify-center w-5 h-5 bg-blue-600 dark:bg-blue-500 text-white text-xs font-bold rounded-full">
                              {index + 1}
                            </span>
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {fetcherName}
                            </span>
                          </div>
                          {index <
                            generatedResult.config.syncOrder.length - 1 && (
                            <svg
                              className="w-4 h-4 text-blue-400 dark:text-blue-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

            {/* Tabbed Config Preview */}
            <div className="card">
              <ConfigTabs
                tabs={[
                  {
                    id: "dataMapping",
                    label: "Data Mapping",
                    icon: <Database className="w-4 h-4" />,
                  },
                  {
                    id: "entities",
                    label: "Graph Entities",
                    icon: <GitBranch className="w-4 h-4" />,
                  },
                  {
                    id: "json",
                    label: "Raw JSON",
                    icon: <Code className="w-4 h-4" />,
                  },
                ]}
              >
                {(activeTab) => {
                  if (activeTab === "dataMapping") {
                    return <DataMappingTab config={generatedResult.config} />;
                  }
                  if (activeTab === "entities") {
                    return <EntitiesTab config={generatedResult.config} />;
                  }
                  if (activeTab === "json") {
                    return (
                      <div className="bg-gray-900 rounded-lg overflow-hidden">
                        <pre className="p-4 overflow-x-auto text-sm max-h-96 text-gray-100 leading-relaxed">
                          <code className="language-json">
                            {JSON.stringify(generatedResult.config, null, 2)}
                          </code>
                        </pre>
                      </div>
                    );
                  }
                  return null;
                }}
              </ConfigTabs>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setGenerationStep("idle");
                  setGeneratedResult(null);
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await saveConfig.mutateAsync({
                      config: generatedResult.config,
                      status: "draft",
                    });
                    window.location.reload();
                  } catch (error) {
                    console.error("Failed to save config:", error);
                  }
                }}
                disabled={saveConfig.isPending}
                className="btn btn-secondary"
              >
                Save as Draft
              </button>
              <button
                onClick={async () => {
                  try {
                    await saveConfig.mutateAsync({
                      config: generatedResult.config,
                      status: "active",
                    });
                    setTimeout(() => {
                      window.location.reload();
                    }, 500);
                  } catch (error) {
                    console.error("Failed to save config:", error);
                    alert("Failed to save config. Check console for details.");
                  }
                }}
                disabled={
                  saveConfig.isPending || !generatedResult?.validation.valid
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
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Indexing Config: {config.displayName}
              </h1>
              <p className="mt-2 text-gray-600 dark:text-gray-300">
                Auto-generated configuration for {config.serverName}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  console.log("Regenerating config for:", config.serverName);
                  setGenerationStep("generating");
                  try {
                    const result = await generateConfig.mutateAsync({
                      serverName: config.serverName,
                    });
                    console.log("Config regeneration completed:", result);
                    setGeneratedResult(result);
                    setGenerationStep("result");
                  } catch (error) {
                    console.error("Failed to regenerate config:", error);
                    setGenerationStep("idle");
                  }
                }}
                className="btn btn-secondary inline-flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Regenerate Config
              </button>
              <button
                onClick={() => setShowGuidanceModal(true)}
                className="btn btn-primary inline-flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Regenerate with Guidance
              </button>
              {(() => {
                const statusText =
                  config.status.charAt(0).toUpperCase() +
                  config.status.slice(1);
                const statusClass =
                  config.status === "active"
                    ? "bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400"
                    : config.status === "draft"
                    ? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                    : "bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400";

                return (
                  <span
                    className={`px-3 py-1 text-sm font-medium rounded-full ${statusClass}`}
                  >
                    {statusText}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Fetchers
                </p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {Object.keys(config.config.fetchers || {}).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <FileJson className="w-5 h-5 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Record Types
                </p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {Object.keys(config.config.recordTypes || {}).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Entities
                </p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {(() => {
                    let total = 0;
                    Object.values(config.config.recordTypes || {}).forEach(
                      (rt: any) => {
                        total += (rt.entities || []).length;
                      }
                    );
                    return total;
                  })()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Updated
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {new Date(config.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sync Pipeline */}
        {(config.config as any).syncOrder &&
          (config.config as any).syncOrder.length > 0 && (
            <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
              <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase mb-3">
                Sync Pipeline
              </h3>
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {(config.config as any).syncOrder.map(
                  (fetcherName: string, index: number) => (
                    <div
                      key={fetcherName}
                      className="flex items-center gap-2 flex-shrink-0"
                    >
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 rounded-lg shadow-sm">
                        <span className="flex items-center justify-center w-5 h-5 bg-blue-600 dark:bg-blue-500 text-white text-xs font-bold rounded-full">
                          {index + 1}
                        </span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {fetcherName}
                        </span>
                      </div>
                      {index < (config.config as any).syncOrder.length - 1 && (
                        <svg
                          className="w-4 h-4 text-blue-400 dark:text-blue-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          )}

        {/* Tabbed Config View */}
        <div className="card">
          <ConfigTabs
            tabs={[
              {
                id: "dataMapping",
                label: "Data Mapping",
                icon: <Database className="w-4 h-4" />,
              },
              {
                id: "entities",
                label: "Graph Entities",
                icon: <GitBranch className="w-4 h-4" />,
              },
              {
                id: "json",
                label: "Raw JSON",
                icon: <Code className="w-4 h-4" />,
              },
            ]}
          >
            {(activeTab) => {
              if (activeTab === "dataMapping") {
                return <DataMappingTab config={config.config} />;
              }
              if (activeTab === "entities") {
                return <EntitiesTab config={config.config} />;
              }
              if (activeTab === "json") {
                return (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Configuration JSON
                      </h2>
                      <div className="flex items-center gap-2">
                        {!isEditing && (
                          <>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  JSON.stringify(config.config, null, 2)
                                );
                              }}
                              className="btn btn-secondary text-sm"
                            >
                              Copy to Clipboard
                            </button>
                            <button
                              onClick={() => {
                                setIsEditing(true);
                                setEditedJson(
                                  JSON.stringify(config.config, null, 2)
                                );
                                setParseError(null);
                              }}
                              className="btn btn-primary text-sm inline-flex items-center gap-2"
                            >
                              <Edit className="w-4 h-4" />
                              Edit Config
                            </button>
                          </>
                        )}
                        {isEditing && (
                          <>
                            <button
                              onClick={() => {
                                setIsEditing(false);
                                setEditedJson("");
                                setParseError(null);
                              }}
                              className="btn btn-secondary text-sm inline-flex items-center gap-2"
                            >
                              <X className="w-4 h-4" />
                              Cancel
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const parsed = JSON.parse(editedJson);
                                  await saveConfig.mutateAsync({
                                    config: parsed,
                                    status: config.status,
                                  });
                                  setIsEditing(false);
                                  window.location.reload();
                                } catch (error) {
                                  if (error instanceof SyntaxError) {
                                    setParseError(error.message);
                                  } else {
                                    console.error(
                                      "Failed to save config:",
                                      error
                                    );
                                    alert(
                                      "Failed to save config. Check console for details."
                                    );
                                  }
                                }
                              }}
                              disabled={saveConfig.isPending || !!parseError}
                              className="btn btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {saveConfig.isPending ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                <>
                                  <Save className="w-4 h-4" />
                                  Save Changes
                                </>
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {parseError && (
                      <div className="mb-4 p-3 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-5 h-5 text-error-600 dark:text-error-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <h3 className="text-sm font-medium text-error-900 dark:text-error-200">
                              JSON Syntax Error
                            </h3>
                            <p className="mt-1 text-sm text-error-700 dark:text-error-300">
                              {parseError}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {isEditing ? (
                      <textarea
                        value={editedJson}
                        onChange={(e) => {
                          setEditedJson(e.target.value);
                          try {
                            JSON.parse(e.target.value);
                            setParseError(null);
                          } catch (error) {
                            if (error instanceof SyntaxError) {
                              setParseError(error.message);
                            }
                          }
                        }}
                        className="w-full bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm resize-y min-h-96 max-h-[600px] focus:outline-none focus:ring-2 focus:ring-primary-500"
                        spellCheck={false}
                      />
                    ) : (
                      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                        {JSON.stringify(config.config, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              }
              return null;
            }}
          </ConfigTabs>
        </div>

        {/* Guidance Modal */}
        {showGuidanceModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Regenerate Config with Guidance
                  </h2>
                  <button
                    onClick={() => {
                      setShowGuidanceModal(false);
                      setUserGuidance("");
                    }}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  Provide specific instructions to guide the LLM in generating
                  the config. For example, you can request specific entity
                  extractions, field mappings, or data transformations.
                </p>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Your Guidance
                  </label>
                  <textarea
                    value={userGuidance}
                    onChange={(e) => setUserGuidance(e.target.value)}
                    placeholder="Example: Please add entity extraction for project statuses. Projects have a status field that can be: Planned, In Progress, Paused, Completed, or Canceled."
                    className="w-full h-48 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowGuidanceModal(false);
                      setUserGuidance("");
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      setShowGuidanceModal(false);
                      setGenerationStep("generating");
                      try {
                        const result = await generateConfig.mutateAsync({
                          serverName: config.serverName,
                          userGuidance: userGuidance || undefined,
                        });
                        setGeneratedResult(result);
                        setGenerationStep("result");
                        setUserGuidance("");
                      } catch (error) {
                        console.error("Failed to regenerate config:", error);
                        setGenerationStep("idle");
                      }
                    }}
                    disabled={!userGuidance.trim()}
                    className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Generate Config
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
