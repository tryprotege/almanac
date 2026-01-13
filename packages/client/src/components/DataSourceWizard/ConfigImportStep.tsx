import { AlertCircle, ArrowLeft, CheckCircle, Upload } from 'lucide-react';
import { useState } from 'react';

interface ConfigImportStepProps {
  onBack: () => void;
  onSubmit: (config: any) => void;
  isLoading: boolean;
}

export function ConfigImportStep({ onBack, onSubmit, isLoading }: ConfigImportStepProps) {
  const [jsonText, setJsonText] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);

  const validateJSON = (text: string) => {
    if (!text.trim()) {
      setValidationError(null);
      setIsValid(false);
      return;
    }

    try {
      const parsed = JSON.parse(text);

      // Basic validation - check for required fields
      if (!parsed.fetchers || typeof parsed.fetchers !== 'object') {
        setValidationError("Config must have a 'fetchers' object");
        setIsValid(false);
        return;
      }

      if (!parsed.recordTypes || typeof parsed.recordTypes !== 'object') {
        setValidationError("Config must have a 'recordTypes' object");
        setIsValid(false);
        return;
      }

      // If we get here, basic validation passed
      setValidationError(null);
      setIsValid(true);
    } catch (error) {
      if (error instanceof SyntaxError) {
        setValidationError(`Invalid JSON: ${error.message}`);
      } else {
        setValidationError('Invalid JSON format');
      }
      setIsValid(false);
    }
  };

  const handleTextChange = (text: string) => {
    setJsonText(text);
    validateJSON(text);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      handleTextChange(text);
    };
    reader.readAsText(file);
  };

  const handleSubmit = () => {
    if (!isValid) return;

    try {
      const config = JSON.parse(jsonText);
      onSubmit(config);
    } catch (error) {
      console.error('Failed to parse JSON:', error);
    }
  };

  const exampleConfig = {
    fetchers: {
      example_fetcher: {
        tool: 'example_tool',
        recordType: 'example_record',
        params: {},
      },
    },
    recordTypes: {
      example_record: {
        idField: 'id',
        fields: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
      },
    },
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">Import Sync Configuration</h3>
        <p className="text-sm text-text-tertiary">
          Paste your sync config JSON below or upload a JSON file
        </p>
      </div>

      {/* File Upload */}
      <div>
        <label
          htmlFor="config-file-upload"
          className="btn btn-secondary inline-flex items-center gap-2 cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          Upload JSON File
        </label>
        <input
          id="config-file-upload"
          type="file"
          accept=".json"
          onChange={handleFileUpload}
          className="hidden"
        />
        <p className="mt-2 text-xs text-text-quaternary">Or paste your JSON config below</p>
      </div>

      {/* JSON Textarea */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Sync Config JSON
        </label>
        <textarea
          value={jsonText}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={JSON.stringify(exampleConfig, null, 2)}
          className="w-full h-96 px-3 py-2 bg-bg-tertiary border border-border-secondary rounded-lg font-mono text-sm text-text-primary placeholder:text-text-quaternary focus:outline-none focus:ring-2 focus:ring-brand-purple resize-none"
          spellCheck={false}
        />

        {/* Validation Feedback */}
        {validationError && (
          <div className="mt-3 p-3 bg-brand-error/10 border border-brand-error/30 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-brand-error flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-brand-error">Validation Error</h4>
              <p className="mt-1 text-sm text-brand-error/80">{validationError}</p>
            </div>
          </div>
        )}

        {isValid && (
          <div className="mt-3 p-3 bg-brand-success/10 border border-brand-success/30 rounded-lg flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-brand-success flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-brand-success">Valid Configuration</h4>
              <p className="mt-1 text-sm text-brand-success/80">
                Your config passed basic validation and is ready to use
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Example Link */}
      <div className="bg-brand-blue/10 border border-brand-blue/30 rounded-lg p-4">
        <h4 className="text-sm font-medium text-brand-blue mb-2">Need an example?</h4>
        <p className="text-xs text-text-secondary mb-2">
          A sync config must have <code className="text-brand-purple">fetchers</code> and{' '}
          <code className="text-brand-purple">recordTypes</code> objects.
        </p>
        <button
          type="button"
          onClick={() => handleTextChange(JSON.stringify(exampleConfig, null, 2))}
          className="text-xs text-brand-blue hover:text-brand-blue/80 underline"
        >
          Load example config
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-border-secondary">
        <button
          onClick={onBack}
          disabled={isLoading}
          className="btn btn-secondary flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={!isValid || isLoading}
          className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue with Config
        </button>
      </div>
    </div>
  );
}
