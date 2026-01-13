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
  Database,
  GitBranch,
  Code,
  BarChart3,
  PlayCircle,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Modal, ModalFooter } from '../components/ui/Modal';
import {
  useSyncConfig,
  useGenerateSyncConfig,
  useSaveSyncConfig,
  useResetSyncState,
  useSyncWithConfig,
  useReloadFromMarketplace,
} from '../hooks/useSyncConfigs';
import { useDataSources } from '../hooks/useDataSources';
import { useState, useEffect } from 'react';
import ConfigTabs from '../components/SyncConfig/ConfigTabs';
import DataMappingTab from '../components/SyncConfig/DataMappingTab';
import EntitiesTab from '../components/SyncConfig/EntitiesTab';
import StartingPointsTab from '../components/SyncConfig/StartingPointsTab';
import { StartingPointsCollector } from '../components/StartingPointsCollector';

type GenerationStep = 'idle' | 'generating' | 'result';

export default function IndexingConfigDetail() {
  const { serverName } = useParams<{ serverName: string }>();
  const navigate = useNavigate();
  const [generationStep, setGenerationStep] = useState<GenerationStep>('idle');
  const [generatedResult, setGeneratedResult] = useState<any>(null);

  // Starting points state for generation result
  const [startingPointValues, setStartingPointValues] = useState<Record<string, string[]>>({});

  // JSON editor state
  const [isEditing, setIsEditing] = useState(false);
  const [editedJson, setEditedJson] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  // Guidance modal state
  const [showGuidanceModal, setShowGuidanceModal] = useState(false);
  const [userGuidance, setUserGuidance] = useState('');

  // Reset sync modal state
  const [showResetModal, setShowResetModal] = useState(false);

  // Disable refetching while generating to prevent state reset
  const { data: config, isLoading } = useSyncConfig(serverName || null);
  const { servers } = useDataSources();
  const generateConfig = useGenerateSyncConfig();
  const saveConfig = useSaveSyncConfig();
  const resetSyncState = useResetSyncState();
  const syncWithConfig = useSyncWithConfig();
  const reloadFromMarketplace = useReloadFromMarketplace();

  // Check if this data source is from a preset
  const dataSource = servers.find((s) => s.name === serverName);
  const isPresetBased = !!dataSource?.presetId;

  // Helper to check if all required starting points are configured
  const areRequiredStartingPointsFilled = (
    startingPoints: any[],
    values: Record<string, string[]>,
  ): boolean => {
    const requiredPoints = startingPoints.filter((sp) => sp.required && sp.userProvided);
    if (requiredPoints.length === 0) return true;

    return requiredPoints.every((sp) => {
      const vals = values[sp.name] || [];
      return vals.some((v) => v.trim().length > 0);
    });
  };

  // Debug logging
  useEffect(() => {
    console.log('IndexingConfigDetail mounted/updated', {
      serverName,
      generationStep,
      hasGeneratedResult: !!generatedResult,
      hasConfig: !!config,
    });
  }, [serverName, generationStep, generatedResult, config]);

  if (isLoading) {
    return (
      <div className="pb-8">
        <div className="w-full py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-brand-purple animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="pb-8">
        <div className="w-full py-8">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => navigate('/data-sources')}
              className="flex items-center gap-2 text-text-tertiary hover:text-text-primary mb-4"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Data Sources
            </button>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-text-primary">
                  Indexing Config: {serverName}
                </h1>
                <p className="mt-2 text-text-tertiary">
                  {generationStep === 'result'
                    ? 'Configuration generated - review and save below'
                    : generationStep === 'generating'
                      ? 'Generating configuration...'
                      : 'No indexing configuration found'}
                </p>
              </div>
            </div>
          </div>

          {/* No Config - Idle State */}
          {generationStep === 'idle' && (
            <div className="card text-center py-12">
              <FileJson className="w-12 h-12 text-text-quaternary mx-auto mb-4" />
              <h3 className="text-lg font-medium text-text-primary mb-2">No Indexing Config</h3>
              <p className="text-text-tertiary mb-6">
                This data source doesn't have an indexing configuration yet. Generate one to start
                indexing data.
              </p>
              <button
                onClick={async () => {
                  console.log('Starting config generation for:', serverName);
                  setGenerationStep('generating');
                  try {
                    console.log('Calling generateConfig.mutateAsync...');
                    const result = await generateConfig.mutateAsync({
                      serverName: serverName!,
                    });
                    console.log(
                      'Config generation completed successfully:\n',
                      JSON.stringify(result, null, 2),
                    );
                    setGeneratedResult(result);
                    setGenerationStep('result');
                    console.log('State updated to result');
                  } catch (error) {
                    console.error('Failed to generate config:', error);
                    setGenerationStep('idle');
                  }
                }}
                className="btn btn-primary inline-flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Generate Config
              </button>

              <div className="mt-8 bg-brand-blue/10 border border-brand-blue/30 rounded-lg p-6 text-left">
                <h3 className="text-sm font-medium text-brand-blue mb-3">What happens next?</h3>
                <ul className="text-sm text-text-secondary space-y-2 list-disc list-inside ml-4">
                  <li>Tools will be classified using LLM (READ/SEARCH/WRITE)</li>
                  <li>Only READ tools will be used for indexing</li>
                  <li>Sample data will be fetched to understand structure</li>
                  <li>An IndexingConfig will be generated automatically</li>
                </ul>
              </div>
            </div>
          )}

          {/* Generating State */}
          {generationStep === 'generating' && (
            <div className="card text-center py-12">
              <Loader2 className="w-12 h-12 text-brand-purple animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-medium text-text-primary mb-2">Generating Config...</h3>
              <p className="text-text-tertiary">
                Analyzing MCP server and generating indexing configuration
              </p>
            </div>
          )}

          {/* Result State */}
          {generationStep === 'result' && generatedResult && (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-brand-success/10 rounded-lg">
                      <FileJson className="w-6 h-6 text-brand-success" />
                    </div>
                    <div>
                      <p className="text-sm text-text-tertiary">READ Tools</p>
                      <p className="text-2xl font-bold text-text-primary">
                        {generatedResult.toolsUsed.length}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-brand-purple/10 rounded-lg">
                      <FileJson className="w-6 h-6 text-brand-purple" />
                    </div>
                    <div>
                      <p className="text-sm text-text-tertiary">Fetchers</p>
                      <p className="text-2xl font-bold text-text-primary">
                        {Object.keys(generatedResult.config.fetchers).length}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-brand-blue/10 rounded-lg">
                      <FileJson className="w-6 h-6 text-brand-blue" />
                    </div>
                    <div>
                      <p className="text-sm text-text-tertiary">Record Types</p>
                      <p className="text-2xl font-bold text-text-primary">
                        {Object.keys(generatedResult.config.recordTypes).length}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Validation Results */}
              {generatedResult.validation.errors.length > 0 && (
                <div className="card bg-brand-error/10 border-brand-error/30">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-brand-error flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-medium text-brand-error">Validation Errors</h3>
                      <ul className="mt-2 text-sm text-brand-error/80 space-y-1">
                        {generatedResult.validation.errors.map((error: any, i: number) => (
                          <li key={i}>
                            {error.path}: {error.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {generatedResult.validation.warnings.length > 0 && (
                <div className="card bg-brand-warning/10 border-brand-warning/30">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-brand-warning flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-medium text-brand-warning">Warnings</h3>
                      <ul className="mt-2 text-sm text-brand-warning/80 space-y-1">
                        {generatedResult.validation.warnings.map((warning: any, i: number) => (
                          <li key={i}>
                            {warning.path}: {warning.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Success Message */}
              {generatedResult.validation.valid && (
                <div className="card bg-brand-success/10 border-brand-success/30">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-brand-success flex items-center justify-center flex-shrink-0 mt-0.5">
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
                      <h3 className="text-sm font-medium text-brand-success">
                        Config generated successfully!
                      </h3>
                      <p className="mt-1 text-sm text-brand-success/80">
                        The configuration passed all validation checks and is ready to use.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Sync Pipeline */}
              {generatedResult.config.syncOrder && generatedResult.config.syncOrder.length > 0 && (
                <div className="bg-gradient-to-r from-brand-blue/5 to-brand-purple/5 border border-brand-blue/30 rounded-lg p-4">
                  <h3 className="text-xs font-medium text-text-tertiary uppercase mb-3">
                    Sync Pipeline
                  </h3>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {generatedResult.config.syncOrder.map((fetcherName: string, index: number) => (
                      <div key={fetcherName} className="flex items-center gap-2 flex-shrink-0">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-primary border border-brand-blue/40 rounded-lg shadow-sm">
                          <span className="flex items-center justify-center w-5 h-5 bg-brand-blue text-white text-xs font-bold rounded-full">
                            {index + 1}
                          </span>
                          <span className="text-sm font-medium text-text-primary">
                            {fetcherName}
                          </span>
                        </div>
                        {index < generatedResult.config.syncOrder.length - 1 && (
                          <svg
                            className="w-4 h-4 text-brand-blue"
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
                    ))}
                  </div>
                </div>
              )}

              {/* Tabbed Config Preview */}
              <div className="card">
                <ConfigTabs
                  tabs={[
                    {
                      id: 'dataMapping',
                      label: 'Data Mapping',
                      icon: <Database className="w-4 h-4" />,
                    },
                    {
                      id: 'entities',
                      label: 'Graph Entities',
                      icon: <GitBranch className="w-4 h-4" />,
                    },
                    {
                      id: 'json',
                      label: 'Raw JSON',
                      icon: <Code className="w-4 h-4" />,
                    },
                  ]}
                >
                  {(activeTab) => {
                    if (activeTab === 'dataMapping') {
                      return <DataMappingTab config={generatedResult.config} />;
                    }
                    if (activeTab === 'entities') {
                      return <EntitiesTab config={generatedResult.config} />;
                    }
                    if (activeTab === 'json') {
                      return (
                        <div className="bg-bg-tertiary rounded-lg overflow-hidden">
                          <pre className="p-4 overflow-x-auto text-sm max-h-96 text-text-primary leading-relaxed">
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

              {/* Starting Points Collection */}
              {generatedResult.config.startingPoints &&
                generatedResult.config.startingPoints.length > 0 && (
                  <div className="card">
                    <StartingPointsCollector
                      startingPoints={generatedResult.config.startingPoints}
                      onChange={setStartingPointValues}
                    />
                  </div>
                )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setGenerationStep('idle');
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
                        status: 'draft',
                      });
                      window.location.reload();
                    } catch (error) {
                      console.error('Failed to save config:', error);
                    }
                  }}
                  disabled={saveConfig.isPending}
                  className="btn btn-secondary"
                >
                  Save as Draft
                </button>
                <button
                  onClick={async () => {
                    console.log('Save & Activate clicked');
                    console.log(
                      'Config to save:\n',
                      JSON.stringify(generatedResult.config, null, 2),
                    );
                    console.log(
                      'Starting point values:\n',
                      JSON.stringify(startingPointValues, null, 2),
                    );
                    try {
                      const result = await saveConfig.mutateAsync({
                        config: generatedResult.config,
                        status: 'active',
                        startingPointValues:
                          Object.keys(startingPointValues).length > 0
                            ? startingPointValues
                            : undefined,
                      });
                      console.log('Save successful:', result);
                      // Wait a moment before reloading to ensure save completes
                      setTimeout(() => {
                        window.location.reload();
                      }, 500);
                    } catch (error) {
                      console.error('Failed to save config:', error);
                      alert('Failed to save config. Check console for details.');
                    }
                  }}
                  disabled={
                    saveConfig.isPending ||
                    !generatedResult?.validation.valid ||
                    !areRequiredStartingPointsFilled(
                      generatedResult?.config.startingPoints || [],
                      startingPointValues,
                    )
                  }
                  className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saveConfig.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    'Save & Activate'
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
  if (generationStep === 'generating') {
    return (
      <div className="pb-8">
        <div className="w-full py-8">
          <div className="card text-center py-12">
            <Loader2 className="w-12 h-12 text-brand-purple animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">Regenerating Config...</h3>
            <p className="text-text-tertiary">
              Analyzing MCP server and generating new indexing configuration
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (generationStep === 'result' && generatedResult) {
    return (
      <div className="pb-8">
        <div className="w-full py-8">
          {/* Same result UI as in !config block */}
          <div className="mb-8">
            <button
              onClick={() => {
                setGenerationStep('idle');
                setGeneratedResult(null);
              }}
              className="flex items-center gap-2 text-text-tertiary hover:text-text-primary mb-4"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Config
            </button>
            <h1 className="text-3xl font-bold text-text-primary">Regenerated Configuration</h1>
            <p className="mt-2 text-text-tertiary">
              Review and save the new configuration for {config.serverName}
            </p>
          </div>

          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="card">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-brand-success/10 rounded-lg">
                    <FileJson className="w-6 h-6 text-brand-success" />
                  </div>
                  <div>
                    <p className="text-sm text-text-tertiary">READ Tools</p>
                    <p className="text-2xl font-bold text-text-primary">
                      {generatedResult.toolsUsed.length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-brand-purple/10 rounded-lg">
                    <FileJson className="w-6 h-6 text-brand-purple" />
                  </div>
                  <div>
                    <p className="text-sm text-text-tertiary">Fetchers</p>
                    <p className="text-2xl font-bold text-text-primary">
                      {Object.keys(generatedResult.config.fetchers).length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-brand-blue/10 rounded-lg">
                    <FileJson className="w-6 h-6 text-brand-blue" />
                  </div>
                  <div>
                    <p className="text-sm text-text-tertiary">Record Types</p>
                    <p className="text-2xl font-bold text-text-primary">
                      {Object.keys(generatedResult.config.recordTypes).length}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Validation Results */}
            {generatedResult.validation.errors.length > 0 && (
              <div className="card bg-brand-error/10 border-brand-error/30">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-brand-error flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-brand-error">Validation Errors</h3>
                    <ul className="mt-2 text-sm text-brand-error/80 space-y-1">
                      {generatedResult.validation.errors.map((error: any, i: number) => (
                        <li key={i}>
                          {error.path}: {error.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {generatedResult.validation.warnings.length > 0 && (
              <div className="card bg-brand-warning/10 border-brand-warning/30">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-brand-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-brand-warning">Warnings</h3>
                    <ul className="mt-2 text-sm text-brand-warning/80 space-y-1">
                      {generatedResult.validation.warnings.map((warning: any, i: number) => (
                        <li key={i}>
                          {warning.path}: {warning.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Success Message */}
            {generatedResult.validation.valid && (
              <div className="card bg-brand-success/10 border-brand-success/30">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-brand-success flex items-center justify-center flex-shrink-0 mt-0.5">
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
                    <h3 className="text-sm font-medium text-brand-success">
                      Config generated successfully!
                    </h3>
                    <p className="mt-1 text-sm text-brand-success/80">
                      The configuration passed all validation checks and is ready to use.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Sync Pipeline */}
            {generatedResult.config.syncOrder && generatedResult.config.syncOrder.length > 0 && (
              <div className="bg-gradient-to-r from-brand-blue/5 to-brand-purple/5 border border-brand-blue/30 rounded-lg p-4">
                <h3 className="text-xs font-medium text-text-tertiary uppercase mb-3">
                  Sync Pipeline
                </h3>
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  {generatedResult.config.syncOrder.map((fetcherName: string, index: number) => (
                    <div key={fetcherName} className="flex items-center gap-2 flex-shrink-0">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-primary border border-brand-blue/40 rounded-lg shadow-sm">
                        <span className="flex items-center justify-center w-5 h-5 bg-brand-blue text-white text-xs font-bold rounded-full">
                          {index + 1}
                        </span>
                        <span className="text-sm font-medium text-text-primary">{fetcherName}</span>
                      </div>
                      {index < generatedResult.config.syncOrder.length - 1 && (
                        <svg
                          className="w-4 h-4 text-brand-blue"
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
                  ))}
                </div>
              </div>
            )}

            {/* Tabbed Config Preview */}
            <div className="card">
              <ConfigTabs
                tabs={[
                  {
                    id: 'dataMapping',
                    label: 'Data Mapping',
                    icon: <Database className="w-4 h-4" />,
                  },
                  {
                    id: 'entities',
                    label: 'Graph Entities',
                    icon: <GitBranch className="w-4 h-4" />,
                  },
                  {
                    id: 'json',
                    label: 'Raw JSON',
                    icon: <Code className="w-4 h-4" />,
                  },
                ]}
              >
                {(activeTab) => {
                  if (activeTab === 'dataMapping') {
                    return <DataMappingTab config={generatedResult.config} />;
                  }
                  if (activeTab === 'entities') {
                    return <EntitiesTab config={generatedResult.config} />;
                  }
                  if (activeTab === 'json') {
                    return (
                      <div className="bg-bg-tertiary rounded-lg overflow-hidden">
                        <pre className="p-4 overflow-x-auto text-sm max-h-96 text-text-primary leading-relaxed">
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
                  setGenerationStep('idle');
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
                      status: 'draft',
                    });
                    window.location.reload();
                  } catch (error) {
                    console.error('Failed to save config:', error);
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
                      status: 'active',
                    });
                    setTimeout(() => {
                      window.location.reload();
                    }, 500);
                  } catch (error) {
                    console.error('Failed to save config:', error);
                    alert('Failed to save config. Check console for details.');
                  }
                }}
                disabled={saveConfig.isPending || !generatedResult?.validation.valid}
                className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveConfig.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  'Save & Activate'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <div className="w-full py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/data-sources')}
            className="flex items-center gap-2 text-text-tertiary hover:text-text-primary mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Data Sources
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-text-primary">
                Indexing Config: {config.displayName}
              </h1>
              <p className="mt-2 text-text-tertiary">
                Auto-generated configuration for {config.serverName}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!isPresetBased && (
                <>
                  <button
                    onClick={async () => {
                      console.log('Regenerating config for:', config.serverName);
                      setGenerationStep('generating');
                      try {
                        const result = await generateConfig.mutateAsync({
                          serverName: config.serverName,
                        });
                        console.log(
                          'Config regeneration completed:\n',
                          JSON.stringify(result, null, 2),
                        );
                        setGeneratedResult(result);
                        setGenerationStep('result');
                      } catch (error) {
                        console.error('Failed to regenerate config:', error);
                        setGenerationStep('idle');
                      }
                    }}
                    className="btn btn-secondary inline-flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Regenerate Config
                  </button>
                  <button
                    onClick={() => setShowGuidanceModal(true)}
                    className="btn btn-secondary inline-flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Regenerate with Guidance
                  </button>
                </>
              )}
              <button
                onClick={() => setShowResetModal(true)}
                className="btn btn-primary inline-flex items-center gap-2 bg-brand-warning hover:bg-brand-warning/90 border-brand-warning text-white"
              >
                <RefreshCw className="w-4 h-4" />
                Reset & Full Resync
              </button>
              {(() => {
                const statusText = config.status.charAt(0).toUpperCase() + config.status.slice(1);
                const statusClass =
                  config.status === 'active'
                    ? 'bg-brand-success/10 text-brand-success'
                    : config.status === 'draft'
                      ? 'bg-bg-secondary text-text-secondary'
                      : 'bg-brand-error/10 text-brand-error';

                return (
                  <span className={`px-3 py-1 text-sm font-medium rounded-full ${statusClass}`}>
                    {statusText}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Post-Processing Info */}
        {(config.config as any).postProcessing?.enabled && (
          <div className="mb-6 bg-gradient-to-r from-brand-purple/5 to-brand-blue/5 border border-brand-purple/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-brand-purple/10 rounded-lg flex-shrink-0">
                <RefreshCw className="w-5 h-5 text-brand-purple" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-text-primary mb-1">
                  Post-Processing Enabled
                </h3>
                <p className="text-sm text-text-secondary mb-3">
                  {(config.config as any).postProcessing.description ||
                    'Additional processing will run after initial indexing'}
                </p>
                <div className="flex flex-wrap gap-4 text-xs text-text-tertiary">
                  {(config.config as any).postProcessing.followRelationships && (
                    <div className="flex items-center gap-1">
                      <GitBranch className="w-3.5 h-3.5" />
                      <span>
                        Follows:{' '}
                        {(config.config as any).postProcessing.followRelationships.join(', ')}
                      </span>
                    </div>
                  )}
                  {(config.config as any).postProcessing.maxIterations && (
                    <div className="flex items-center gap-1">
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>
                        Max iterations: {(config.config as any).postProcessing.maxIterations}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-bg-primary border border-border-secondary rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-brand-purple" />
              <div>
                <p className="text-xs text-text-quaternary">Fetchers</p>
                <p className="text-xl font-bold text-text-primary">
                  {Object.keys(config.config.fetchers || {}).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-bg-primary border border-border-secondary rounded-lg p-4">
            <div className="flex items-center gap-2">
              <FileJson className="w-5 h-5 text-brand-success" />
              <div>
                <p className="text-xs text-text-quaternary">Record Types</p>
                <p className="text-xl font-bold text-text-primary">
                  {Object.keys(config.config.recordTypes || {}).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-bg-primary border border-border-secondary rounded-lg p-4">
            <div className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-brand-purple" />
              <div>
                <p className="text-xs text-text-quaternary">Entities</p>
                <p className="text-xl font-bold text-text-primary">
                  {(() => {
                    let total = 0;
                    Object.values(config.config.recordTypes || {}).forEach((rt: any) => {
                      total += (rt.entities || []).length;
                    });
                    return total;
                  })()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-bg-primary border border-border-secondary rounded-lg p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-text-tertiary" />
              <div>
                <p className="text-xs text-text-quaternary">Updated</p>
                <p className="text-sm font-medium text-text-primary">
                  {new Date(config.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sync Pipeline */}
        {(config.config as any).syncOrder && (config.config as any).syncOrder.length > 0 && (
          <div className="mb-6 bg-gradient-to-r from-brand-blue/5 to-brand-purple/5 border border-brand-blue/30 rounded-lg p-4">
            <h3 className="text-xs font-medium text-text-tertiary uppercase mb-3">Sync Pipeline</h3>
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {(config.config as any).syncOrder.map((fetcherName: string, index: number) => (
                <div key={fetcherName} className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-primary border border-brand-blue/40 rounded-lg shadow-sm">
                    <span className="flex items-center justify-center w-5 h-5 bg-brand-blue text-white text-xs font-bold rounded-full">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-text-primary">{fetcherName}</span>
                  </div>
                  {index < (config.config as any).syncOrder.length - 1 && (
                    <svg
                      className="w-4 h-4 text-brand-blue"
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
              ))}
            </div>
          </div>
        )}

        {/* Tabbed Config View */}
        <div className="card">
          <ConfigTabs
            tabs={[
              {
                id: 'startingPoints',
                label: 'Starting Points',
                icon: <PlayCircle className="w-4 h-4" />,
              },
              {
                id: 'dataMapping',
                label: 'Data Mapping',
                icon: <Database className="w-4 h-4" />,
              },
              {
                id: 'entities',
                label: 'Graph Entities',
                icon: <GitBranch className="w-4 h-4" />,
              },
              {
                id: 'json',
                label: 'Raw JSON',
                icon: <Code className="w-4 h-4" />,
              },
            ]}
          >
            {(activeTab) => {
              if (activeTab === 'startingPoints') {
                return <StartingPointsTab serverName={config.serverName} />;
              }
              if (activeTab === 'dataMapping') {
                return <DataMappingTab config={config.config} />;
              }
              if (activeTab === 'entities') {
                return <EntitiesTab config={config.config} />;
              }
              if (activeTab === 'json') {
                return (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-text-primary">
                        Configuration JSON
                      </h2>
                      <div className="flex items-center gap-2">
                        {!isEditing && (
                          <>
                            <button
                              onClick={async () => {
                                try {
                                  await reloadFromMarketplace.mutateAsync(config.serverName);
                                  toast.success('Config reloaded from marketplace successfully!');
                                  setTimeout(() => window.location.reload(), 500);
                                } catch (error) {
                                  console.error('Failed to reload config:', error);
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : 'Failed to reload config from marketplace',
                                  );
                                }
                              }}
                              disabled={reloadFromMarketplace.isPending}
                              className="btn btn-secondary text-sm inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <RefreshCw
                                className={`w-4 h-4 ${
                                  reloadFromMarketplace.isPending ? 'animate-spin' : ''
                                }`}
                              />
                              {reloadFromMarketplace.isPending
                                ? 'Reloading...'
                                : 'Reload from Marketplace'}
                            </button>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  JSON.stringify(config.config, null, 2),
                                );
                              }}
                              className="btn btn-secondary text-sm"
                            >
                              Copy to Clipboard
                            </button>
                            {!isPresetBased && (
                              <button
                                onClick={() => {
                                  setIsEditing(true);
                                  setEditedJson(JSON.stringify(config.config, null, 2));
                                  setParseError(null);
                                }}
                                className="btn btn-primary text-sm inline-flex items-center gap-2"
                              >
                                <Edit className="w-4 h-4" />
                                Edit Config
                              </button>
                            )}
                          </>
                        )}
                        {isEditing && (
                          <>
                            <button
                              onClick={() => {
                                setIsEditing(false);
                                setEditedJson('');
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
                                    console.error('Failed to save config:', error);
                                    alert('Failed to save config. Check console for details.');
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
                      <div className="mb-4 p-3 bg-brand-error/10 border border-brand-error/30 rounded-lg">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-5 h-5 text-brand-error flex-shrink-0 mt-0.5" />
                          <div>
                            <h3 className="text-sm font-medium text-brand-error">
                              JSON Syntax Error
                            </h3>
                            <p className="mt-1 text-sm text-brand-error/80">{parseError}</p>
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
                        className="w-full bg-bg-tertiary text-text-primary p-4 rounded-lg font-mono text-sm resize-y min-h-96 max-h-[600px] focus:outline-none focus:ring-2 focus:ring-brand-purple"
                        spellCheck={false}
                      />
                    ) : (
                      <pre className="bg-bg-tertiary text-text-primary p-4 rounded-lg overflow-x-auto text-sm">
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
        <Modal
          isOpen={showGuidanceModal}
          onClose={() => {
            setShowGuidanceModal(false);
            setUserGuidance('');
          }}
          title="Regenerate Config with Guidance"
          size="lg"
        >
          <div className="p-6">
            <p className="text-sm text-text-tertiary mb-4">
              Provide specific instructions to guide the LLM in generating the config. For example,
              you can request specific entity extractions, field mappings, or data transformations.
            </p>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Your Guidance
              </label>
              <textarea
                value={userGuidance}
                onChange={(e) => setUserGuidance(e.target.value)}
                placeholder="Example: Please add entity extraction for project statuses. Projects have a status field that can be: Planned, In Progress, Paused, Completed, or Canceled."
                className="textarea h-48"
              />
            </div>
          </div>

          <ModalFooter>
            <button
              onClick={() => {
                setShowGuidanceModal(false);
                setUserGuidance('');
              }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                setShowGuidanceModal(false);
                setGenerationStep('generating');
                try {
                  const result = await generateConfig.mutateAsync({
                    serverName: config.serverName,
                    userGuidance: userGuidance || undefined,
                  });
                  setGeneratedResult(result);
                  setGenerationStep('result');
                  setUserGuidance('');
                } catch (error) {
                  console.error('Failed to regenerate config:', error);
                  setGenerationStep('idle');
                }
              }}
              disabled={!userGuidance.trim()}
              className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Generate Config
            </button>
          </ModalFooter>
        </Modal>

        {/* Reset Sync Modal */}
        <Modal
          isOpen={showResetModal}
          onClose={() => setShowResetModal(false)}
          title="Reset Sync State & Full Resync"
          subtitle="This will clear all sync progress and re-index all data from scratch."
          size="lg"
        >
          <div className="p-6">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-brand-warning/10 rounded-lg flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-brand-warning" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-text-primary mb-2">What will happen:</h3>
                <ul className="text-sm text-text-secondary space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-brand-warning mt-0.5">•</span>
                    <span>Sync cursors will be reset for all fetchers</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-brand-warning mt-0.5">•</span>
                    <span>A full resync will be triggered immediately</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-brand-warning mt-0.5">•</span>
                    <span>All data will be re-fetched from the source</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-brand-success mt-0.5">•</span>
                    <span>Existing records will be updated (not deleted)</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <ModalFooter>
            <button onClick={() => setShowResetModal(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button
              onClick={async () => {
                try {
                  console.log('Resetting sync state for:', config.serverName);
                  await resetSyncState.mutateAsync(config.serverName);
                  console.log('Sync state reset, starting full sync...');

                  await syncWithConfig.mutateAsync({
                    serverName: config.serverName,
                    incremental: false,
                  });

                  setShowResetModal(false);
                  toast.success('Sync state reset and full resync started successfully!');
                } catch (error) {
                  console.error('Failed to reset and resync:', error);
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : 'Failed to reset and resync. Check console for details.',
                  );
                }
              }}
              disabled={resetSyncState.isPending || syncWithConfig.isPending}
              className="btn btn-primary bg-brand-warning hover:bg-brand-warning/90 border-brand-warning text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resetSyncState.isPending || syncWithConfig.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                'Reset & Resync'
              )}
            </button>
          </ModalFooter>
        </Modal>
      </div>
    </div>
  );
}
