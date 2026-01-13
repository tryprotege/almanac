import { useState, useEffect } from 'react';
import { syncConfigApi } from '../../lib/api';
import { Plus, X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

interface StartingPoint {
  name: string;
  description: string;
  required: boolean;
  userProvided: boolean;
  currentValue: string;
  hasValue: boolean;
}

interface StartingPointsTabProps {
  serverName: string;
}

export default function StartingPointsTab({ serverName }: StartingPointsTabProps) {
  const [startingPoints, setStartingPoints] = useState<StartingPoint[]>([]);
  // Store values as arrays of strings for each starting point
  const [values, setValues] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [allRequired, setAllRequired] = useState(0);
  const [allProvided, setAllProvided] = useState(0);

  useEffect(() => {
    loadStartingPoints();
  }, [serverName]);

  const loadStartingPoints = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await syncConfigApi.getStartingPoints(serverName);

      if (response.data.success && response.data.data) {
        const data = response.data.data;
        setStartingPoints(data.startingPoints);
        setAllRequired(data.allRequired);
        setAllProvided(data.allProvided);

        // Parse current values into arrays
        const parsedValues: Record<string, string[]> = {};
        data.startingPoints.forEach((sp: StartingPoint) => {
          if (sp.currentValue) {
            // Split comma-separated values
            parsedValues[sp.name] = sp.currentValue
              .split(',')
              .map((v) => v.trim())
              .filter((v) => v.length > 0);
          } else {
            parsedValues[sp.name] = [];
          }
        });
        setValues(parsedValues);
      }
    } catch (err: any) {
      console.error('Failed to load starting points:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load starting points');
    } finally {
      setLoading(false);
    }
  };

  const addValue = (name: string) => {
    setValues((prev) => ({
      ...prev,
      [name]: [...(prev[name] || []), ''],
    }));
    if (successMessage) setSuccessMessage(null);
  };

  const removeValue = (name: string, index: number) => {
    setValues((prev) => ({
      ...prev,
      [name]: (prev[name] || []).filter((_, i) => i !== index),
    }));
    if (successMessage) setSuccessMessage(null);
  };

  const updateValue = (name: string, index: number, value: string) => {
    setValues((prev) => ({
      ...prev,
      [name]: (prev[name] || []).map((v, i) => (i === index ? value : v)),
    }));
    if (successMessage) setSuccessMessage(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      // Convert arrays back to comma-separated strings
      const formattedValues: Record<string, string> = {};
      Object.entries(values).forEach(([name, vals]) => {
        formattedValues[name] = vals.filter((v) => v.trim().length > 0).join(', ');
      });

      const response = await syncConfigApi.updateStartingPoints(serverName, formattedValues);

      if (response.data.success) {
        setSuccessMessage('Starting points saved successfully!');
        await loadStartingPoints();
      }
    } catch (err: any) {
      console.error('Failed to save starting points:', err);
      const errorDetails = err.response?.data?.details;
      setError(
        errorDetails
          ? `Validation failed: ${errorDetails.join(', ')}`
          : err.response?.data?.error || err.message || 'Failed to save starting points',
      );
    } finally {
      setSaving(false);
    }
  };

  const hasUnsavedChanges = () => {
    return startingPoints.some((sp) => {
      const currentVals = (values[sp.name] || []).filter((v) => v.trim().length > 0).join(', ');
      const originalVals = sp.currentValue || '';
      return currentVals !== originalVals;
    });
  };

  const getConfiguredCount = () => {
    return startingPoints.filter((sp) => {
      if (!sp.required) return false;
      const vals = values[sp.name] || [];
      return vals.some((v) => v.trim().length > 0);
    }).length;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-brand-purple animate-spin mx-auto mb-4" />
          <p className="text-text-secondary">Loading starting points...</p>
        </div>
      </div>
    );
  }

  if (startingPoints.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-success/10 rounded-full mb-4">
            <CheckCircle2 className="w-8 h-8 text-brand-success" />
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-2">
            No Starting Points Required
          </h3>
          <p className="text-text-secondary">
            This configuration doesn't require any starting point values. The fetchers can retrieve
            all data without initial seed values.
          </p>
        </div>
      </div>
    );
  }

  const configuredCount = getConfiguredCount();
  const progressPercent = allRequired > 0 ? (configuredCount / allRequired) * 100 : 100;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-text-primary mb-1">Starting Points</h3>
          <p className="text-sm text-text-secondary">
            Provide seed values for the indexer to begin crawling data
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-text-primary">{configuredCount}</span>
            <span className="text-lg text-text-tertiary">/{allRequired}</span>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">Required configured</p>
        </div>
      </div>

      {/* Progress Bar */}
      {allRequired > 0 && (
        <div className="space-y-1">
          <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                progressPercent === 100 ? 'bg-brand-success' : 'bg-brand-purple'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-text-tertiary text-right">
            {progressPercent === 100
              ? 'All required points configured'
              : `${Math.round(progressPercent)}% complete`}
          </p>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="bg-brand-error/10 border border-brand-error/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-brand-error flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-brand-error mb-1">Error</h4>
              <p className="text-sm text-brand-error/80">{error}</p>
            </div>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="bg-brand-success/10 border border-brand-success/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-brand-success flex-shrink-0 mt-0.5" />
            <p className="text-sm text-brand-success">{successMessage}</p>
          </div>
        </div>
      )}

      {/* Starting Points List */}
      <div className="space-y-6">
        {startingPoints.map((sp) => {
          const spValues = values[sp.name] || [];
          const hasValues = spValues.some((v) => v.trim().length > 0);

          return (
            <div key={sp.name} className="space-y-3">
              {/* Header Row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-text-primary">📍 {sp.name}</span>
                    {sp.required ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-brand-error/20 text-brand-error">
                        Required
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-brand-blue/20 text-brand-blue">
                        Optional
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary">{sp.description}</p>
                </div>
                <div>
                  {hasValues ? (
                    <CheckCircle2 className="w-5 h-5 text-brand-success" />
                  ) : sp.required ? (
                    <AlertCircle className="w-5 h-5 text-brand-warning" />
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
                        className="flex-1 px-3 py-2 bg-bg-primary border border-border-secondary rounded-lg text-text-primary text-sm placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent transition-colors"
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
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-brand-purple hover:text-brand-purple-dark hover:bg-brand-purple/10 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add {sp.name.replace(/_/g, ' ')}
              </button>
            </div>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-6 border-t border-border-secondary">
        <div className="text-sm">
          {hasUnsavedChanges() && <span className="text-brand-warning">● Unsaved changes</span>}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadStartingPoints}
            disabled={saving || !hasUnsavedChanges()}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-secondary border border-border-secondary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasUnsavedChanges()}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-purple hover:bg-brand-purple-dark rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
