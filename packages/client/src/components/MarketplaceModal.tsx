import { AlertCircle, Check, Loader2, Package } from "lucide-react";
import { Modal } from "./ui/Modal";
import { usePresets } from "../hooks/usePresets";
import { useDataSources } from "../hooks/useDataSources";
import { IconDisplay } from "./ui/IconDisplay";
import type { PresetSummary } from "../lib/api";

interface MarketplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (presetId: string) => void;
}

export function MarketplaceModal({
  isOpen,
  onClose,
  onSelectPreset,
}: MarketplaceModalProps) {
  const { data: presets, isLoading, error } = usePresets();
  const { servers } = useDataSources();

  // Check if a preset is already connected
  const isPresetConnected = (presetId: string): boolean => {
    return servers.some((server) => server.name === presetId);
  };

  const handleSelectPreset = (presetId: string) => {
    onSelectPreset(presetId);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Marketplace"
      subtitle="Connect to popular data sources"
      size="full"
    >
      <div className="p-6">
        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-brand-purple animate-spin" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="card bg-error-bg border-error-border">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-error-text flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-error-text">
                  Error loading presets
                </h3>
                <p className="mt-1 text-sm text-error-text/80">
                  {error instanceof Error ? error.message : "Unknown error"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && (!presets || presets.data.length === 0) && (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-text-quaternary mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">
              No Presets Available
            </h3>
            <p className="text-text-tertiary">
              No marketplace presets are currently available
            </p>
          </div>
        )}

        {/* Presets Grid */}
        {!isLoading && !error && presets && presets.data.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {presets.data.map((preset: PresetSummary) => {
              const isConnected = isPresetConnected(preset.id);
              return (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset.id)}
                  className="card hover:border-brand-purple hover:shadow-lg transition-all text-left p-6 group relative"
                >
                  {/* Connected Badge */}
                  {isConnected && (
                    <div className="absolute top-3 right-3">
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/20 border border-green-500/30">
                        <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                        <span className="text-xs font-medium text-green-700 dark:text-green-300">
                          Connected
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="flex-shrink-0">
                      {preset.icon ? (
                        <IconDisplay icon={preset.icon} className="w-12 h-12" />
                      ) : (
                        <Package className="w-12 h-12 text-text-quaternary" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-20">
                      <h3 className="text-lg font-semibold text-text-primary mb-1 group-hover:text-brand-purple transition-colors">
                        {preset.displayName}
                      </h3>
                      <p className="text-sm text-text-tertiary line-clamp-2">
                        {preset.description}
                      </p>
                    </div>
                  </div>

                  {/* Connect indicator */}
                  <div className="mt-4 pt-4 border-t border-border-primary">
                    <span className="text-sm font-medium text-brand-purple group-hover:underline">
                      {isConnected ? "Manage →" : "Connect →"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
