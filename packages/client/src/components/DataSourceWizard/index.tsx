import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { ServiceSelector } from "../MCPServerForm/ServiceSelector";
import { ServiceConfigForm } from "../MCPServerForm/ServiceConfigForm";
import { AdvancedConfigForm } from "../MCPServerForm/AdvancedConfigForm";
import {
  ServicePreset,
  getPresetById,
  CUSTOM_PRESET,
} from "../MCPServerForm/presets";
import { IndexingStep } from "./IndexingStep";
import { ReviewStep } from "./ReviewStep";
import { MCPServerConfig } from "../../lib/api";
import {
  useCreateMCPServer,
  useUpdateMCPServer,
  useConnectMCPServer,
} from "../../hooks/useMCPServers";
import {
  useGenerateConfig,
  useSaveConfig,
  useSyncConfig,
} from "../../hooks/useIndexingConfigs";
import toast from "react-hot-toast";

interface DataSourceWizardProps {
  isOpen: boolean;
  onClose: () => void;
  existingSource?: MCPServerConfig | null;
}

type WizardStep = "select" | "configure" | "indexing" | "review";

export function DataSourceWizard({
  isOpen,
  onClose,
  existingSource,
}: DataSourceWizardProps) {
  const createMutation = useCreateMCPServer();
  const updateMutation = useUpdateMCPServer();
  const connectMutation = useConnectMCPServer();
  const generateConfig = useGenerateConfig();
  const saveConfig = useSaveConfig();
  const syncConfig = useSyncConfig();

  const [step, setStep] = useState<WizardStep>("select");
  const [selectedPreset, setSelectedPreset] = useState<ServicePreset | null>(
    null
  );
  const [serverConfig, setServerConfig] = useState<Omit<
    MCPServerConfig,
    "_id" | "createdAt" | "updatedAt"
  > | null>(null);
  const [isCustomServerCreated, setIsCustomServerCreated] = useState(false);

  useEffect(() => {
    if (existingSource) {
      const preset = getPresetById(existingSource.name);
      setSelectedPreset(preset || CUSTOM_PRESET);
      setStep("configure");
    } else {
      setStep("select");
      setSelectedPreset(null);
      setServerConfig(null);
    }
  }, [existingSource, isOpen]);

  const handleSelectService = (preset: ServicePreset) => {
    setSelectedPreset(preset);
    if (preset.id === "custom") {
      setStep("configure");
    } else {
      setStep("configure");
    }
  };

  const handleBack = () => {
    if (step === "configure") {
      if (existingSource) {
        onClose();
      } else {
        setStep("select");
        setSelectedPreset(null);
      }
    } else if (step === "indexing") {
      setStep("configure");
    } else if (step === "review") {
      setStep(selectedPreset?.id === "custom" ? "indexing" : "configure");
    }
  };

  const handleConfigureSubmit = async (
    config: Omit<MCPServerConfig, "_id" | "createdAt" | "updatedAt">
  ) => {
    setServerConfig(config);

    // For custom servers, create and connect server first, then generate indexing config
    if (selectedPreset?.id === "custom") {
      try {
        // Check if we're editing an existing server
        if (existingSource) {
          // Update existing server
          toast.loading("Updating MCP server...", { id: "update-server" });
          await updateMutation.mutateAsync({
            name: existingSource.name,
            config,
          });
          toast.success("MCP server updated", { id: "update-server" });

          // Reconnect to refresh tools
          toast.loading("Reconnecting to MCP server...", {
            id: "reconnect-server",
          });
          await connectMutation.mutateAsync(config.name);
          toast.success("Reconnected to MCP server", {
            id: "reconnect-server",
          });

          // Regenerate indexing config with updated tools
          await new Promise((resolve) => setTimeout(resolve, 1000));
          toast.loading("Regenerating indexing config...", {
            id: "generate-config",
          });
          await generateConfig.mutateAsync({
            serverName: config.name,
            displayName: config.name,
          });
          toast.success("Indexing config regenerated", {
            id: "generate-config",
          });

          setStep("indexing");
        } else {
          // Create new server
          toast.loading("Creating MCP server...", { id: "create-server" });
          await createMutation.mutateAsync(config);
          toast.success("MCP server created", { id: "create-server" });
          setIsCustomServerCreated(true);

          // Connect to the server to cache tools
          toast.loading("Connecting to MCP server...", {
            id: "connect-server",
          });
          await connectMutation.mutateAsync(config.name);
          toast.success("Connected to MCP server", { id: "connect-server" });

          // Wait a moment for tool caching to complete
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Generate indexing config using connected server's tools
          toast.loading("Generating indexing config...", {
            id: "generate-config",
          });
          await generateConfig.mutateAsync({
            serverName: config.name,
            displayName: config.name,
          });
          toast.success("Indexing config generated", { id: "generate-config" });

          setStep("indexing");
        }
      } catch (error) {
        console.error("Failed to setup custom server:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to setup custom server",
          { id: "setup-error" }
        );
        // Clean up if server was created but later steps failed
        if (isCustomServerCreated) {
          setIsCustomServerCreated(false);
        }
      }
    } else {
      // For preset services, go directly to review
      setStep("review");
    }
  };

  const handleIndexingNext = () => {
    setStep("review");
  };

  const handleFinalSubmit = async () => {
    if (!serverConfig) return;

    try {
      // 1. Create/update MCP server (skip for custom if already created)
      if (existingSource) {
        await updateMutation.mutateAsync({
          name: existingSource.name,
          config: serverConfig,
        });
      } else if (selectedPreset?.id !== "custom" || !isCustomServerCreated) {
        // Only create if not a custom server (already created in handleConfigureSubmit)
        await createMutation.mutateAsync(serverConfig);
      }

      // 2. Save indexing config if custom
      if (selectedPreset?.id === "custom" && generateConfig.data?.config) {
        await saveConfig.mutateAsync({
          config: generateConfig.data.config,
          status: "active",
        });
      }

      // 3. Trigger initial sync
      await syncConfig.mutateAsync({
        serverName: serverConfig.name,
        incremental: false,
      });

      // 4. Close wizard
      onClose();
      resetWizard();
    } catch (error) {
      console.error("Failed to save data source:", error);
    }
  };

  const resetWizard = () => {
    setStep("select");
    setSelectedPreset(null);
    setServerConfig(null);
    setIsCustomServerCreated(false);
    generateConfig.reset();
  };

  if (!isOpen) return null;

  const isLoading =
    createMutation.isPending ||
    updateMutation.isPending ||
    connectMutation.isPending ||
    generateConfig.isPending ||
    saveConfig.isPending ||
    syncConfig.isPending;

  return (
    <div
      className="fixed inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={() => !isLoading && onClose()}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {existingSource ? "Edit Data Source" : "Add Data Source"}
            </h2>
            {selectedPreset && step !== "select" && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {selectedPreset.displayName}
                {step === "indexing" && " • Generating Indexing Config"}
                {step === "review" && " • Review & Save"}
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
                onSubmit={handleConfigureSubmit}
                isLoading={isLoading}
              />
            )}

          {step === "configure" && selectedPreset?.id === "custom" && (
            <AdvancedConfigForm
              server={existingSource}
              onBack={handleBack}
              onSubmit={handleConfigureSubmit}
              isLoading={isLoading}
            />
          )}

          {step === "indexing" && generateConfig.data && (
            <IndexingStep
              generatedConfig={generateConfig.data}
              onBack={handleBack}
              onNext={handleIndexingNext}
              isLoading={isLoading}
            />
          )}

          {step === "review" && serverConfig && (
            <ReviewStep
              serverConfig={serverConfig}
              preset={selectedPreset}
              generatedConfig={generateConfig.data}
              onBack={handleBack}
              onSubmit={handleFinalSubmit}
              isLoading={isLoading}
            />
          )}
        </div>
      </div>
    </div>
  );
}
