import { ArrowLeft, CheckCircle, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

interface GeneratingStepProps {
  isGenerating: boolean;
  error?: string;
  onBack: () => void;
}

type GeneratingStatus = 'connecting' | 'analyzing' | 'generating' | 'complete';

export function GeneratingStep({ isGenerating, error, onBack }: GeneratingStepProps) {
  const [status, setStatus] = useState<GeneratingStatus>('connecting');

  useEffect(() => {
    if (!isGenerating) return;

    // Simulate progression through steps
    const timer1 = setTimeout(() => setStatus('analyzing'), 800);
    const timer2 = setTimeout(() => setStatus('generating'), 1600);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isGenerating]);

  const steps = [
    {
      key: 'connecting' as GeneratingStatus,
      label: 'Connecting to MCP server',
      description: 'Establishing connection and retrieving tools',
    },
    {
      key: 'analyzing' as GeneratingStatus,
      label: 'Analyzing available tools',
      description: 'Classifying READ vs WRITE operations',
    },
    {
      key: 'generating' as GeneratingStatus,
      label: 'Generating sync configuration',
      description: 'AI is creating optimized fetchers and record types',
    },
  ];

  const getStepStatus = (stepKey: GeneratingStatus) => {
    const currentIndex = steps.findIndex((s) => s.key === status);
    const stepIndex = steps.findIndex((s) => s.key === stepKey);

    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex && isGenerating) return 'active';
    return 'pending';
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          Auto-Generating Configuration
        </h3>
        <p className="text-sm text-text-tertiary">
          Please wait while we analyze your MCP server and create an optimized sync configuration
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
                  ? 'border-brand-purple bg-brand-purple/5'
                  : stepStatus === 'complete'
                    ? 'border-brand-success bg-brand-success/5'
                    : 'border-border-secondary bg-bg-secondary'
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {stepStatus === 'complete' ? (
                  <CheckCircle className="w-5 h-5 text-brand-success" />
                ) : stepStatus === 'active' ? (
                  <Loader2 className="w-5 h-5 text-brand-purple animate-spin" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-border-secondary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4
                  className={`text-sm font-medium ${
                    stepStatus === 'active'
                      ? 'text-brand-purple'
                      : stepStatus === 'complete'
                        ? 'text-brand-success'
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
            <Sparkles className="w-5 h-5 text-error-600 dark:text-error-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-error-900 dark:text-error-200">
                Generation Failed
              </h4>
              <p className="mt-1 text-sm text-error-700 dark:text-error-300">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Info Box */}
      {isGenerating && (
        <div className="bg-brand-blue/10 border border-brand-blue/30 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <Sparkles className="w-5 h-5 text-brand-blue flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-brand-blue mb-1">AI-Powered Generation</h4>
              <p className="text-sm text-text-secondary">
                This process typically takes up to 5 minutes depending on the number of tools your
                MCP server provides.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-border-secondary">
        <button
          onClick={onBack}
          disabled={isGenerating}
          className="btn btn-secondary flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          {isGenerating ? 'Cancel' : 'Back'}
        </button>
      </div>
    </div>
  );
}
