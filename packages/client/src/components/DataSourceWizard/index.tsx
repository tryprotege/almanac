import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { Modal } from "../ui/Modal";
import { AdvancedConfigForm } from "../DataSourceForm/AdvancedConfigForm";
import {
  ServicePreset,
  getPresetById,
  CUSTOM_PRESET,
} from "../DataSourceForm/presets";
import { usePreset } from "../../hooks/usePresets";
import { IndexingStep } from "./IndexingStep";
import { ReviewStep } from "./ReviewStep";
import { ConfigChoiceStep } from "./ConfigChoiceStep";
import { ConfigImportStep } from "./ConfigImportStep";
import { OAuthStep } from "./OAuthStep";
import { GeneratingStep } from "./GeneratingStep";
import { SavingStep } from "./SavingStep";
import { DataSourceConfig } from "../../lib/api";
import {
  useCreateDataSource,
  useUpdateDataSource,
  useConnectDataSource,
} from "../../hooks/useDataSources";
import {
  useGenerateSyncConfig,
  useSaveSyncConfig,
  useSyncWithConfig,
  useSyncConfig,
} from "../../hooks/useSyncConfigs";
import toast from "react-hot-toast";

interface DataSourceWizardProps {
  isOpen: boolean;
  onClose: () => void;
  existingSource?: DataSourceConfig | null;
  presetId?: string | null;
}

type WizardStep =
  | "select"
  | "configure"
  | "oauth-auth"
  | "config-choice"
  | "generating"
  | "auto-generate"
  | "import"
  | "review"
  | "saving";

type SavingStepStatus =
  | "saving"
  | "activating"
  | "syncing"
  | "complete"
  | "error"
  | null;

