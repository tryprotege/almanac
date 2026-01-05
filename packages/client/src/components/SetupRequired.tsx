import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Settings,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { api } from "../lib/api";

interface SchemaInfo {
  default?: string;
  required: boolean;
  type: string;
}

interface EnvData {
  values: Record<string, any>;
  schema: {
    infrastructure: Record<string, SchemaInfo>;
    application: Record<string, SchemaInfo>;
  };
  invalidVars: string[];
  setupComplete: boolean;
  configured: string[];
  missing: string[];
}

interface SetupRequiredProps {
  onSetupComplete?: () => void;
}

export function SetupRequired({ onSetupComplete }: SetupRequiredProps) {
  const [envData, setEnvData] = useState<EnvData | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [polling, setPolling] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    invalid: true,
    application: true,
    infrastructure: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (silent: boolean = false) => {
    try {
      const configRes = await api.get("/config/env");

      if (configRes.data.success && configRes.data.data) {
        const data = configRes.data.data;

        // Set env data (includes all status fields)
        setEnvData(data);

        if (data.setupComplete && onSetupComplete) {
          onSetupComplete();
        }

        // Initialize edited values with current values
        setEditedValues(data.values || {});

        return data.setupComplete;
      }
      return false;
    } catch (err) {
      if (!silent) {
        console.error("Failed to load configuration:", err);
        setMessage({
          type: "error",
          text: "Failed to load configuration. Please ensure the server is running.",
        });
      }
      return false;
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const pollEnvStatus = async (
    maxAttempts: number = 10,
    delayMs: number = 2000
  ) => {
    setPolling(true);
    setPollAttempt(0);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      setPollAttempt(attempt);

      setMessage({
        type: "success",
        text: `Checking environment status... (Attempt ${attempt}/${maxAttempts})`,
      });

      const isComplete = await loadData(true);

      if (isComplete) {
        setMessage({
          type: "success",
          text: "Environment configuration validated successfully! Redirecting...",
        });
        setPolling(false);
        setPollAttempt(0);

        // Give user a moment to see success message before navigating
        setTimeout(() => {
          if (onSetupComplete) {
            onSetupComplete();
          }
        }, 1000);
        return;
      }

      // Don't delay after the last attempt
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    // Max attempts reached without success
    setMessage({
      type: "error",
      text: `Environment validation incomplete after ${maxAttempts} attempts. Please check your configuration and ensure the server has restarted.`,
    });
    setPolling(false);
    setPollAttempt(0);

    // Reload data one final time to show current state
    await loadData(true);
  };

  const handleSave = async () => {
    if (!editedValues) return;

    setSaving(true);
    setMessage(null);

    try {
      const response = await api.put("/config/env", editedValues);
      setMessage({
        type: "success",
        text:
          response.data?.message ||
          "Configuration saved successfully. Validating environment...",
      });

      setSaving(false);

      // Start polling to check environment status
      // Wait a brief moment for the server to process the changes
      setTimeout(() => {
        pollEnvStatus(10, 2000);
      }, 1000);
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error.response?.data?.error || "Failed to save configuration",
      });
      setSaving(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleValueChange = (key: string, value: string | boolean) => {
    setEditedValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const renderEnvInput = (
    key: string,
    schema: SchemaInfo,
    isInvalid: boolean
  ) => {
    const rawValue = editedValues[key];
    const isSensitive = ["API_KEY", "PASSWORD", "SECRET", "ENCRYPTION"].some(
      (s) => key.includes(s)
    );

    // Check if value is masked
    const isMasked = typeof rawValue === "string" && rawValue.includes("•");

    // Determine input type based on schema type
    const isBoolean = schema.type === "boolean";
    const isNumber = schema.type === "number";

    return (
      <div
        key={key}
        className={`p-3 rounded-lg border ${
          isInvalid
            ? "bg-error-bg border-error-border"
            : "bg-bg-tertiary border-border-primary"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <code className="text-sm font-mono font-semibold">{key}</code>
              {schema.required && (
                <span className="text-xs text-red-500 font-medium">
                  Required
                </span>
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
                <span className="text-text-tertiary">
                  Default: {schema.default}
                </span>
              )}
            </div>
          </div>
          <div className="w-64 shrink-0">
            {isBoolean ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rawValue === true || rawValue === "true"}
                  onChange={(e) => handleValueChange(key, e.target.checked)}
                  className="w-4 h-4 text-primary-600 rounded focus:ring-2 focus:ring-primary-500"
                />
                <span className="text-sm">
                  {rawValue === true || rawValue === "true"
                    ? "Enabled"
                    : "Disabled"}
                </span>
              </label>
            ) : isNumber ? (
              <input
                type="number"
                value={rawValue ?? ""}
                onChange={(e) => handleValueChange(key, e.target.value)}
                placeholder={schema.default || "Not set"}
                className={`input w-full text-sm ${
                  isInvalid ? "border-error-border" : ""
                }`}
              />
            ) : (
              <input
                type={isSensitive && !isMasked ? "password" : "text"}
                value={rawValue ?? ""}
                onChange={(e) => handleValueChange(key, e.target.value)}
                placeholder={schema.default || "Not set"}
                className={`input w-full text-sm ${
                  isInvalid ? "border-error-border" : ""
                }`}
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSection = (
    title: string,
    sectionKey: string,
    schema: Record<string, SchemaInfo>,
    invalidVars: string[],
    filterInvalid: boolean = false
  ) => {
    const entries = Object.entries(schema);
    const filteredEntries = filterInvalid
      ? entries.filter(([key]) => invalidVars.includes(key))
      : entries.filter(([key]) => !invalidVars.includes(key));

    if (filteredEntries.length === 0) return null;

    const isExpanded = expandedSections[sectionKey];

    return (
      <div className="card mb-4">
        <button
          onClick={() => toggleSection(sectionKey)}
          className="w-full flex items-center justify-between text-left"
        >
          <h3 className="text-lg font-semibold">{title}</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">
              {filteredEntries.length} variables
            </span>
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
              renderEnvInput(key, info, invalidVars.includes(key))
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-secondary">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-brand-purple border-t-transparent mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading configuration...</p>
        </div>
      </div>
    );
  }

  if (!envData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-secondary p-4">
        <div className="card max-w-md w-full">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <h3 className="font-semibold mb-2">Connection Error</h3>
              <p className="text-sm text-text-secondary mb-4">
                Unable to load environment configuration. Please ensure the
                server is running.
              </p>
              <button
                onClick={() => loadData()}
                className="btn btn-secondary btn-sm"
              >
                Retry Connection
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const allSchema = {
    ...envData.schema.infrastructure,
    ...envData.schema.application,
  };
  const invalidVars = envData.invalidVars || [];
  const hasInvalidVars = invalidVars.length > 0;

  return (
    <div className="min-h-screen bg-bg-secondary overflow-auto">
      <div className="mx-auto px-6 py-8 max-w-[700px]">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-xl gradient-purple flex items-center justify-center mx-auto mb-4">
            <Settings className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Environment Configuration</h1>
          <p className="text-text-secondary">
            Configure your environment variables to get started
          </p>
        </div>

        {/* Status Banner */}
        {hasInvalidVars ? (
          <div className="bg-error-bg border border-error-border rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-error-text mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-error-text mb-2">
                  Configuration Issues Detected
                </p>
                <p className="text-sm text-text-secondary mb-2">
                  The following environment variables have issues and need to be
                  fixed:
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
        ) : (
          <div className="bg-success-bg border border-success-border rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-success-text mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-success-text">
                  All Required Configuration Complete
                </p>
                <p className="text-sm text-text-secondary">
                  Your environment is properly configured.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        {message && (
          <div
            className={`p-4 rounded-lg mb-6 ${
              message.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Invalid Variables Section - Always at top when there are issues */}
        {hasInvalidVars && (
          <div className="mb-6">
            <div className="card border-2 border-error-border">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-error-text" />
                <h3 className="text-lg font-semibold text-error-text">
                  Variables Requiring Attention
                </h3>
              </div>
              <div className="space-y-3">
                {invalidVars.map((key) => {
                  const schema = allSchema[key];
                  if (!schema) return null;
                  return renderEnvInput(key, schema, true);
                })}
              </div>
            </div>
          </div>
        )}

        {/* Application Configuration */}
        {renderSection(
          "Application Configuration",
          "application",
          envData.schema.application,
          invalidVars
        )}

        {/* Infrastructure Configuration */}
        {renderSection(
          "Infrastructure Configuration",
          "infrastructure",
          envData.schema.infrastructure,
          invalidVars
        )}

        {/* Action Buttons */}
        <div className="flex gap-4 mt-6">
          <button
            onClick={handleSave}
            disabled={saving || polling}
            className="btn btn-primary"
          >
            {saving
              ? "Saving..."
              : polling
              ? `Validating... (${pollAttempt}/10)`
              : "Save Configuration"}
          </button>
        </div>

        {/* Configured Variables Summary */}
        {envData.configured.length > 0 && !hasInvalidVars && (
          <div className="card mt-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-brand-success mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium mb-2">
                  Configured Variables ({envData.configured.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {envData.configured.map((key: string) => (
                    <code
                      key={key}
                      className="text-xs bg-success-bg border border-success-border text-success-text px-2 py-0.5 rounded"
                    >
                      {key}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
