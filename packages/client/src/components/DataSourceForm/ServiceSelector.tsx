import { LucideIcon } from "lucide-react";
import { ServicePreset, getAllPresets } from "./presets";

interface ServiceSelectorProps {
  onSelect: (preset: ServicePreset) => void;
}

export function ServiceSelector({ onSelect }: ServiceSelectorProps) {
  const presets = getAllPresets();

  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold text-text-primary mb-2">
        Select MCP Service
      </h3>
      <p className="text-sm text-text-tertiary mb-6">
        Choose a service to connect or configure a custom server
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {presets.map((preset) => (
          <ServiceCard
            key={preset.id}
            preset={preset}
            onSelect={() => onSelect(preset)}
          />
        ))}
      </div>
    </div>
  );
}

interface ServiceCardProps {
  preset: ServicePreset;
  onSelect: () => void;
}

function ServiceCard({ preset, onSelect }: ServiceCardProps) {
  const Icon: LucideIcon = preset.icon;
  const isComingSoon = preset.comingSoon;

  return (
    <button
      onClick={onSelect}
      disabled={isComingSoon}
      className={`
        relative p-6 rounded-lg border-2 text-left transition-all
        ${
          isComingSoon
            ? "border-border-secondary bg-bg-secondary cursor-not-allowed opacity-60"
            : "border-border-secondary hover:border-brand-purple hover:shadow-lg bg-bg-primary"
        }
      `}
    >
      {isComingSoon && (
        <span className="absolute top-2 right-2 px-2 py-1 text-xs font-medium bg-bg-active text-text-tertiary rounded">
          Coming Soon
        </span>
      )}

      <div className="flex items-start gap-4">
        <div
          className={`
          p-3 rounded-lg
          ${isComingSoon ? "bg-bg-active" : "bg-brand-purple/10"}
        `}
        >
          <Icon
            className={`w-6 h-6 ${
              isComingSoon ? "text-text-quaternary" : "text-brand-purple"
            }`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-text-primary mb-1">
            {preset.displayName}
          </h4>
          <p className="text-sm text-text-tertiary line-clamp-2">
            {preset.description}
          </p>
        </div>
      </div>
    </button>
  );
}
