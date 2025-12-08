import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  useCreateMCPServer,
  useUpdateMCPServer,
} from "../../hooks/useMCPServers";
import { MCPServerConfig } from "../../lib/api";
import { AdvancedConfigForm } from "./AdvancedConfigForm";
import { ServiceSelector } from "./ServiceSelector";
import { ServiceConfigForm } from "./ServiceConfigForm";
import { ServicePreset, getPresetById, CUSTOM_PRESET } from "./presets";

interface MCPServerFormProps {
  isOpen: boolean;
  onClose: () => void;
  server?: MCPServerConfig | null;
}

type FormStep = "select" | "configure" | "advanced";

export function MCPServerForm({ isOpen, onClose, server }: MCPServerFormProps) {
  const createMutation = useCreateMCPServer();
  const updateMutation = useUpdateMCPServer();

  const [step, setStep] = useState<FormStep>("select");
  const [selectedPreset, setSelectedPreset] = useState<ServicePreset | null>(
    null
  );

  // Initialize form when server prop changes
  useEffect(() => {
    if (server) {
      // Editing existing server - skip to configure step with preset
      const preset = getPresetById(server.name);
      if (preset) {
        setSelectedPreset(preset);
        setStep("configure");
      } else {
        // Custom server
        setSelectedPreset(CUSTOM_PRESET);
        setStep("advanced");
      }
    } else {
      // Creating new server - start at selection
      setStep("select");
      setSelectedPreset(null);
    }
  }, [server, isOpen]);

  const handleSelectService = (preset: ServicePreset) => {
    setSelectedPreset(preset);
    if (preset.id === "custom") {
      setStep("advanced");
    } else {
      setStep("configure");
    }
  };

  const handleBack = () => {
    if (server) {
      // If editing, go back to closed state
      onClose();
    } else {
      // If creating, go back to selection
      setStep("select");
      setSelectedPreset(null);
    }
  };

  const handleSubmit = async (
    config: Omit<MCPServerConfig, "_id" | "createdAt" | "updatedAt">
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
      console.error("Failed to save MCP server:", error);
    }
  };

  if (!isOpen) return null;

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {server ? "Edit MCP Server" : "Add MCP Server"}
            </h2>
            {step === "configure" && selectedPreset && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Configuring {selectedPreset.displayName}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1">
          {step === "select" && (
            <ServiceSelector onSelect={handleSelectService} />
          )}

          {step === "configure" &&
            selectedPreset &&
            selectedPreset.id !== "custom" && (
              <ServiceConfigForm
                preset={selectedPreset}
                onBack={handleBack}
                onSubmit={handleSubmit}
                isLoading={isLoading}
              />
            )}

          {step === "advanced" && (
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
