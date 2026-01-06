import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Info,
} from "lucide-react";
import { GeneratedSyncConfigResult } from "../../lib/api";

interface IndexingStepProps {
  generatedConfig: GeneratedSyncConfigResult;
  onBack: () => void;
  onNext: () => void;
  isLoading: boolean;
}

export function IndexingStep({
  generatedConfig,
  onBack,
  onNext,
  isLoading,
}: IndexingStepProps) {
  const { config, validation, toolsUsed, toolClassifications } =
    generatedConfig;

  // Calculate tool classification breakdown
  const readTools = toolsUsed || [];
  const searchTools: string[] = [];
  const writeTools: string[] = [];

  if (toolClassifications) {
    Object.entries(toolClassifications).forEach(
      ([toolName, classification]) => {
        if (
          classification.category === "search" &&
          !readTools.includes(toolName)
        ) {
          searchTools.push(toolName);
        } else if (
          classification.category === "write" &&
          !readTools.includes(toolName)
        ) {
          writeTools.push(toolName);
        }
      }
    );
  }

  const skippedTools = [...searchTools, ...writeTools];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          Indexing Configuration Generated
        </h3>
        <p className="text-sm text-text-tertiary">
          We've analyzed your MCP server and generated an indexing configuration
        </p>
      </div>

      {/* Tool Classification Summary */}
      <div className="bg-bg-secondary rounded-lg p-4">
        <h4 className="text-sm font-medium text-text-primary mb-3">
          Tool Classification
        </h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-brand-success/10 rounded-lg">
            <div className="text-2xl font-bold text-brand-success">
              {toolsUsed.length}
            </div>
            <div className="text-xs text-brand-success mt-1">READ Tools</div>
            <div className="text-xs text-text-tertiary mt-1">
              Used for indexing
            </div>
          </div>
          <div className="text-center p-3 bg-bg-active rounded-lg">
            <div className="text-2xl font-bold text-text-secondary">
              {Object.keys(config.fetchers).length}
            </div>
            <div className="text-xs text-text-tertiary mt-1">Fetchers</div>
            <div className="text-xs text-text-quaternary mt-1">
              Data extractors
            </div>
          </div>
          <div className="text-center p-3 bg-bg-active rounded-lg">
            <div className="text-2xl font-bold text-text-secondary">
              {Object.keys(config.recordTypes).length}
            </div>
            <div className="text-xs text-text-tertiary mt-1">Record Types</div>
            <div className="text-xs text-text-quaternary mt-1">
              Data structures
            </div>
          </div>
        </div>
      </div>

      {/* Validation Results */}
      {validation.errors.length > 0 && (
        <div className="bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-error-600 dark:text-error-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-error-900 dark:text-error-200">
                Validation Errors
              </h4>
              <ul className="mt-2 text-sm text-error-700 dark:text-error-300 space-y-1">
                {validation.errors.map((error, i) => (
                  <li key={i}>
                    <strong>{error.path}:</strong> {error.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {validation.warnings.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
                Warnings
              </h4>
              <ul className="mt-2 text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                {validation.warnings.map((warning, i) => (
                  <li key={i}>
                    <strong>{warning.path}:</strong> {warning.message}
                    {warning.suggestion && (
                      <div className="text-xs mt-1">
                        Suggestion: {warning.suggestion}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {validation.valid && (
        <div className="bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-success-600 dark:text-success-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-success-900 dark:text-success-200">
                Configuration Valid
              </h4>
              <p className="mt-1 text-sm text-success-700 dark:text-success-300">
                Your indexing configuration passed all validation checks and is
                ready to use.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Fetchers Preview */}
      <div className="border border-border-secondary rounded-lg p-4">
        <h4 className="text-sm font-medium text-text-primary mb-3">Fetchers</h4>
        <div className="space-y-2">
          {Object.entries(config.fetchers).map(
            ([name, fetcher]: [string, any]) => (
              <div
                key={name}
                className="flex items-center justify-between p-3 bg-bg-secondary rounded"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {name}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-brand-success/10 text-brand-success rounded">
                      READ
                    </span>
                  </div>
                  {fetcher.tool && fetcher.tool !== name && (
                    <div className="text-xs text-text-tertiary mt-1">
                      Tool: {fetcher.tool}
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Skipped Tools */}
      {skippedTools.length > 0 && (
        <div className="border border-border-secondary rounded-lg p-4">
          <div className="flex items-start gap-2 mb-3">
            <Info className="w-4 h-4 text-text-tertiary flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-text-primary">
                Skipped Tools
              </h4>
              <p className="text-xs text-text-tertiary mt-1">
                These tools were excluded from indexing because they perform
                write or search operations
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {searchTools.length > 0 && (
              <div>
                <div className="text-xs font-medium text-text-secondary mb-1">
                  Search Tools ({searchTools.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {searchTools.map((toolName) => (
                    <span
                      key={toolName}
                      className="text-xs px-2 py-1 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 rounded border border-yellow-200 dark:border-yellow-800"
                    >
                      {toolName}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {writeTools.length > 0 && (
              <div>
                <div className="text-xs font-medium text-text-secondary mb-1">
                  Write Tools ({writeTools.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {writeTools.map((toolName) => (
                    <span
                      key={toolName}
                      className="text-xs px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded border border-red-200 dark:border-red-800"
                    >
                      {toolName}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
          onClick={onNext}
          disabled={isLoading || !validation.valid}
          className="btn btn-primary flex items-center gap-2"
        >
          Continue to Review
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
