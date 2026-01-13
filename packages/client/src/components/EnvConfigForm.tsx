import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw, Save, TestTube } from 'lucide-react';

interface SchemaInfo {
  default?: string;
  required: boolean;
  type: string;
  description?: string;
  options?: string[];
}

interface ConfigSection {
  title: string;
  key: string;
  schema: Record<string, SchemaInfo>;
  defaultExpanded?: boolean;
}

interface EnvConfigFormProps {
  sections: ConfigSection[];
  values: Record<string, any>;
  onValueChange: (key: string, value: string | boolean) => void;
  onSave: () => void;
  onTest?: () => void;
  isSaving?: boolean;
  isTesting?: boolean;
  invalidVars?: string[];
  showTestButton?: boolean;
  saveButtonText?: string;
  testButtonText?: string;
  lastUpdated?: string;
}

export function EnvConfigForm({
  sections,
  values,
  onValueChange,
  onSave,
  onTest,
  isSaving = false,
  isTesting = false,
  invalidVars = [],
  showTestButton = false,
  saveButtonText = 'Save Configuration',
  testButtonText = 'Test Connection',
  lastUpdated,
}: EnvConfigFormProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    sections.forEach((section) => {
      initial[section.key] = section.defaultExpanded ?? true;
    });
    return initial;
  });

  const toggleSection = (sectionKey: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const renderEnvInput = (key: string, schema: SchemaInfo, isInvalid: boolean) => {
    const rawValue = values[key];
    const isSensitive = ['API_KEY', 'PASSWORD', 'SECRET', 'ENCRYPTION'].some((s) =>
      key.includes(s),
    );

    // Check if value is masked
    const isMasked = typeof rawValue === 'string' && rawValue.includes('•');

    // Determine input type based on schema type
    const isBoolean = schema.type === 'boolean';
    const isNumber = schema.type === 'number';

    return (
      <div
        key={key}
        className={`p-3 rounded-lg border ${
          isInvalid ? 'bg-error-bg border-error-border' : 'bg-bg-tertiary border-border-primary'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <code className="text-sm font-mono font-semibold">{key}</code>
              {schema.required ? (
                <span className="text-xs text-red-500 font-medium">Required</span>
              ) : (
                <span className="text-xs text-text-tertiary font-medium">Optional</span>
              )}
              {isInvalid && (
                <span className="text-xs bg-error-bg text-error-text px-1.5 py-0.5 rounded">
                  Invalid
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <span>Type: {schema.type}</span>
              {schema.default !== undefined && (
                <span className="text-text-tertiary">Default: {schema.default}</span>
              )}
            </div>
            {schema.description && (
              <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
                {schema.description}
              </p>
            )}
          </div>
          <div className="w-64 shrink-0">
            {isBoolean ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rawValue === true || rawValue === 'true'}
                  onChange={(e) => onValueChange(key, e.target.checked)}
                  className="w-4 h-4 text-primary-600 rounded focus:ring-2 focus:ring-primary-500"
                />
                <span className="text-sm">
                  {rawValue === true || rawValue === 'true' ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            ) : isNumber ? (
              <input
                type="number"
                value={rawValue ?? ''}
                onChange={(e) => onValueChange(key, e.target.value)}
                placeholder={schema.default || 'Not set'}
                className={`input w-full text-sm ${isInvalid ? 'border-error-border' : ''}`}
              />
            ) : (
              <input
                type={isSensitive && !isMasked ? 'password' : 'text'}
                value={rawValue ?? ''}
                onChange={(e) => onValueChange(key, e.target.value)}
                placeholder={schema.default || 'Not set'}
                className={`input w-full text-sm ${isInvalid ? 'border-error-border' : ''}`}
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSection = (section: ConfigSection) => {
    const entries = Object.entries(section.schema);
    // Filter out invalid variables from regular sections (they'll be shown in the invalid section)
    const filteredEntries = entries.filter(([key]) => !invalidVars.includes(key));

    if (filteredEntries.length === 0) return null;

    const isExpanded = expandedSections[section.key];

    return (
      <div key={section.key} className="card mb-4">
        <button
          type="button"
          onClick={() => toggleSection(section.key)}
          className="w-full flex items-center justify-between text-left"
        >
          <h3 className="text-lg font-semibold text-text-primary">{section.title}</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">{filteredEntries.length} variables</span>
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-text-secondary" />
            ) : (
              <ChevronDown className="w-5 h-5 text-text-secondary" />
            )}
          </div>
        </button>

        {isExpanded && (
          <div className="mt-4 space-y-3">
            {filteredEntries.map(([key, info]) =>
              renderEnvInput(key, info, invalidVars.includes(key)),
            )}
          </div>
        )}
      </div>
    );
  };

  // Check if form is valid for testing
  const canTest = showTestButton && onTest && !isTesting && !isSaving;

  // Get all schema entries for invalid variables section
  const allSchema: Record<string, SchemaInfo> = {};
  sections.forEach((section) => {
    Object.assign(allSchema, section.schema);
  });

  const hasInvalidVars = invalidVars.length > 0;

  return (
    <div className="space-y-6">
      {/* Validation Status Banner */}
      {invalidVars.length > 0 && (
        <div className="bg-error-bg border border-error-border rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-error-text mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-error-text mb-2">Configuration Issues Detected</p>
              <p className="text-sm text-text-secondary mb-2">
                The following variables have issues and need to be fixed:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {invalidVars.map((key) => (
                  <code
                    key={key}
                    className="text-xs bg-error-bg border border-error-border text-error-text px-2 py-0.5 rounded"
                  >
                    {key}
                  </code>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invalid Variables Section - Always at top when there are issues */}
      {hasInvalidVars && (
        <div className="card border-2 border-error-border">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-error-text" />
            <h3 className="text-lg font-semibold text-error-text">Variables Requiring Attention</h3>
          </div>
          <div className="space-y-3">
            {invalidVars.map((key) => {
              const schema = allSchema[key];
              if (!schema) return null;
              return renderEnvInput(key, schema, true);
            })}
          </div>
        </div>
      )}

      {/* Configuration Sections */}
      {sections.map((section) => renderSection(section))}

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="btn btn-primary flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              {saveButtonText}
            </>
          )}
        </button>

        {showTestButton && onTest && (
          <button
            type="button"
            onClick={onTest}
            disabled={!canTest}
            className="btn btn-secondary flex items-center gap-2"
          >
            {isTesting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <TestTube className="w-4 h-4" />
                {testButtonText}
              </>
            )}
          </button>
        )}
      </div>

      {/* Last Updated */}
      {lastUpdated && (
        <p className="text-sm text-text-quaternary">
          Last updated: {new Date(lastUpdated).toLocaleString()}
        </p>
      )}
    </div>
  );
}
