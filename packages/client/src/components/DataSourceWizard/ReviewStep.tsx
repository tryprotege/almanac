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
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          Review & Save
        </h3>
        <p className="text-sm text-text-tertiary">
          Review your data source configuration before saving
        </p>
      </div>

      {/* Server Details */}
      <div className="border border-border-secondary rounded-lg p-4">
        <h4 className="text-sm font-medium text-text-primary mb-3">
          Connection Details
        </h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-tertiary">Name</span>
            <span className="font-medium text-text-primary">
              {serverConfig.name}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-tertiary">Type</span>
            <span className="font-medium text-text-primary">
              {preset?.displayName || "Custom MCP Server"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-tertiary">Connection Type</span>
            <span className="font-medium text-text-primary">
              {serverConfig.type}
            </span>
          </div>
        </div>
      </div>

      {/* Indexing Configuration (for custom servers) */}
      {generatedConfig && (
        <div className="border border-border-secondary rounded-lg p-4">
          <h4 className="text-sm font-medium text-text-primary mb-3">
            Indexing Configuration
          </h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-tertiary">READ Tools</span>
              <span className="font-medium text-text-primary">
                {generatedConfig.toolsUsed.length}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-tertiary">Fetchers</span>
              <span className="font-medium text-text-primary">
                {Object.keys(generatedConfig.config.fetchers).length}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-tertiary">Record Types</span>
              <span className="font-medium text-text-primary">
                {Object.keys(generatedConfig.config.recordTypes).length}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* What Happens Next */}
      <div className="bg-brand-blue/10 border border-brand-blue/30 rounded-lg p-4">
        <h4 className="text-sm font-medium text-brand-blue mb-2">
          What happens next?
        </h4>
        <ol className="text-sm text-text-secondary space-y-1 list-decimal list-inside">
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
      <div className="bg-brand-success/10 border border-brand-success/30 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <CheckCircle className="w-5 h-5 text-brand-success flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-brand-success">
              Ready to Save
            </h4>
            <p className="mt-1 text-sm text-brand-success/80">
              Your data source is configured and ready to start indexing.
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-border-secondary">
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
