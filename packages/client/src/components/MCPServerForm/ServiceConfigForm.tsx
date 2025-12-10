import { useState } from "react";
import {
  Eye,
  EyeOff,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { ServicePreset, EnvVariable, HeaderVariable } from "./presets";

interface ServiceConfigFormProps {
  preset: ServicePreset;
  onBack: () => void;
  onSubmit: (config: {
    name: string;
    type: "stdio" | "sse" | "streamable-http";
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    isDisabled: boolean;
  }) => void;
  isLoading: boolean;
}

interface EnvVarState {
  value: string;
  showValue: boolean;
  error?: string;
}

export function ServiceConfigForm({
  preset,
  onBack,
  onSubmit,
  isLoading,
}: ServiceConfigFormProps) {
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [envVars, setEnvVars] = useState<Record<string, EnvVarState>>(() => {
    const initial: Record<string, EnvVarState> = {};
    preset.requiredEnv?.forEach((env) => {
      initial[env.key] = { value: "", showValue: false };
    });
    preset.optionalEnv?.forEach((env) => {
      initial[env.key] = { value: "", showValue: false };
    });
    return initial;
  });

  const [headers, setHeaders] = useState<Record<string, EnvVarState>>(() => {
    const initial: Record<string, EnvVarState> = {};
    preset.requiredHeaders?.forEach((header) => {
      initial[header.key] = { value: header.value, showValue: false };
    });
    preset.optionalHeaders?.forEach((header) => {
      initial[header.key] = { value: header.value, showValue: false };
    });
    return initial;
  });

  const [isDisabled, setIsDisabled] = useState(false);

  const validateEnvVar = (
    envVar: EnvVariable,
    value: string
  ): string | undefined => {
    if (!value.trim() && preset.requiredEnv?.includes(envVar)) {
      return `${envVar.label} is required`;
    }
    if (value && envVar.validation && !envVar.validation.test(value)) {
      return envVar.validationMessage || "Invalid format";
    }
    return undefined;
  };

  const validateHeader = (
    header: HeaderVariable,
    value: string
  ): string | undefined => {
    if (!value.trim() && header.editable) {
      return `${header.label} is required`;
    }
    return undefined;
  };

  const handleEnvVarChange = (
    key: string,
    value: string,
    envVar: EnvVariable
  ) => {
    const error = validateEnvVar(envVar, value);
    setEnvVars((prev) => ({
      ...prev,
      [key]: { ...prev[key], value, error },
    }));
  };

  const handleHeaderChange = (
    key: string,
    value: string,
    header: HeaderVariable
  ) => {
    const error = validateHeader(header, value);
    setHeaders((prev) => ({
      ...prev,
      [key]: { ...prev[key], value, error },
    }));
  };

  const toggleVisibility = (key: string) => {
    setEnvVars((prev) => ({
      ...prev,
      [key]: { ...prev[key], showValue: !prev[key].showValue },
    }));
  };

  const toggleHeaderVisibility = (key: string) => {
    setHeaders((prev) => ({
      ...prev,
      [key]: { ...prev[key], showValue: !prev[key].showValue },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all required fields
    let hasErrors = false;
    const updatedEnvVars = { ...envVars };
    const updatedHeaders = { ...headers };

    preset.requiredEnv?.forEach((envVar) => {
      const error = validateEnvVar(envVar, envVars[envVar.key].value);
      if (error) {
        updatedEnvVars[envVar.key] = { ...updatedEnvVars[envVar.key], error };
        hasErrors = true;
      }
    });

    preset.requiredHeaders?.forEach((header) => {
      const error = validateHeader(header, headers[header.key].value);
      if (error) {
        updatedHeaders[header.key] = { ...updatedHeaders[header.key], error };
        hasErrors = true;
      }
    });

    if (hasErrors) {
      setEnvVars(updatedEnvVars);
      setHeaders(updatedHeaders);
      return;
    }

    // Build env object
    const env: Record<string, string> = {};
    Object.entries(envVars).forEach(([key, state]) => {
      if (state.value.trim()) {
        env[key] = state.value.trim();
      }
    });

    // Build headers object
    const headersObj: Record<string, string> = {};
    Object.entries(headers).forEach(([key, state]) => {
      if (state.value.trim()) {
        // Special handling for Authorization header - prefix with Bearer if it's a token
        if (key === "Authorization" && !state.value.startsWith("Bearer ")) {
          headersObj[key] = `Bearer ${state.value.trim()}`;
        } else {
          headersObj[key] = state.value.trim();
        }
      }
    });

    // Submit configuration
    if (preset.id === "custom") {
      // For custom servers, we'll need additional fields
      // This will be handled in the main form
      return;
    }

    onSubmit({
      name: preset.name,
      type: preset.type,
      command: preset.command,
      args: preset.args,
      url: preset.url,
      env: Object.keys(env).length > 0 ? env : undefined,
      headers: Object.keys(headersObj).length > 0 ? headersObj : undefined,
      isDisabled,
    });
  };

  const Icon = preset.icon;

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-lg bg-primary-100 dark:bg-primary-900/30">
          <Icon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Configure {preset.displayName}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {preset.description}
          </p>
        </div>
      </div>

      {/* Setup Guide */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSetupGuide(!showSetupGuide)}
          className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <span className="font-medium text-gray-900 dark:text-white">
            Setup Instructions
          </span>
          {showSetupGuide ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </button>

        {showSetupGuide && (
          <div className="p-4 space-y-3 bg-white dark:bg-gray-800">
            <ol className="space-y-2 list-decimal list-inside text-sm text-gray-700 dark:text-gray-300">
              {preset.setupSteps.map((step, index) => (
                <li key={index} className="pl-2">
                  {step}
                </li>
              ))}
            </ol>

            <div className="flex gap-2 pt-2">
              {preset.authGuide && (
                <a
                  href={preset.authGuide}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Get Credentials
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {preset.documentation && (
                <a
                  href={preset.documentation}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Documentation
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Environment Variables or Headers */}
      <div className="space-y-4">
        <h4 className="font-medium text-gray-900 dark:text-white">
          Required Configuration
        </h4>

        {/* Environment Variables */}
        {preset.requiredEnv &&
          preset.requiredEnv.map((envVar) => (
            <EnvVarInput
              key={envVar.key}
              envVar={envVar}
              state={envVars[envVar.key]}
              onChange={(value) =>
                handleEnvVarChange(envVar.key, value, envVar)
              }
              onToggleVisibility={() => toggleVisibility(envVar.key)}
              disabled={isLoading}
            />
          ))}

        {/* Headers */}
        {preset.requiredHeaders &&
          preset.requiredHeaders.map((header) => (
            <HeaderInput
              key={header.key}
              header={header}
              state={headers[header.key]}
              onChange={(value) =>
                handleHeaderChange(header.key, value, header)
              }
              onToggleVisibility={() => toggleHeaderVisibility(header.key)}
              disabled={isLoading}
            />
          ))}

        {/* Optional Environment Variables */}
        {preset.optionalEnv && preset.optionalEnv.length > 0 && (
          <>
            <h4 className="font-medium text-gray-900 dark:text-white pt-2">
              Optional Configuration
            </h4>
            {preset.optionalEnv.map((envVar) => (
              <EnvVarInput
                key={envVar.key}
                envVar={envVar}
                state={envVars[envVar.key]}
                onChange={(value) =>
                  handleEnvVarChange(envVar.key, value, envVar)
                }
                onToggleVisibility={() => toggleVisibility(envVar.key)}
                disabled={isLoading}
              />
            ))}
          </>
        )}

        {/* Optional Headers */}
        {preset.optionalHeaders && preset.optionalHeaders.length > 0 && (
          <>
            <h4 className="font-medium text-gray-900 dark:text-white pt-2">
              Optional Headers
            </h4>
            {preset.optionalHeaders.map((header) => (
              <HeaderInput
                key={header.key}
                header={header}
                state={headers[header.key]}
                onChange={(value) =>
                  handleHeaderChange(header.key, value, header)
                }
                onToggleVisibility={() => toggleHeaderVisibility(header.key)}
                disabled={isLoading}
              />
            ))}
          </>
        )}
      </div>

      {/* Disable Toggle */}
      <div className="pt-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isDisabled}
            onChange={(e) => setIsDisabled(e.target.checked)}
            disabled={isLoading}
            className="w-4 h-4 text-primary-600 dark:text-primary-500 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 dark:focus:ring-primary-400"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Disable this server (prevent automatic connection)
          </span>
        </label>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="btn btn-secondary"
        >
          Back
        </button>
        <button type="submit" disabled={isLoading} className="btn btn-primary">
          {isLoading ? "Saving..." : "Create Server"}
        </button>
      </div>
    </form>
  );
}

interface EnvVarInputProps {
  envVar: EnvVariable;
  state: EnvVarState;
  onChange: (value: string) => void;
  onToggleVisibility: () => void;
  disabled: boolean;
}

function EnvVarInput({
  envVar,
  state,
  onChange,
  onToggleVisibility,
  disabled,
}: EnvVarInputProps) {
  const hasError = !!state.error;
  const hasValue = state.value.trim().length > 0;

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {envVar.label}
      </label>

      <div className="relative">
        <input
          type={state.showValue ? "text" : envVar.type}
          value={state.value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={envVar.placeholder}
          className={`input pr-10 ${
            hasError
              ? "border-error-500 dark:border-error-400 focus:ring-error-500 dark:focus:ring-error-400"
              : hasValue
              ? "border-success-500 dark:border-success-400"
              : ""
          }`}
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {hasValue && !hasError && (
            <CheckCircle2 className="w-4 h-4 text-success-600 dark:text-success-400" />
          )}
          {envVar.type === "password" && (
            <button
              type="button"
              onClick={onToggleVisibility}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {state.showValue ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {state.error ? (
        <div className="flex items-center gap-1 text-sm text-error-600 dark:text-error-400">
          <AlertCircle className="w-3 h-3" />
          <span>{state.error}</span>
        </div>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {envVar.helpText}
        </p>
      )}
    </div>
  );
}

interface HeaderInputProps {
  header: HeaderVariable;
  state: EnvVarState;
  onChange: (value: string) => void;
  onToggleVisibility: () => void;
  disabled: boolean;
}

function HeaderInput({
  header,
  state,
  onChange,
  onToggleVisibility,
  disabled,
}: HeaderInputProps) {
  const hasError = !!state.error;
  const hasValue = state.value.trim().length > 0;
  const isEditable = header.editable !== false;
  // Only use password type for Authorization header
  const isSensitive = header.key === "Authorization";

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {header.label}
      </label>

      <div className="relative">
        <input
          type={isSensitive && !state.showValue ? "password" : "text"}
          value={state.value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || !isEditable}
          placeholder={header.value || `Enter ${header.label}`}
          className={`input pr-10 ${
            hasError
              ? "border-error-500 dark:border-error-400 focus:ring-error-500 dark:focus:ring-error-400"
              : hasValue
              ? "border-success-500 dark:border-success-400"
              : ""
          } ${
            !isEditable ? "bg-gray-50 dark:bg-gray-900 cursor-not-allowed" : ""
          }`}
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {hasValue && !hasError && (
            <CheckCircle2 className="w-4 h-4 text-success-600 dark:text-success-400" />
          )}
          {isEditable && isSensitive && (
            <button
              type="button"
              onClick={onToggleVisibility}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {state.showValue ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {state.error ? (
        <div className="flex items-center gap-1 text-sm text-error-600 dark:text-error-400">
          <AlertCircle className="w-3 h-3" />
          <span>{state.error}</span>
        </div>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {header.helpText}
        </p>
      )}
    </div>
  );
}
