import { CheckCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface SavingStepProps {
  serverName: string;
  isCustomServer: boolean;
  currentStep: 'saving' | 'activating' | 'syncing' | 'complete' | 'error' | null;
  error?: string;
}

export function SavingStep({ serverName, isCustomServer, currentStep, error }: SavingStepProps) {
  const steps = [
    {
      key: 'saving',
      label: 'Saving data source configuration',
      description: 'Storing MCP server connection details',
    },
    ...(isCustomServer
      ? [
          {
            key: 'activating',
            label: 'Activating sync configuration',
            description: 'Enabling auto-generated or imported config',
          },
        ]
      : []),
    {
      key: 'syncing',
      label: 'Starting initial data sync',
      description: `Fetching data from ${serverName}`,
    },
  ];

  const getStepStatus = (stepKey: string) => {
    if (!currentStep) return 'pending';

    const currentIndex = steps.findIndex((s) => s.key === currentStep);
    const stepIndex = steps.findIndex((s) => s.key === stepKey);

    if (currentStep === 'error') {
      if (stepIndex <= currentIndex) return 'error';
      return 'pending';
    }

    if (currentStep === 'complete') return 'complete';

    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">Saving & Indexing</h3>
        <p className="text-sm text-text-tertiary">
          Setting up your data source and starting the initial sync
        </p>
      </div>

      {/* Progress Steps */}
      <div className="space-y-4">
        {steps.map((step) => {
          const stepStatus = getStepStatus(step.key);
          return (
            <div
              key={step.key}
              className={`flex items-start gap-4 p-4 rounded-lg border-2 transition-all ${
                stepStatus === 'active'
                  ? 'border-brand-blue bg-brand-blue/5'
                  : stepStatus === 'complete'
                    ? 'border-brand-success bg-brand-success/5'
                    : stepStatus === 'error'
                      ? 'border-error-500 bg-error-500/5'
                      : 'border-border-secondary bg-bg-secondary'
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {stepStatus === 'complete' ? (
                  <CheckCircle className="w-5 h-5 text-brand-success" />
                ) : stepStatus === 'active' ? (
                  <Loader2 className="w-5 h-5 text-brand-blue animate-spin" />
                ) : stepStatus === 'error' ? (
                  <div className="w-5 h-5 rounded-full bg-error-500 flex items-center justify-center text-white text-xs">
                    !
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-border-secondary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4
                  className={`text-sm font-medium ${
                    stepStatus === 'active'
                      ? 'text-brand-blue'
                      : stepStatus === 'complete'
                        ? 'text-brand-success'
                        : stepStatus === 'error'
                          ? 'text-error-500'
                          : 'text-text-tertiary'
                  }`}
                >
                  {step.label}
                </h4>
                <p className="mt-1 text-xs text-text-tertiary">{step.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-error-500 flex items-center justify-center text-white text-xs flex-shrink-0 mt-0.5">
              !
            </div>
            <div>
              <h4 className="text-sm font-medium text-error-900 dark:text-error-200">
                Save Failed
              </h4>
              <p className="mt-1 text-sm text-error-700 dark:text-error-300">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success State */}
      {currentStep === 'complete' && !error && (
        <div className="bg-brand-success/10 border border-brand-success/30 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-brand-success flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-brand-success mb-1">
                Data Source Configured!
              </h4>
              <p className="text-sm text-text-secondary">
                Your data source has been saved and initial sync has started. You can monitor
                progress from the Data Sources page.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Info Box */}
      {currentStep && currentStep !== 'complete' && currentStep !== 'error' && (
        <div className="bg-brand-blue/10 border border-brand-blue/30 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <Loader2 className="w-5 h-5 text-brand-blue flex-shrink-0 mt-0.5 animate-spin" />
            <div>
              <h4 className="text-sm font-medium text-brand-blue mb-1">Please Wait</h4>
              <p className="text-sm text-text-secondary">
                This window will close automatically when the setup is complete.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
