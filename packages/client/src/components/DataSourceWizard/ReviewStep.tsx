import { ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import { DataSourceConfig, GeneratedSyncConfigResult } from '../../lib/api';
import { ServicePreset } from '../DataSourceForm/presets';
import { StartingPointsCollector } from '../StartingPointsCollector';

interface ReviewStepProps {
  serverConfig: Omit<DataSourceConfig, '_id' | 'createdAt' | 'updatedAt'>;
  preset: ServicePreset | null;
  generatedConfig?: GeneratedSyncConfigResult;
  importedConfig?: any;
  startingPointValues: Record<string, string[]>;
  onStartingPointValuesChange: (values: Record<string, string[]>) => void;
  onBack: () => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function ReviewStep({
  serverConfig,
  preset,
  generatedConfig,
  importedConfig,
  startingPointValues,
  onStartingPointValuesChange,
  onBack,
  onSubmit,
  isLoading,
}: ReviewStepProps) {
  // Determine which config to display
  const displayConfig = importedConfig || generatedConfig?.config;
  const isImported = !!importedConfig;

  // Check if all required starting points have values
  const areRequiredStartingPointsFilled = () => {
    if (!displayConfig?.startingPoints) return true;

    return displayConfig.startingPoints.every((sp: any) => {
      if (!sp.required) return true;
      const values = startingPointValues[sp.name] || [];
      return values.length > 0 && values.some((v: string) => v.trim() !== '');
    });
  };

  const isSubmitDisabled = isLoading || !areRequiredStartingPointsFilled();
  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">Review & Save</h3>
        <p className="text-sm text-text-tertiary">
          Review your data source configuration before saving
        </p>
      </div>

      {/* Server Details */}
      <div className="border border-border-secondary rounded-lg p-4">
        <h4 className="text-sm font-medium text-text-primary mb-3">Connection Details</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-tertiary">Name</span>
            <span className="font-medium text-text-primary">{serverConfig.name}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-tertiary">Type</span>
            <span className="font-medium text-text-primary">
              {preset?.displayName || 'Custom MCP Server'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-tertiary">Connection Type</span>
            <span className="font-medium text-text-primary">{serverConfig.type}</span>
          </div>
        </div>
      </div>

      {/* Sync Configuration (for custom servers) */}
      {displayConfig && (
        <div className="border border-border-secondary rounded-lg p-4">
          <h4 className="text-sm font-medium text-text-primary mb-3">
            Sync Configuration
            {isImported && <span className="ml-2 text-xs text-brand-blue">(Imported)</span>}
            {!isImported && <span className="ml-2 text-xs text-brand-lime">(Auto-Generated)</span>}
          </h4>
          <div className="space-y-2">
            {!isImported && generatedConfig && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-tertiary">READ Tools Used</span>
                <span className="font-medium text-text-primary">
                  {generatedConfig.toolsUsed.length}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-tertiary">Fetchers</span>
              <span className="font-medium text-text-primary">
                {Object.keys(displayConfig.fetchers || {}).length}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-tertiary">Record Types</span>
              <span className="font-medium text-text-primary">
                {Object.keys(displayConfig.recordTypes || {}).length}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* What Happens Next */}
      <div className="bg-brand-blue/10 border border-brand-blue/30 rounded-lg p-4">
        <h4 className="text-sm font-medium text-brand-blue mb-2">What happens next?</h4>
        <ol className="text-sm text-text-secondary space-y-1 list-decimal list-inside">
          <li>MCP server connection will be saved</li>
          <li>
            {preset?.id === 'custom'
              ? isImported
                ? 'Imported sync config will be activated'
                : 'Auto-generated sync config will be activated'
              : 'Preset indexing adapter will be configured'}
          </li>
          <li>Initial data sync will start automatically</li>
          <li>You can monitor sync progress from the Data Sources page</li>
        </ol>
      </div>

      {/* Starting Points Configuration */}
      {displayConfig?.startingPoints && displayConfig.startingPoints.length > 0 && (
        <div className="border border-border-secondary rounded-lg p-4">
          <StartingPointsCollector
            startingPoints={displayConfig.startingPoints}
            initialValues={startingPointValues}
            onChange={onStartingPointValuesChange}
          />
        </div>
      )}

      {/* Success Indicator */}
      <div className="bg-brand-success/10 border border-brand-success/30 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <CheckCircle className="w-5 h-5 text-brand-success flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-brand-success">Ready to Save</h4>
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
          disabled={isSubmitDisabled}
          className="btn btn-primary flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving & Syncing...
            </>
          ) : (
            'Save & Start Indexing'
          )}
        </button>
      </div>
    </div>
  );
}
