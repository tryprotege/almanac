import { Loader2, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { usePersona } from "../hooks/usePersona";

const MAX_CHARS = 1000;
const DEBOUNCE_MS = 2000;

export function PersonaEditor() {
  const {
    persona,
    updatedAt,
    isLoading,
    updatePersona,
    deletePersona,
    isUpdating,
    isDeleting,
  } = usePersona();
  const [localPersona, setLocalPersona] = useState("");
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  // Initialize local state when persona loads
  useEffect(() => {
    if (persona !== undefined) {
      setLocalPersona(persona);
    }
  }, [persona]);

  const handleClear = useCallback(() => {
    setShowConfirmDelete(false);
    deletePersona();
    setLocalPersona("");
  }, [deletePersona]);

  const handleManualSave = useCallback(() => {
    if (localPersona !== persona) {
      updatePersona(localPersona);
    }
  }, [localPersona, persona, updatePersona]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60)
      return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  };

  if (isLoading) {
    return (
      <div className="card">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          <span className="ml-2 text-gray-600">Loading persona...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="w-full">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            👤 User Persona
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            Define your role and context to help eBee understand your data
            better
          </p>
        </div>
        {(isUpdating || isDeleting) && (
          <Loader2 className="w-5 h-5 animate-spin text-primary-600 dark:text-primary-400" />
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="persona" className="label">
            Your Persona
          </label>
          <textarea
            id="persona"
            className="textarea"
            rows={8}
            value={localPersona}
            onChange={(e) =>
              setLocalPersona(e.target.value.slice(0, MAX_CHARS))
            }
            placeholder="I am a [product manager] working on [SaaS products] at [TechCorp]. I collaborate with [engineering and design teams] and track [feature requests, bugs, and customer feedback] across [Notion, Slack, and Jira].

Key entities I care about:
- Features, Bugs, Customers
- Team members, Projects"
            disabled={isUpdating || isDeleting}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {localPersona.length}/{MAX_CHARS} characters
            </span>
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
            💡 Tips:
          </h4>
          <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
            <li>• Describe your role and responsibilities</li>
            <li>• Mention key entities and relationships you track</li>
            <li>• Include tools and workflows you use</li>
            <li>• Be specific about what matters most to you</li>
          </ul>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Last updated:{" "}
            <span className="font-medium">{formatDate(updatedAt)}</span>
          </div>
          <div className="flex gap-2">
            {localPersona && (
              <>
                {!showConfirmDelete ? (
                  <button
                    onClick={() => setShowConfirmDelete(true)}
                    className="btn btn-secondary flex items-center"
                    disabled={isUpdating || isDeleting}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowConfirmDelete(false)}
                      className="btn btn-secondary"
                      disabled={isDeleting}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleClear}
                      className="btn btn-danger flex items-center"
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 mr-2" />
                      )}
                      Confirm Clear
                    </button>
                  </div>
                )}
              </>
            )}
            {localPersona !== persona && (
              <button
                onClick={handleManualSave}
                className="btn btn-primary flex items-center"
                disabled={isUpdating || isDeleting}
              >
                {isUpdating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Now
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
