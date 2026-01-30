import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useCreateDataSource, useUpdateDataSource } from '../../hooks/useDataSources';
import { DataSourceConfig } from '../../lib/api';
import { AdvancedConfigForm } from './AdvancedConfigForm';
import { ServiceSelector } from './ServiceSelector';
import { ServiceConfigForm } from './ServiceConfigForm';
import { ServicePreset, getPresetById, CUSTOM_PRESET } from './presets';

interface MCPServerFormProps {
  isOpen: boolean;
  onClose: () => void;
  server?: DataSourceConfig | null;
}

type FormStep = 'select' | 'configure' | 'advanced';

export function MCPServerForm({ isOpen, onClose, server }: MCPServerFormProps) {
  const createMutation = useCreateDataSource();
  const updateMutation = useUpdateDataSource();

  const [step, setStep] = useState<FormStep>('select');
  const [selectedPreset, setSelectedPreset] = useState<ServicePreset | null>(null);

  // Initialize form when server prop changes
  useEffect(() => {
    if (server) {
      // Editing existing server - skip to configure step with preset
      const preset = getPresetById(server.name);
      if (preset) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedPreset(preset);
        setStep('configure');
      } else {
        // Custom server
        setSelectedPreset(CUSTOM_PRESET);
        setStep('advanced');
      }
    } else {
      // Creating new server - start at selection
      setStep('select');
      setSelectedPreset(null);
    }
  }, [server, isOpen]);

  const handleSelectService = (preset: ServicePreset) => {
    setSelectedPreset(preset);
    if (preset.id === 'custom') {
      setStep('advanced');
    } else {
      setStep('configure');
    }
  };

  const handleBack = () => {
    if (server) {
      // If editing, go back to closed state
      onClose();
    } else {
      // If creating, go back to selection
      setStep('select');
      setSelectedPreset(null);
    }
  };

  const handleSubmit = async (
    config: Omit<DataSourceConfig, '_id' | 'createdAt' | 'updatedAt'>,
  ) => {
    try {
      if (server) {
        await updateMutation.mutateAsync({
          name: server.name,
          config,
        });
      } else {
        await createMutation.mutateAsync(config);
      }
      onClose();
    } catch (error) {
      console.error('Failed to save data source:', error);
    }
  };

  if (!isOpen) return null;

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-bg-primary rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-border-secondary">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border-secondary">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">
              {server ? 'Edit Data Source' : 'Add Data Source'}
            </h2>
            {step === 'configure' && selectedPreset && (
              <p className="text-sm text-text-tertiary mt-1">
                Configuring {selectedPreset.displayName}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-text-quaternary hover:text-text-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1">
          {step === 'select' && <ServiceSelector onSelect={handleSelectService} />}

          {step === 'configure' && selectedPreset && selectedPreset.id !== 'custom' && (
            <ServiceConfigForm
              preset={selectedPreset}
              onBack={handleBack}
              onSubmit={handleSubmit}
              isLoading={isLoading}
            />
          )}

          {step === 'advanced' && (
            <AdvancedConfigForm
              server={server}
              onBack={handleBack}
              onSubmit={handleSubmit}
              isLoading={isLoading}
            />
          )}
        </div>
      </div>
    </div>
  );
}
