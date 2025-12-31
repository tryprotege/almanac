import {
  Database,
  FileJson,
  Settings,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";

interface DataMappingTabProps {
  config: any;
}

export default function DataMappingTab({ config }: DataMappingTabProps) {
  const fetchers = config.fetchers || {};
  const recordTypes = config.recordTypes || {};
  const fetcherNames = Object.keys(fetchers);
  const [expandedFetchers, setExpandedFetchers] = useState<Set<string>>(
    new Set()
  );

  const toggleFetcher = (fetcherName: string) => {
    const newExpanded = new Set(expandedFetchers);
    if (newExpanded.has(fetcherName)) {
      newExpanded.delete(fetcherName);
    } else {
      newExpanded.add(fetcherName);
    }
    setExpandedFetchers(newExpanded);
  };

  const getRecordTypesForFetcher = (fetcherName: string) => {
    return Object.values(recordTypes).filter(
      (rt: any) => rt.fetcher === fetcherName
    );
  };

  if (fetcherNames.length === 0) {
    return (
      <div className="text-center py-12">
        <Database className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-300">
          No data mapping configured
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {fetcherNames.map((fetcherName) => {
        const fetcher = fetchers[fetcherName];
        const isExpanded = expandedFetchers.has(fetcherName);
        const recordTypesForFetcher = getRecordTypesForFetcher(fetcherName);

        return (
          <div
            key={fetcherName}
            className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
          >
            {/* Fetcher Header */}
            <button
              onClick={() => toggleFetcher(fetcherName)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div className="text-left">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {fetcherName}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {fetcher.tool}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {fetcher.forEach && (
                  <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700 rounded text-xs text-purple-700 dark:text-purple-300 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />
                    forEach
                  </span>
                )}
                <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-300">
                  {recordTypesForFetcher.length} record type
                  {recordTypesForFetcher.length !== 1 ? "s" : ""}
                </span>
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                )}
              </div>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-4">
                {/* forEach Configuration */}
                {fetcher.forEach && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      Dynamic Iteration
                    </h4>
                    <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3 space-y-3">
                      {/* Data flow visualization */}
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded text-blue-700 dark:text-blue-300">
                          {fetcher.forEach.source}
                        </span>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                        <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded text-green-700 dark:text-green-300">
                          {fetcherName}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          (1 call per{" "}
                          {fetcher.forEach.path === "$[*]"
                            ? "item"
                            : fetcher.forEach.path}
                          )
                        </span>
                      </div>

                      {/* Parameter Mapping */}
                      <div>
                        <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                          Param Mapping:
                        </span>
                        <div className="mt-1 bg-gray-900 rounded p-2">
                          <pre className="text-xs text-gray-100">
                            {JSON.stringify(
                              fetcher.forEach.paramMapping,
                              null,
                              2
                            )}
                          </pre>
                        </div>
                      </div>

                      {/* Settings */}
                      <div className="flex gap-4 text-xs text-gray-600 dark:text-gray-400">
                        <span>
                          Concurrency: {fetcher.forEach.concurrency || 3}
                        </span>
                        <span>Retries: {fetcher.forEach.retries || 2}</span>
                        {fetcher.forEach.continueOnError !== false && (
                          <span className="text-green-600 dark:text-green-400">
                            ✓ Continue on error
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Fetcher Details */}
                {fetcher.params && Object.keys(fetcher.params).length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                      Parameters
                    </h4>
                    <div className="bg-gray-900 rounded-lg overflow-hidden">
                      <pre className="p-3 overflow-x-auto text-xs text-gray-100">
                        {JSON.stringify(fetcher.params, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Record Types */}
                <div>
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                    Record Types
                  </h4>
                  <div className="space-y-3">
                    {recordTypesForFetcher.map((recordType: any) => {
                      const fields = recordType.fields || {};
                      const fieldNames = Object.keys(fields);

                      return (
                        <div
                          key={recordType.name}
                          className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3"
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <FileJson className="w-4 h-4 text-green-600 dark:text-green-400" />
                            <span className="font-medium text-gray-900 dark:text-white">
                              {recordType.name}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {fieldNames.length} fields
                            </span>
                          </div>

                          {/* Field Table */}
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead className="border-b border-gray-200 dark:border-gray-700">
                                <tr>
                                  <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400">
                                    Field
                                  </th>
                                  <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400">
                                    Type
                                  </th>
                                  <th className="text-left py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                                    Source
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {fieldNames.map((fieldName) => {
                                  const field = fields[fieldName];
                                  const fieldType = field.type || "unknown";
                                  let source = "";

                                  if (fieldType === "path") {
                                    source = field.path;
                                  } else if (fieldType === "paths") {
                                    source = (field.paths || []).join(", ");
                                  } else if (fieldType === "template") {
                                    source = field.template;
                                  } else if (fieldType === "processor") {
                                    source = `${field.processor}(${field.input})`;
                                  } else if (fieldType === "code") {
                                    source = "Custom code";
                                  }

                                  return (
                                    <tr key={fieldName}>
                                      <td className="py-2 pr-4 text-gray-900 dark:text-white font-medium">
                                        {fieldName}
                                      </td>
                                      <td className="py-2 pr-4">
                                        <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded text-xs text-blue-700 dark:text-blue-300">
                                          {fieldType}
                                        </span>
                                      </td>
                                      <td className="py-2 text-gray-600 dark:text-gray-400">
                                        <code className="text-xs">
                                          {source}
                                        </code>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
