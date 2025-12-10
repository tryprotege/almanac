import { LucideIcon } from "lucide-react";
import { ServicePreset, getAllPresets } from "./presets";

interface ServiceSelectorProps {
  onSelect: (preset: ServicePreset) => void;
}

export function ServiceSelector({ onSelect }: ServiceSelectorProps) {
  const presets = getAllPresets();

  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        Select MCP Service
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
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
            ? "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 cursor-not-allowed opacity-60"
            : "border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-400 hover:shadow-lg bg-white dark:bg-gray-800"
        }
      `}
    >
      {isComingSoon && (
        <span className="absolute top-2 right-2 px-2 py-1 text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
          Coming Soon
        </span>
      )}

      <div className="flex items-start gap-4">
        <div
          className={`
          p-3 rounded-lg
          ${
            isComingSoon
              ? "bg-gray-200 dark:bg-gray-700"
              : "bg-primary-100 dark:bg-primary-900/30"
          }
        `}
        >
          <Icon
            className={`w-6 h-6 ${
              isComingSoon
                ? "text-gray-400 dark:text-gray-600"
                : "text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30"
            }`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
            {preset.displayName}
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {preset.description}
          </p>
        </div>
      </div>
    </button>
  );
}
