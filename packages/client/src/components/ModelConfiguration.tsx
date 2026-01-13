import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EnvConfigForm } from './EnvConfigForm';
import { api } from '../lib/api';

interface SchemaInfo {
  default?: string;
  required: boolean;
  type: string;
  description?: string;
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

export function ModelConfiguration() {
  const [envData, setEnvData] = useState<EnvData | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const configRes = await api.get('/config/env');

      if (configRes.data.success && configRes.data.data) {
        const data = configRes.data.data;
        setEnvData(data);
        setEditedValues(data.values || {});
      }
    } catch (err) {
      console.error('Failed to load configuration:', err);
      setMessage({
        type: 'error',
        text: 'Failed to load configuration. Please ensure the server is running.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleValueChange = (key: string, value: string | boolean) => {
    setEditedValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = async () => {
    if (!editedValues) return;

    setSaving(true);
    setMessage(null);

    try {
      const response = await api.put('/config/env', editedValues);
      setMessage({
        type: 'success',
        text: response.data?.message || 'Configuration saved successfully.',
      });

      // Reload data to get updated values
      await loadData();
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to save configuration',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-6 h-6 animate-spin text-brand-purple" />
      </div>
    );
  }

  if (!envData) {
    return (
      <div className="card">
        <div className="text-center py-8">
          <p className="text-text-secondary mb-4">Unable to load environment configuration.</p>
          <button onClick={() => loadData()} className="btn btn-secondary btn-sm">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Build sections from schema
  const applicationSection = {
    title: 'Application Configuration',
    key: 'application',
    schema: envData.schema.application,
    defaultExpanded: true,
  };

  const infrastructureSection = {
    title: 'Infrastructure Configuration',
    key: 'infrastructure',
    schema: envData.schema.infrastructure,
    defaultExpanded: false,
  };

  const sections = [applicationSection, infrastructureSection];

  return (
    <div>
      {/* Messages */}
      {message && (
        <div
          className={`p-4 rounded-lg mb-6 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <EnvConfigForm
        sections={sections}
        values={editedValues}
        onValueChange={handleValueChange}
        onSave={handleSave}
        isSaving={saving}
        invalidVars={envData.invalidVars || []}
        saveButtonText="Save Configuration"
      />
    </div>
  );
}
