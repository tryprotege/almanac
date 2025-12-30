import { ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import { MCPServerConfig, GeneratedConfigResult } from "../../lib/api";
import { ServicePreset } from "../MCPServerForm/presets";

interface ReviewStepProps {
  serverConfig: Omit<MCPServerConfig, "_id" | "createdAt" | "updatedAt">;
  preset: ServicePreset | null;
  generatedConfig?: GeneratedConfigResult;
  onBack: () => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function ReviewStep({
  serverConfig,
  preset,
  generatedConfig,
  onBack,
  onSubmit,
  isLoading,
}: ReviewStepProps) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Review & Save
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Review your data source configuration before saving
        </p>
      </div>

      {/* Server Details */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          Connection Details
        </h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-300">Name</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {serverConfig.name}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-300">Type</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {preset?.displayName || "Custom MCP Server"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-300">
              Connection Type
            </span>
            <span className="font-medium text-gray-900 dark:text-white">
              {serverConfig.type}
            </span>
          </div>
        </div>
      </div>

      {/* Indexing Configuration (for custom servers) */}
      {generatedConfig && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
            Indexing Configuration
          </h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-300">
                READ Tools
              </span>
              <span className="font-medium text-gray-900 dark:text-white">
                {generatedConfig.toolsUsed.length}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-300">Fetchers</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {Object.keys(generatedConfig.config.fetchers).length}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-300">
                Record Types
              </span>
              <span className="font-medium text-gray-900 dark:text-white">
                {Object.keys(generatedConfig.config.recordTypes).length}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* What Happens Next */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
          What happens next?
        </h4>
        <ol className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside">
          <li>MCP server connection will be saved</li>
          <li>
            {preset?.id === "custom"
              ? "Auto-generated indexing config will be activated"
              : "Preset indexing adapter will be configured"}
          </li>
          <li>Initial data sync will start automatically</li>
          <li>You can monitor sync progress from the Data Sources page</li>
        </ol>
      </div>

      {/* Success Indicator */}
      <div className="bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <CheckCircle className="w-5 h-5 text-success-600 dark:text-success-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-success-900 dark:text-success-200">
              Ready to Save
            </h4>
            <p className="mt-1 text-sm text-success-700 dark:text-success-300">
              Your data source is configured and ready to start indexing.
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onBack}
          disabled={isLoading}
          className="btn btn-secondary flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={onSubmit}
          disabled={isLoading}
          className="btn btn-primary flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving & Syncing...
            </>
          ) : (
            "Save & Start Indexing"
          )}
        </button>
      </div>
    </div>
  );
}
