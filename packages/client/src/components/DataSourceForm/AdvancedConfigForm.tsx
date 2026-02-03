import { Eye, EyeOff, Lock, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DataSourceConfig } from '../../lib/api';

interface PresetData {
  id: string;
  displayName: string;
  connection: {
    type: 'stdio' | 'sse' | 'streamable-http';
    command?: string;
    args?: string[];
    url?: string;
    auth?: {
      type: 'oauth' | 'api-key';
      provider?: string;
    };
  };
  variables?: Array<{
    key: string;
    label: string;
    type: string;
    required: boolean;
    helpText?: string;
  }>;
}

interface AdvancedConfigFormProps {
  server?: DataSourceConfig | null;
  preset?: PresetData | null;
  onBack: () => void;
  onSubmit: (config: Omit<DataSourceConfig, '_id' | 'createdAt' | 'updatedAt'>) => void;
  isLoading: boolean;
}

interface FormData {
  name: string;
  type: 'stdio' | 'sse' | 'streamable-http';
  command: string;
  args: string;
  env: Array<{ key: string; value: string; showValue: boolean }>;
  url: string;
  headers: Array<{ key: string; value: string; showValue: boolean }>;
  authType: 'none' | 'api-key' | 'oauth';
  isDisabled: boolean;
}

export function AdvancedConfigForm({
  server,
  preset,
  onBack,
  onSubmit,
  isLoading,
}: AdvancedConfigFormProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    type: 'streamable-http',
    command: '',
    args: '',
    env: [],
    url: '',
    headers: [],
    authType: 'none',
    isDisabled: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  // Check if this is a preset-based source - either from preset prop or from server.presetId
  const isPreset = (!!preset && preset.id !== 'custom') || !!server?.presetId;

  // Initialize form when server or preset changes
  useEffect(() => {
    if (server) {
      // Editing existing server
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        name: server.name,
        type: server.type,
        command: server.command || '',
        args: server.args?.join(' ') || '',
        env: server.env
          ? Object.entries(server.env).map(([key, value]) => ({
              key,
              value,
              showValue: false,
            }))
          : [],
        url: server.url || '',
        headers: server.headers
          ? Object.entries(server.headers).map(([key, value]) => ({
              key,
              value,
              showValue: false,
            }))
          : [],
        authType: server.authType || 'none',
        isDisabled: server.isDisabled || false,
      });
    } else if (preset && preset.id !== 'custom') {
      // New server from preset
      const conn = preset.connection;
      setFormData({
        name: preset.id,
        type: conn.type,
        command: conn.command || '',
        args: conn.args?.join(' ') || '',
        // Initialize empty env vars/headers for preset variables
        env:
          preset.variables?.map((v) => ({
            key: v.key,
            value: '',
            showValue: false,
          })) || [],
        url: conn.url || '',
        headers: [],
        authType: conn.auth?.type || 'none',
        isDisabled: false,
      });
    } else {
      // New custom server
      setFormData({
        name: '',
        type: 'streamable-http',
        command: '',
        args: '',
        env: [],
        url: '',
        headers: [],
        authType: 'none',
        isDisabled: false,
      });
    }
    setErrors({});
  }, [server, preset]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (formData.type === 'stdio') {
      if (!formData.command.trim()) {
        newErrors.command = 'Command is required for stdio servers';
      }
    } else if (formData.type === 'sse' || formData.type === 'streamable-http') {
      if (!formData.url.trim()) {
        newErrors.url = `URL is required for ${
          formData.type === 'sse' ? 'SSE' : 'Streamable HTTP'
        } servers`;
      } else {
        try {
          new URL(formData.url);
        } catch {
          newErrors.url = 'Invalid URL format';
        }
      }

      // OAuth validation removed - handled automatically by SDK
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    const config: Omit<DataSourceConfig, '_id' | 'createdAt' | 'updatedAt'> = {
      name: formData.name.trim(),
      type: formData.type,
      isDisabled: formData.isDisabled,
    };

    if (formData.type === 'stdio') {
      config.command = formData.command.trim();
      if (formData.args.trim()) {
        config.args = formData.args
          .split(' ')
          .map((arg) => arg.trim())
          .filter((arg) => arg);
      }
      if (formData.env.length > 0) {
        config.env = Object.fromEntries(
          formData.env.filter((e) => e.key && e.value).map((e) => [e.key, e.value]),
        );
      }
    } else if (formData.type === 'sse' || formData.type === 'streamable-http') {
      config.url = formData.url.trim();

      // Add authType
      config.authType = formData.authType;

      // Add headers if not using OAuth
      if (formData.authType !== 'oauth' && formData.headers.length > 0) {
        // Only add headers if not using OAuth
        config.headers = Object.fromEntries(
          formData.headers.filter((h) => h.key && h.value).map((h) => [h.key, h.value]),
        );
      }
    }

    onSubmit(config);
  };

  const addEnvVar = () => {
    setFormData({
      ...formData,
      env: [...formData.env, { key: '', value: '', showValue: false }],
    });
  };

  const removeEnvVar = (index: number) => {
    setFormData({
      ...formData,
      env: formData.env.filter((_, i) => i !== index),
    });
  };

  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    const newEnv = [...formData.env];
    newEnv[index][field] = value;
    setFormData({ ...formData, env: newEnv });
  };

  const toggleEnvVisibility = (index: number) => {
    const newEnv = [...formData.env];
    newEnv[index].showValue = !newEnv[index].showValue;
    setFormData({ ...formData, env: newEnv });
  };

  const addHeader = () => {
    setFormData({
      ...formData,
      headers: [...formData.headers, { key: '', value: '', showValue: false }],
    });
  };

  const removeHeader = (index: number) => {
    setFormData({
      ...formData,
      headers: formData.headers.filter((_, i) => i !== index),
    });
  };

  const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const newHeaders = [...formData.headers];
    newHeaders[index][field] = value;
    setFormData({ ...formData, headers: newHeaders });
  };

  const toggleHeaderVisibility = (index: number) => {
    const newHeaders = [...formData.headers];
    newHeaders[index].showValue = !newHeaders[index].showValue;
    setFormData({ ...formData, headers: newHeaders });
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 text-left space-y-4">
      {/* Preset Badge */}
      {isPreset && (
        <div className="bg-brand-lime/20 border-2 border-brand-lime/50 rounded-lg p-4 flex items-start gap-3">
          <Lock className="w-5 h-5 text-brand-lime flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-base font-bold text-brand-lime mb-1">
              {preset ? `${preset.displayName} Preset Configuration` : 'Preset-Based Data Source'}
            </h4>
            <p className="text-sm text-text-secondary leading-relaxed">
              This is a pre-configured data source. Technical settings are locked to ensure proper
              functionality. <span className="font-semibold">You can only update credentials</span>{' '}
              (environment variables or API keys).
            </p>
          </div>
        </div>
      )}

      {/* Name */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-text-secondary mb-1">
          {isPreset && <Lock className="w-3.5 h-3.5 text-text-quaternary" />}
          Server Name *
        </label>
        <div className="relative">
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            disabled={isLoading || !!server || isPreset}
            className={`input ${isPreset ? 'bg-bg-secondary/50 cursor-not-allowed' : ''}`}
            placeholder="my-mcp-server"
          />
          {isPreset && (
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-quaternary pointer-events-none" />
          )}
        </div>
        {errors.name && <p className="mt-1 text-sm text-brand-error">{errors.name}</p>}
        {(server || isPreset) && (
          <p className="mt-1 text-xs text-text-quaternary flex items-center gap-1">
            {isPreset && <Lock className="w-3 h-3" />}
            {isPreset
              ? 'Server name is set from preset and cannot be changed'
              : 'Server name cannot be changed'}
          </p>
        )}
      </div>

      {/* Type */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-text-secondary mb-1">
          {isPreset && <Lock className="w-3.5 h-3.5 text-text-quaternary" />}
          Server Type *
        </label>
        <div className="relative">
          <select
            value={formData.type}
            onChange={(e) =>
              setFormData({
                ...formData,
                type: e.target.value as 'stdio' | 'sse' | 'streamable-http',
              })
            }
            disabled={isLoading || isPreset}
            className={`input ${isPreset ? 'bg-bg-secondary/50 cursor-not-allowed' : ''}`}
          >
            <option value="stdio">STDIO (Command-based)</option>
            <option value="sse">SSE (Server-Sent Events)</option>
            <option value="streamable-http">Streamable HTTP</option>
          </select>
          {isPreset && (
            <Lock className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-text-quaternary pointer-events-none" />
          )}
        </div>
        {isPreset && (
          <p className="mt-1 text-xs text-text-quaternary flex items-center gap-1">
            <Lock className="w-3 h-3" />
            Connection type is set from preset and cannot be changed
          </p>
        )}
      </div>

      {/* STDIO Fields */}
      {formData.type === 'stdio' && (
        <>
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-text-secondary mb-1">
              {isPreset && <Lock className="w-3.5 h-3.5 text-text-quaternary" />}
              Command *
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.command}
                onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                disabled={isLoading || isPreset}
                className={`input ${isPreset ? 'bg-bg-secondary/50 cursor-not-allowed' : ''}`}
                placeholder="node"
              />
              {isPreset && (
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-quaternary pointer-events-none" />
              )}
            </div>
            {errors.command && <p className="mt-1 text-sm text-brand-error">{errors.command}</p>}
            {isPreset && (
              <p className="mt-1 text-xs text-text-quaternary flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Command is set from preset and cannot be changed
              </p>
            )}
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-text-secondary mb-1">
              {isPreset && <Lock className="w-3.5 h-3.5 text-text-quaternary" />}
              Arguments
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.args}
                onChange={(e) => setFormData({ ...formData, args: e.target.value })}
                disabled={isLoading || isPreset}
                className={`input ${isPreset ? 'bg-bg-secondary/50 cursor-not-allowed' : ''}`}
                placeholder="path/to/server.js --option value"
              />
              {isPreset && (
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-quaternary pointer-events-none" />
              )}
            </div>
            <p className="mt-1 text-xs text-text-quaternary flex items-center gap-1">
              {isPreset && <Lock className="w-3 h-3" />}
              {isPreset
                ? 'Arguments are set from preset and cannot be changed'
                : 'Space-separated arguments'}
            </p>
          </div>

          {/* Environment Variables */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                Environment Variables
                {isPreset && formData.env.length > 0 && (
                  <span className="text-xs text-text-quaternary font-normal flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    Keys locked
                  </span>
                )}
              </label>
              {!isPreset && (
                <button
                  type="button"
                  onClick={addEnvVar}
                  disabled={isLoading}
                  className="text-sm text-brand-lime hover:text-brand-lime/80 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Variable
                </button>
              )}
            </div>
            {formData.env.map((env, index) => {
              const presetVar = preset?.variables?.find((v) => v.key === env.key);
              return (
                <div key={index} className="mb-3">
                  <div className="flex gap-2 mb-1">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={env.key}
                        onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                        disabled={isLoading || isPreset}
                        className={`input ${
                          isPreset ? 'bg-bg-secondary/50 cursor-not-allowed' : ''
                        }`}
                        placeholder="KEY"
                      />
                      {isPreset && (
                        <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-quaternary pointer-events-none" />
                      )}
                    </div>
                    <div className="flex-1 relative">
                      <input
                        type={env.showValue ? 'text' : 'password'}
                        value={env.value}
                        onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                        disabled={isLoading}
                        className="input w-full pr-10"
                        placeholder="value"
                      />
                      <button
                        type="button"
                        onClick={() => toggleEnvVisibility(index)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-quaternary hover:text-text-secondary"
                      >
                        {env.showValue ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeEnvVar(index)}
                      disabled={isLoading || isPreset}
                      className="text-brand-error hover:text-brand-error/80 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {presetVar && (
                    <div className="flex items-start gap-1.5 ml-1">
                      {presetVar.required ? (
                        <span className="text-xs text-red-500 font-medium mt-0.5">Required</span>
                      ) : (
                        <span className="text-xs text-text-tertiary font-medium mt-0.5">
                          Optional
                        </span>
                      )}
                      {presetVar.helpText && (
                        <p className="text-xs text-text-secondary leading-relaxed flex-1">
                          {presetVar.helpText}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* SSE and Streamable HTTP Fields */}
      {(formData.type === 'sse' || formData.type === 'streamable-http') && (
        <>
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-text-secondary mb-1">
              {isPreset && <Lock className="w-3.5 h-3.5 text-text-quaternary" />}
              URL *
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                disabled={isLoading || isPreset}
                className={`input ${isPreset ? 'bg-bg-secondary/50 cursor-not-allowed' : ''}`}
                placeholder="https://example.com/mcp"
              />
              {isPreset && (
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-quaternary pointer-events-none" />
              )}
            </div>
            {errors.url && <p className="mt-1 text-sm text-brand-error">{errors.url}</p>}
            {isPreset && (
              <p className="mt-1 text-xs text-text-quaternary flex items-center gap-1">
                <Lock className="w-3 h-3" />
                URL is set from preset and cannot be changed
              </p>
            )}
          </div>

          {/* Authentication (only for network-based servers) */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-text-secondary mb-1">
              {isPreset && preset?.connection.auth && (
                <Lock className="w-3.5 h-3.5 text-text-quaternary" />
              )}
              Authentication
            </label>
            <div className="relative">
              <select
                value={formData.authType}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    authType: e.target.value as 'none' | 'api-key' | 'oauth',
                  })
                }
                disabled={isLoading || (isPreset && !!preset?.connection.auth)}
                className={`input ${
                  isPreset && preset?.connection.auth ? 'bg-bg-secondary/50 cursor-not-allowed' : ''
                }`}
              >
                <option value="none">None</option>
                <option value="api-key">API Key (via headers)</option>
                <option value="oauth">OAuth 2.1</option>
              </select>
              {isPreset && preset?.connection.auth && (
                <Lock className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-text-quaternary pointer-events-none" />
              )}
            </div>
            <p className="mt-1 text-xs text-text-quaternary flex items-center gap-1">
              {isPreset && preset?.connection.auth && <Lock className="w-3 h-3" />}
              {isPreset &&
                preset?.connection.auth &&
                'Authentication type is set from preset and cannot be changed'}
              {(!isPreset || !preset?.connection.auth) &&
                formData.authType === 'none' &&
                'No authentication required'}
              {(!isPreset || !preset?.connection.auth) &&
                formData.authType === 'api-key' &&
                'Add API key as a custom header below'}
              {(!isPreset || !preset?.connection.auth) &&
                formData.authType === 'oauth' &&
                'OAuth flow will be triggered after server creation'}
            </p>
          </div>

          {/* Headers (only show if not using OAuth, since OAuth uses Bearer token) */}
          {formData.authType !== 'oauth' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-text-secondary">Headers</label>
                <button
                  type="button"
                  onClick={addHeader}
                  disabled={isLoading}
                  className="text-sm text-brand-lime hover:text-brand-lime/80 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Header
                </button>
              </div>
              {formData.headers.map((header, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={header.key}
                    onChange={(e) => updateHeader(index, 'key', e.target.value)}
                    disabled={isLoading}
                    className="input flex-1"
                    placeholder="Header-Name"
                  />
                  <div className="flex-1 relative">
                    <input
                      type={header.showValue ? 'text' : 'password'}
                      value={header.value}
                      onChange={(e) => updateHeader(index, 'value', e.target.value)}
                      disabled={isLoading}
                      className="input w-full pr-10"
                      placeholder="value"
                    />
                    <button
                      type="button"
                      onClick={() => toggleHeaderVisibility(index)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-quaternary hover:text-text-secondary"
                    >
                      {header.showValue ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeHeader(index)}
                    disabled={isLoading}
                    className="text-brand-error hover:text-brand-error/80"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* OAuth Configuration - Simplified */}
          {formData.authType === 'oauth' && (
            <div className="border border-brand-lime/30 rounded-lg p-4 bg-brand-lime/10">
              <div className="flex items-start gap-3">
                <div className="text-brand-lime text-xl">🔐</div>
                <div>
                  <h4 className="text-sm font-semibold text-text-primary mb-1">
                    OAuth 2.1 Authentication
                  </h4>
                  <p className="text-sm text-text-secondary mb-2">
                    OAuth will be configured automatically when you connect. The server will
                    discover OAuth endpoints and handle authentication for you.
                  </p>
                  <p className="text-xs text-text-quaternary">
                    After creating this server, click "Connect" to start the OAuth flow. You'll be
                    redirected to authorize access.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Disabled Toggle */}
      <div>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={formData.isDisabled}
            onChange={(e) => setFormData({ ...formData, isDisabled: e.target.checked })}
            disabled={isLoading}
            className="w-4 h-4 text-brand-lime border-border-primary rounded focus:ring-brand-lime"
          />
          <span className="ml-2 text-sm text-text-secondary">
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
          {isLoading ? 'Saving...' : server ? 'Update Server' : 'Create Server'}
        </button>
      </div>
    </form>
  );
}
