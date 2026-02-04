import { useState, useEffect, useRef } from 'react';
import { Plus, X, AlertCircle, CheckCircle2 } from 'lucide-react';

interface StartingPointConfig {
  name: string;
  description: string;
  required?: boolean;
  userProvided?: boolean;
  examples?: string[];
}

interface StartingPointsCollectorProps {
  startingPoints: StartingPointConfig[];
  onChange: (values: Record<string, string[]>) => void;
  initialValues?: Record<string, string[]>;
}

export function StartingPointsCollector({
  startingPoints,
  onChange,
  initialValues = {},
}: StartingPointsCollectorProps) {
  const isInitializedRef = useRef(false);
  const [values, setValues] = useState<Record<string, string[]>>(() => {
    // Initialize state once on mount
    const initialized: Record<string, string[]> = {};
    startingPoints.forEach((sp) => {
      // If no initial values, start with one empty field so user can start typing immediately
      initialized[sp.name] = initialValues[sp.name]?.length > 0 ? initialValues[sp.name] : [''];
    });
    return initialized;
  });

  // Only notify parent when values actually change (not on initial mount)
  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      return;
    }
    onChange(values);
  }, [values, onChange]);

  const addValue = (name: string) => {
    setValues((prev) => ({
      ...prev,
      [name]: [...(prev[name] || []), ''],
    }));
  };

  const removeValue = (name: string, index: number) => {
    setValues((prev) => ({
      ...prev,
      [name]: (prev[name] || []).filter((_, i) => i !== index),
    }));
  };

  const updateValue = (name: string, index: number, value: string) => {
    setValues((prev) => ({
      ...prev,
      [name]: (prev[name] || []).map((v, i) => (i === index ? value : v)),
    }));
  };

  const getConfiguredCount = () => {
    return startingPoints.filter((sp) => {
      if (!sp.required) return false;
      const vals = values[sp.name] || [];
      return vals.some((v) => v.trim().length > 0);
    }).length;
  };

  const allRequired = startingPoints.filter((sp) => sp.required).length;
  const configuredCount = getConfiguredCount();
  const progressPercent = allRequired > 0 ? (configuredCount / allRequired) * 100 : 100;

  if (startingPoints.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-1">
          Starting Points Configuration
        </h3>
        <p className="text-sm text-text-secondary">
          Provide seed values for the indexer to begin crawling data
        </p>
      </div>

      {/* Progress Banner */}
      {allRequired > 0 && (
        <div
          className={`rounded-lg p-4 border-2 ${
            progressPercent === 100
              ? 'bg-brand-success/10 border-brand-success/30'
              : 'bg-brand-warning/10 border-brand-warning/30'
          }`}
        >
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-3">
              {progressPercent === 100 ? (
                <CheckCircle2 className="w-6 h-6 text-brand-success flex-shrink-0" />
              ) : (
                <AlertCircle className="w-6 h-6 text-brand-warning flex-shrink-0" />
              )}
              <div>
                <p
                  className={`text-sm font-semibold ${
                    progressPercent === 100 ? 'text-brand-success' : 'text-brand-warning'
                  }`}
                >
                  {progressPercent === 100
                    ? '✓ All Required Fields Complete'
                    : '⚠️ Required Configuration'}
                </p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {progressPercent === 100
                    ? 'You can now save and start indexing'
                    : 'Please complete all required fields before saving'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-baseline gap-1">
                <span
                  className={`text-2xl font-bold ${
                    progressPercent === 100 ? 'text-brand-success' : 'text-brand-warning'
                  }`}
                >
                  {configuredCount}
                </span>
                <span className="text-lg text-text-tertiary">/{allRequired}</span>
              </div>
              <p className="text-xs text-text-secondary">required fields</p>
            </div>
          </div>
          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="h-3 bg-bg-tertiary rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  progressPercent === 100 ? 'bg-brand-success' : 'bg-brand-warning'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Starting Points List */}
      <div className="space-y-6">
        {startingPoints.map((sp, index) => {
          const spValues = values[sp.name] || [];
          const hasValues = spValues.some((v) => v.trim().length > 0);
          const stepNumber = index + 1;
          const totalSteps = startingPoints.length;

          return (
            <div
              key={sp.name}
              className={`space-y-3 p-4 rounded-lg border-2 ${
                sp.required
                  ? hasValues
                    ? 'border-brand-success/30 bg-brand-success/5'
                    : 'border-brand-warning/30 bg-brand-warning/5'
                  : 'border-border-secondary bg-bg-secondary'
              }`}
            >
              {/* Header Row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                        sp.required
                          ? hasValues
                            ? 'bg-brand-success text-white'
                            : 'bg-brand-warning text-white'
                          : 'bg-brand-blue/20 text-brand-blue'
                      }`}
                    >
                      {stepNumber}
                    </span>
                    <span className="text-sm font-semibold text-text-primary">{sp.name}</span>
                    {sp.required ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-brand-error/20 text-brand-error">
                        Required
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-brand-blue/20 text-brand-blue">
                        Optional
                      </span>
                    )}
                    <span className="text-xs text-text-tertiary">
                      (Step {stepNumber} of {totalSteps})
                    </span>
                  </div>
                  <p className="text-sm text-text-secondary mb-1">{sp.description}</p>
                  {sp.examples && sp.examples.length > 0 && (
                    <p className="text-xs text-text-tertiary mt-2 font-mono bg-bg-tertiary px-2 py-1 rounded">
                      💡 Example: {sp.examples[0]}
                    </p>
                  )}
                </div>
                <div>
                  {hasValues ? (
                    <CheckCircle2 className="w-6 h-6 text-brand-success" />
                  ) : sp.required ? (
                    <AlertCircle className="w-6 h-6 text-brand-warning" />
                  ) : null}
                </div>
              </div>

              {/* Input Rows */}
              {spValues.length === 0 ? (
                <div className="text-sm text-text-tertiary italic py-2">No values added yet</div>
              ) : (
                <div className="space-y-2">
                  {spValues.map((value, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => updateValue(sp.name, index, e.target.value)}
                        placeholder={`Enter ${sp.name} value`}
                        className="flex-1 px-3 py-2 bg-bg-primary border border-border-secondary rounded-lg text-text-primary text-sm placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand-lime focus:border-transparent transition-colors"
                      />
                      <button
                        onClick={() => removeValue(sp.name, index)}
                        className="p-2 text-text-tertiary hover:text-brand-error hover:bg-brand-error/10 rounded-lg transition-colors"
                        title="Remove this value"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Button */}
              <button
                onClick={() => addValue(sp.name)}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-brand-lime hover:text-brand-lime-dark hover:bg-brand-lime/10 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add {sp.name.replace(/_/g, ' ')}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
