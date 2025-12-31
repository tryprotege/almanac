import { ArrowLeft, FileJson, Sparkles } from "lucide-react";

interface ConfigChoiceStepProps {
  onBack: () => void;
  onChooseAutoGenerate: () => void;
  onChooseImport: () => void;
  isLoading: boolean;
}

export function ConfigChoiceStep({
  onBack,
  onChooseAutoGenerate,
  onChooseImport,
  isLoading,
}: ConfigChoiceStepProps) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          How would you like to configure indexing?
        </h3>
        <p className="text-sm text-text-tertiary">
          Choose how to set up data synchronization for this MCP server
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Auto-Generate Option */}
        <button
          onClick={onChooseAutoGenerate}
          disabled={isLoading}
          className="group relative p-6 border-2 border-border-secondary rounded-lg hover:border-brand-purple hover:bg-brand-purple/5 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-brand-purple/10 text-brand-purple group-hover:bg-brand-purple/20 transition-colors">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h4 className="text-base font-semibold text-text-primary mb-2">
                🤖 Auto-Generate
                <span className="ml-2 text-xs font-normal text-brand-purple">
                  (Recommended)
                </span>
              </h4>
              <p className="text-sm text-text-secondary mb-3">
                Let AI analyze your MCP server and generate a configuration
                automatically.
              </p>
              <div className="text-xs text-text-tertiary space-y-1">
                <p>✓ Connects to your server</p>
                <p>✓ Analyzes available tools</p>
                <p>✓ Generates optimized config</p>
                <p className="mt-2 text-brand-purple">
                  Best for: New servers without existing configs
                </p>
              </div>
            </div>
          </div>
        </button>

        {/* Import Existing Option */}
        <button
          onClick={onChooseImport}
          disabled={isLoading}
          className="group relative p-6 border-2 border-border-secondary rounded-lg hover:border-brand-blue hover:bg-brand-blue/5 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-brand-blue/10 text-brand-blue group-hover:bg-brand-blue/20 transition-colors">
              <FileJson className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h4 className="text-base font-semibold text-text-primary mb-2">
                📝 Import Existing
              </h4>
              <p className="text-sm text-text-secondary mb-3">
                Paste or upload your pre-written sync config JSON file.
              </p>
              <div className="text-xs text-text-tertiary space-y-1">
                <p>✓ Skip LLM generation</p>
                <p>✓ Use your existing config</p>
                <p>✓ Real-time validation</p>
                <p className="mt-2 text-brand-blue">
                  ⚡ Instant - no AI wait time
                </p>
              </div>
            </div>
          </div>
        </button>
      </div>

      {/* Back Button */}
      <div className="flex items-center justify-between pt-4 border-t border-border-secondary">
        <button
          onClick={onBack}
          disabled={isLoading}
          className="btn btn-secondary flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>
    </div>
  );
}