export function DataSourceWizard({
  isOpen,
  onClose,
  existingSource,
  presetId,
}: DataSourceWizardProps) {
  const createMutation = useCreateDataSource(true); // silent mode
  const updateMutation = useUpdateDataSource(true); // silent mode
  const connectMutation = useConnectDataSource(true); // silent mode
  const generateConfig = useGenerateSyncConfig();
  const saveConfig = useSaveSyncConfig();
  const syncConfig = useSyncWithConfig();

  // Check if existing source has a sync config
  const existingConfig = useSyncConfig(existingSource?.name || null);

  // Load preset data if presetId is provided
  const { data: presetData } = usePreset(presetId || null);

  const [step, setStep] = useState<WizardStep>("select");
  const [selectedPreset, setSelectedPreset] = useState<ServicePreset | null>(
    null
  );
  const [serverConfig, setServerConfig] = useState<Omit<
    DataSourceConfig,
    "_id" | "createdAt" | "updatedAt"
  > | null>(null);
  const [isCustomServerCreated, setIsCustomServerCreated] = useState(false);
  const [importedConfig, setImportedConfig] = useState<any>(null);
  const [oauthCompleted, setOauthCompleted] = useState(false);
  const [savingStatus, setSavingStatus] = useState<SavingStepStatus>(null);
  const [savingError, setSavingError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && existingSource) {
      // Check if this is a preset-based source by looking for presetId
      const isPresetBased = !!existingSource.presetId;

      if (isPresetBased) {
        // Try to find the preset by presetId first, then fallback to name
        const preset = getPresetById(
          existingSource.presetId || existingSource.name
        );
        console.log(
          "DataSourceWizard: Editing preset-based source",
          existingSource.name,
          "preset:",
          preset?.id
        );
        setSelectedPreset(preset || CUSTOM_PRESET);
      } else {
        // This is a custom server - use CUSTOM_PRESET
        console.log(
          "DataSourceWizard: Editing custom source",
          existingSource.name
        );
        setSelectedPreset(CUSTOM_PRESET);
      }
      setStep("configure");
    } else if (isOpen && presetId && presetData) {
      // New source from marketplace preset
      console.log("DataSourceWizard: Creating from preset", presetId);
      // Create a preset object for the wizard
      const connection = presetData.data.connection;
      const preset: ServicePreset = {
        id: presetData.data.id,
        name: presetData.data.id,
        displayName: presetData.data.displayName,
        description: presetData.data.description,
        icon: Settings, // Use default icon since API returns string
        type: connection.type || "stdio",
        command: connection.command,
        args: connection.args,
        url: connection.url,
        requiredEnv: [], // Env vars will be handled by the form
        documentation: presetData.data.description,
        authGuide: presetData.data.description,
        setupSteps: [],
      };
      setSelectedPreset(preset);

      // Pre-populate with indexing config if available
      if (presetData.data.indexingConfig) {
        setImportedConfig(presetData.data.indexingConfig);
      }

      setStep("configure");
    } else if (isOpen && !existingSource && !presetId) {
      // New custom source - skip selector and go directly to custom config
      setSelectedPreset(CUSTOM_PRESET);
      setStep("configure");
    } else if (!isOpen) {
      // Reset when closing
      setStep("configure");
      setSelectedPreset(null);
      setServerConfig(null);
      setIsCustomServerCreated(false);
      setImportedConfig(null);
    }
  }, [existingSource, isOpen, presetId, presetData]);

  const handleBack = () => {
    if (step === "configure") {
      // Close the wizard - no selector step to go back to
      onClose();
    } else if (step === "oauth-auth") {
      setStep("configure");
    } else if (step === "config-choice") {
      setStep("configure");
    } else if (step === "generating") {
      setStep("config-choice");
    } else if (step === "auto-generate") {
      setStep("generating");
    } else if (step === "import") {
      setStep("config-choice");
    } else if (step === "review") {
      if (selectedPreset?.id === "custom") {
        setStep(importedConfig ? "import" : "auto-generate");
      } else {
        setStep("configure");
      }
    }
  };

  const handleConfigureSubmit = async (
    config: Omit<DataSourceConfig, "_id" | "createdAt" | "updatedAt">
  ) => {
    setServerConfig(config);

    // Add presetId to config for preset-based sources (not custom)
    const configWithPreset = {
      ...config,
      presetId:
        selectedPreset?.id !== "custom"
          ? presetId || selectedPreset?.id
          : undefined,
    };

    // If OAuth is required, create server first, then go to OAuth step
    if (config.authType === ("oauth" as const)) {
      try {
        // Create the server first
        toast.loading("Creating data source...", { id: "create-server" });
        const response = await createMutation.mutateAsync(configWithPreset);
        toast.success("Data source created", { id: "create-server" });
        setIsCustomServerCreated(true);

        // Now go to OAuth step
        setStep("oauth-auth");
      } catch (error) {
        console.error("Failed to create server:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to create server",
          { id: "create-error" }
        );
      }
      return;
    }

    // For custom servers, create and connect server first, then show config choice
    if (selectedPreset?.id === "custom") {
      try {
        // Check if we're editing an existing server
        if (existingSource) {
          // Update existing server (backend handles reconnection automatically)
          toast.loading("Updating data source...", { id: "update-server" });
          await updateMutation.mutateAsync({
            name: existingSource.name,
            config: configWithPreset,
          });
          toast.success("Data source updated", { id: "update-server" });

          // Backend PUT endpoint automatically reconnects if server was connected
          // Just wait a moment for reconnection to complete
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Check if server already has a sync config
          if (existingConfig.data) {
            // Server has existing config - just close wizard, no need to reconfigure
            toast.success(
              "Data source updated successfully. Your existing indexing configuration is unchanged.",
              {
                id: "update-success",
                duration: 4000,
              }
            );
            onClose();
            resetWizard();
            return;
          }

          // No existing config - show config choice for non-OAuth servers
          if (config.authType !== ("oauth" as const)) {
            setStep("config-choice");
          } else {
            // OAuth server - close wizard, user needs to complete OAuth first
            toast.success(
              "Data source updated. Complete OAuth authorization, then configure sync.",
              {
                id: "oauth-notice",
                duration: 5000,
              }
            );
            onClose();
            resetWizard();
            return; // Don't proceed to config-choice
          }
        } else {
          // Create new server
          toast.loading("Creating data source...", { id: "create-server" });
          await createMutation.mutateAsync(configWithPreset);
          toast.success("Data source created", { id: "create-server" });
          setIsCustomServerCreated(true);

          // Only auto-connect for non-OAuth servers
          // OAuth servers need to complete OAuth flow first
          if (config.authType !== ("oauth" as const)) {
            // Connect to the server to cache tools
            toast.loading("Connecting to data source...", {
              id: "connect-server",
            });
            await connectMutation.mutateAsync(config.name);
            toast.success("Connected to data source", { id: "connect-server" });

            // Wait a moment for tool caching to complete
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Show config choice
            setStep("config-choice");
          } else {
            // OAuth server - close wizard, user needs to complete OAuth first
            toast.success(
              "Data source created. Complete OAuth authorization, then configure sync.",
              {
                id: "oauth-notice",
                duration: 5000,
              }
            );
            onClose();
            resetWizard();
            return; // Don't proceed to config-choice
          }
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

  const handleChooseAutoGenerate = async () => {
    if (!serverConfig) return;

    // Immediately transition to generating step
    setStep("generating");

    try {
      // Generate indexing config using connected server's tools
      await generateConfig.mutateAsync({
        serverName: serverConfig.name,
        displayName: serverConfig.name,
      });

      // Move to results step
      setStep("auto-generate");
    } catch (error) {
      console.error("Failed to generate config:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to generate config",
        { id: "generate-error" }
      );
      // Stay on generating step to show error
    }
  };

  const handleChooseImport = () => {
    setStep("import");
  };

  const handleImportConfig = (config: any) => {
    setImportedConfig(config);
    setStep("review");
  };

  const handleAutoGenerateNext = () => {
    setStep("review");
  };

  const handleFinalSubmit = async () => {
    if (!serverConfig) return;

    // Immediately transition to saving step
    setStep("saving");
    setSavingStatus("saving");
    setSavingError(null);

    try {
      // Add presetId to config for preset-based sources (not custom)
      const configWithPreset = {
        ...serverConfig,
        presetId:
          selectedPreset?.id !== "custom"
            ? presetId || selectedPreset?.id
            : undefined,
      };

      // 1. Create/update MCP server (skip for custom if already created)
      if (existingSource) {
        await updateMutation.mutateAsync({
          name: existingSource.name,
          config: configWithPreset,
        });
      } else if (selectedPreset?.id !== "custom" || !isCustomServerCreated) {
        // Only create if not a custom server (already created in handleConfigureSubmit)
        await createMutation.mutateAsync(configWithPreset);
      }

      // 2. Save sync config if custom
      const configToSave = importedConfig || generateConfig.data?.config;
      if (selectedPreset?.id === "custom" && configToSave) {
        setSavingStatus("activating");
        await saveConfig.mutateAsync({
          config: configToSave,
          status: "active",
        });
      }

      // 3. Trigger initial sync in background (don't wait for completion)
      syncConfig.mutateAsync({
        serverName: serverConfig.name,
        incremental: false,
      });

      // 4. Show success message and close immediately
      setSavingStatus("complete");
      toast.success(
        `Data source saved! Initial sync is running in the background.`,
        { duration: 4000 }
      );

      setTimeout(() => {
        onClose();
        resetWizard();
      }, 1500);
    } catch (error) {
      console.error("Failed to save data source:", error);
      setSavingStatus("error");
      setSavingError(
        error instanceof Error ? error.message : "Failed to save data source"
      );
      toast.error(
        error instanceof Error ? error.message : "Failed to save data source"
      );
    }
  };

  const handleOAuthComplete = async (serverId: string) => {
    if (!serverConfig) return;

    try {
      // Connect to the server to cache tools
      toast.loading("Connecting to data source...", { id: "connect-server" });
      await connectMutation.mutateAsync(serverConfig.name);
      toast.success("Connected to data source", { id: "connect-server" });

      // Wait a moment for tool caching
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Proceed to config choice
      setStep("config-choice");
    } catch (error) {
      console.error("Failed to connect after OAuth:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to connect",
        { id: "connect-error" }
      );
    }
  };

  const resetWizard = () => {
    setStep("select");
    setSelectedPreset(null);
    setServerConfig(null);
    setIsCustomServerCreated(false);
    setImportedConfig(null);
    setOauthCompleted(false);
    setSavingStatus(null);
    setSavingError(null);
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

  // Build subtitle
  let subtitle = "";
  if (selectedPreset && step !== "select") {
    subtitle = selectedPreset.displayName;
    if (step === "config-choice") {
      subtitle += " • Choose Config Method";
    } else if (step === "generating") {
      subtitle += " • Generating Config";
    } else if (step === "auto-generate") {
      subtitle += " • Auto-Generate Config";
    } else if (step === "import") {
      subtitle += " • Import Config";
    } else if (step === "review") {
      subtitle += " • Review & Save";
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={existingSource ? "Edit Data Source" : "Add Data Source"}
      subtitle={subtitle || undefined}
      size="full"
      disableClose={isLoading}
    >
      {step === "configure" && selectedPreset && (
        <AdvancedConfigForm
          server={existingSource}
          preset={
            presetData
              ? {
                  id: presetData.data.id,
                  displayName: presetData.data.displayName,
                  connection: presetData.data.connection,
                  variables: presetData.data.variables,
                }
              : null
          }
          onBack={handleBack}
          onSubmit={handleConfigureSubmit}
          isLoading={isLoading}
        />
      )}

      {step === "oauth-auth" && serverConfig && (
        <OAuthStep
          serverConfig={serverConfig}
          onBack={handleBack}
          onComplete={handleOAuthComplete}
          isLoading={isLoading}
        />
      )}

      {/* Fallback for edge cases where no form is rendered */}
      {step === "configure" && !selectedPreset && (
        <div className="p-6 text-center text-text-tertiary">
          <p>Loading configuration...</p>
        </div>
      )}

      {step === "config-choice" && (
        <ConfigChoiceStep
          onBack={handleBack}
          onChooseAutoGenerate={handleChooseAutoGenerate}
          onChooseImport={handleChooseImport}
          isLoading={isLoading}
        />
      )}

      {step === "generating" && (
        <GeneratingStep
          isGenerating={generateConfig.isPending}
          error={
            generateConfig.isError
              ? generateConfig.error instanceof Error
                ? generateConfig.error.message
                : "Failed to generate config"
              : undefined
          }
          onBack={handleBack}
        />
      )}

      {step === "auto-generate" && generateConfig.data && (
        <IndexingStep
          generatedConfig={generateConfig.data}
          onBack={handleBack}
          onNext={handleAutoGenerateNext}
          isLoading={isLoading}
        />
      )}

      {step === "import" && (
        <ConfigImportStep
          onBack={handleBack}
          onSubmit={handleImportConfig}
          isLoading={isLoading}
        />
      )}

      {step === "review" && serverConfig && (
        <ReviewStep
          serverConfig={serverConfig}
          preset={selectedPreset}
          generatedConfig={generateConfig.data}
          importedConfig={importedConfig}
          onBack={handleBack}
          onSubmit={handleFinalSubmit}
          isLoading={isLoading}
        />
      )}

      {step === "saving" && serverConfig && (
        <SavingStep
          serverName={serverConfig.name}
          isCustomServer={selectedPreset?.id === "custom"}
          currentStep={savingStatus}
          error={savingError || undefined}
        />
      )}
    </Modal>
  );
}
