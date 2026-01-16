import { useState, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { ServicePreset, EnvVariable, HeaderVariable } from './presets';
import { DataSourceConfig } from '../../lib/api';

interface ServiceConfigFormProps {
  preset: ServicePreset;
  existingSource?: DataSourceConfig | null;
  onBack: () => void;
  onSubmit: (config: {
    name: string;
    type: 'stdio' | 'sse' | 'streamable-http';
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
  existingSource,
  onBack,
  onSubmit,
  isLoading,
}: ServiceConfigFormProps) {
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [envVars, setEnvVars] = useState<Record<string, EnvVarState>>(() => {
    const initial: Record<string, EnvVarState> = {};
    preset.requiredEnv?.forEach((env) => {
      // Use existing value if available
      const existingValue = existingSource?.env?.[env.key] || '';
      initial[env.key] = { value: existingValue, showValue: false };
    });
    preset.optionalEnv?.forEach((env) => {
      const existingValue = existingSource?.env?.[env.key] || '';
      initial[env.key] = { value: existingValue, showValue: false };
    });
    return initial;
  });

  const [headers, setHeaders] = useState<Record<string, EnvVarState>>(() => {
    const initial: Record<string, EnvVarState> = {};
    preset.requiredHeaders?.forEach((header) => {
      // Use existing value if available, stripping "Bearer " prefix for display
      let existingValue = existingSource?.headers?.[header.key] || header.value;
      if (header.key === 'Authorization' && existingValue?.startsWith('Bearer ')) {
        existingValue = existingValue.substring(7); // Remove "Bearer " prefix for display
      }
      initial[header.key] = { value: existingValue, showValue: false };
    });
    preset.optionalHeaders?.forEach((header) => {
      let existingValue = existingSource?.headers?.[header.key] || header.value;
      if (header.key === 'Authorization' && existingValue?.startsWith('Bearer ')) {
        existingValue = existingValue.substring(7);
      }
      initial[header.key] = { value: existingValue, showValue: false };
    });
    return initial;
  });

  const [isDisabled, setIsDisabled] = useState(existingSource?.isDisabled || false);

  // Re-initialize when existingSource changes
  useEffect(() => {
    if (existingSource) {
      const newEnvVars: Record<string, EnvVarState> = {};
      preset.requiredEnv?.forEach((env) => {
        const existingValue = existingSource.env?.[env.key] || '';
        newEnvVars[env.key] = { value: existingValue, showValue: false };
      });
      preset.optionalEnv?.forEach((env) => {
        const existingValue = existingSource.env?.[env.key] || '';
        newEnvVars[env.key] = { value: existingValue, showValue: false };
      });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEnvVars(newEnvVars);

      const newHeaders: Record<string, EnvVarState> = {};
      preset.requiredHeaders?.forEach((header) => {
        let existingValue = existingSource.headers?.[header.key] || header.value;
        if (header.key === 'Authorization' && existingValue?.startsWith('Bearer ')) {
          existingValue = existingValue.substring(7);
        }
        newHeaders[header.key] = { value: existingValue, showValue: false };
      });
      preset.optionalHeaders?.forEach((header) => {
        let existingValue = existingSource.headers?.[header.key] || header.value;
        if (header.key === 'Authorization' && existingValue?.startsWith('Bearer ')) {
          existingValue = existingValue.substring(7);
        }
        newHeaders[header.key] = { value: existingValue, showValue: false };
      });
      setHeaders(newHeaders);

      setIsDisabled(existingSource.isDisabled || false);
    }
  }, [existingSource, preset]);

  const validateEnvVar = (envVar: EnvVariable, value: string): string | undefined => {
    if (!value.trim() && preset.requiredEnv?.includes(envVar)) {
      return `${envVar.label} is required`;
    }
    if (value && envVar.validation && !envVar.validation.test(value)) {
      return envVar.validationMessage || 'Invalid format';
    }
    return undefined;
  };

  const validateHeader = (header: HeaderVariable, value: string): string | undefined => {
    if (!value.trim() && header.editable) {
      return `${header.label} is required`;
    }
    return undefined;
  };

  const handleEnvVarChange = (key: string, value: string, envVar: EnvVariable) => {
    const error = validateEnvVar(envVar, value);
    setEnvVars((prev) => ({
      ...prev,
      [key]: { ...prev[key], value, error },
    }));
  };

  const handleHeaderChange = (key: string, value: string, header: HeaderVariable) => {
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
      const envState = envVars[envVar.key] || { value: '', showValue: false };
      const error = validateEnvVar(envVar, envState.value);
      if (error) {
        updatedEnvVars[envVar.key] = { ...envState, error };
        hasErrors = true;
      }
    });

    preset.requiredHeaders?.forEach((header) => {
      const headerState = headers[header.key] || {
        value: header.value || '',
        showValue: false,
      };
      const error = validateHeader(header, headerState.value);
      if (error) {
        updatedHeaders[header.key] = { ...headerState, error };
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
        if (key === 'Authorization' && !state.value.startsWith('Bearer ')) {
          headersObj[key] = `Bearer ${state.value.trim()}`;
        } else {
          headersObj[key] = state.value.trim();
        }
      }
    });

    // Submit configuration
    if (preset.id === 'custom') {
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
    <form onSubmit={handleSubmit} className="p-6 space-y-6 w-full">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-lg bg-brand-purple/10">
          <Icon className="w-6 h-6 text-brand-purple" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-text-primary">
            Configure {preset.displayName}
          </h3>
          <p className="text-sm text-text-tertiary mt-1">{preset.description}</p>
        </div>
      </div>

      {/* Setup Guide */}
      <div className="border border-border-secondary rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSetupGuide(!showSetupGuide)}
          className="w-full px-4 py-3 flex items-center justify-between bg-bg-secondary hover:bg-bg-active transition-colors"
        >
          <span className="font-medium text-text-primary">Setup Instructions</span>
          {showSetupGuide ? (
            <ChevronUp className="w-5 h-5 text-text-quaternary" />
          ) : (
            <ChevronDown className="w-5 h-5 text-text-quaternary" />
          )}
        </button>

        {showSetupGuide && (
          <div className="p-4 space-y-3 bg-bg-primary">
            <ol className="space-y-2 list-decimal list-inside text-sm text-text-secondary">
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
                  className="inline-flex items-center gap-1 text-sm text-brand-purple hover:underline"
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
                  className="inline-flex items-center gap-1 text-sm text-brand-purple hover:underline"
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
        <h4 className="font-medium text-text-primary">Required Configuration</h4>

        {/* Environment Variables */}
        {preset.requiredEnv &&
          preset.requiredEnv.map((envVar) => {
            const state = envVars[envVar.key] || {
              value: '',
              showValue: false,
            };
            return (
              <EnvVarInput
                key={envVar.key}
                envVar={envVar}
                state={state}
                onChange={(value) => handleEnvVarChange(envVar.key, value, envVar)}
                onToggleVisibility={() => toggleVisibility(envVar.key)}
                disabled={isLoading}
              />
            );
          })}

        {/* Headers */}
        {preset.requiredHeaders &&
          preset.requiredHeaders.map((header) => {
            const state = headers[header.key] || {
              value: header.value || '',
              showValue: false,
            };
            return (
              <HeaderInput
                key={header.key}
                header={header}
                state={state}
                onChange={(value) => handleHeaderChange(header.key, value, header)}
                onToggleVisibility={() => toggleHeaderVisibility(header.key)}
                disabled={isLoading}
              />
            );
          })}

        {/* Optional Environment Variables */}
        {preset.optionalEnv && preset.optionalEnv.length > 0 && (
          <>
            <h4 className="font-medium text-text-primary pt-2">Optional Configuration</h4>
            {preset.optionalEnv.map((envVar) => {
              const state = envVars[envVar.key] || {
                value: '',
                showValue: false,
              };
              return (
                <EnvVarInput
                  key={envVar.key}
                  envVar={envVar}
                  state={state}
                  onChange={(value) => handleEnvVarChange(envVar.key, value, envVar)}
                  onToggleVisibility={() => toggleVisibility(envVar.key)}
                  disabled={isLoading}
                />
              );
            })}
          </>
        )}

        {/* Optional Headers */}
        {preset.optionalHeaders && preset.optionalHeaders.length > 0 && (
          <>
            <h4 className="font-medium text-text-primary pt-2">Optional Headers</h4>
            {preset.optionalHeaders.map((header) => {
              const state = headers[header.key] || {
                value: header.value || '',
                showValue: false,
              };
              return (
                <HeaderInput
                  key={header.key}
                  header={header}
                  state={state}
                  onChange={(value) => handleHeaderChange(header.key, value, header)}
                  onToggleVisibility={() => toggleHeaderVisibility(header.key)}
                  disabled={isLoading}
                />
              );
            })}
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
            className="w-4 h-4 text-brand-purple border-border-primary rounded focus:ring-brand-purple"
          />
          <span className="text-sm text-text-secondary">
            Disable this server (prevent automatic connection)
          </span>
        </label>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-border-secondary">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="btn btn-secondary w-full sm:flex-1 sm:max-w-[200px]"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="btn btn-primary w-full sm:flex-1 sm:max-w-[200px]"
        >
          {isLoading ? 'Saving...' : existingSource ? 'Update Server' : 'Create Server'}
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

function EnvVarInput({ envVar, state, onChange, onToggleVisibility, disabled }: EnvVarInputProps) {
  const hasError = !!state.error;
  const hasValue = state.value.trim().length > 0;

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-text-secondary">{envVar.label}</label>

      <div className="relative">
        <input
          type={state.showValue ? 'text' : envVar.type}
          value={state.value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={envVar.placeholder}
          className={`input pr-10 ${
            hasError
              ? 'border-brand-error focus:ring-brand-error'
              : hasValue
                ? 'border-brand-success'
                : ''
          }`}
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {hasValue && !hasError && <CheckCircle2 className="w-4 h-4 text-brand-success" />}
          {envVar.type === 'password' && (
            <button
              type="button"
              onClick={onToggleVisibility}
              className="text-text-quaternary hover:text-text-secondary"
            >
              {state.showValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {state.error ? (
        <div className="flex items-center gap-1 text-sm text-brand-error">
          <AlertCircle className="w-3 h-3" />
          <span>{state.error}</span>
        </div>
      ) : (
        <p className="text-xs text-text-quaternary">{envVar.helpText}</p>
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

function HeaderInput({ header, state, onChange, onToggleVisibility, disabled }: HeaderInputProps) {
  const hasError = !!state.error;
  const hasValue = state.value.trim().length > 0;
  const isEditable = header.editable !== false;
  // Only use password type for Authorization header
  const isSensitive = header.key === 'Authorization';

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-text-secondary">{header.label}</label>

      <div className="relative">
        <input
          type={isSensitive && !state.showValue ? 'password' : 'text'}
          value={state.value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || !isEditable}
          placeholder={header.value || `Enter ${header.label}`}
          className={`input pr-10 ${
            hasError
              ? 'border-brand-error focus:ring-brand-error'
              : hasValue
                ? 'border-brand-success'
                : ''
          } ${!isEditable ? 'bg-bg-secondary cursor-not-allowed' : ''}`}
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {hasValue && !hasError && <CheckCircle2 className="w-4 h-4 text-brand-success" />}
          {isEditable && isSensitive && (
            <button
              type="button"
              onClick={onToggleVisibility}
              className="text-text-quaternary hover:text-text-secondary"
            >
              {state.showValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {state.error ? (
        <div className="flex items-center gap-1 text-sm text-brand-error">
          <AlertCircle className="w-3 h-3" />
          <span>{state.error}</span>
        </div>
      ) : (
        <p className="text-xs text-text-quaternary">{header.helpText}</p>
      )}
    </div>
  );
}
