import { Database, FileJson, ArrowRight, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { useState } from 'react';

interface DataMappingTabProps {
  config: any;
}

export default function DataMappingTab({ config }: DataMappingTabProps) {
  const fetchers = config.fetchers || {};
  const recordTypes = config.recordTypes || {};
  const fetcherNames = Object.keys(fetchers);
  const [expandedFetchers, setExpandedFetchers] = useState<Set<string>>(new Set());

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
    return Object.values(recordTypes).filter((rt: any) => rt.fetcher === fetcherName);
  };

  if (fetcherNames.length === 0) {
    return (
      <div className="text-center py-12">
        <Database className="w-12 h-12 text-text-quaternary mx-auto mb-4" />
        <p className="text-text-tertiary">No data mapping configured</p>
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
            className="border border-border-secondary rounded-lg bg-bg-primary"
          >
            {/* Fetcher Header */}
            <button
              onClick={() => toggleFetcher(fetcherName)}
              className="w-full flex items-center justify-between p-4 hover:bg-bg-secondary rounded-lg transition-colors"
            >
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-brand-blue" />
                <div className="text-left">
                  <h3 className="font-semibold text-text-primary">{fetcherName}</h3>
                  <p className="text-sm text-text-tertiary">{fetcher.tool}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {fetcher.forEach && (
                  <span className="px-2 py-1 bg-brand-purple/10 border border-brand-purple/30 rounded text-xs text-brand-purple flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />
                    forEach
                  </span>
                )}
                <span className="px-2 py-1 bg-bg-secondary rounded text-xs text-text-secondary">
                  {recordTypesForFetcher.length} record type
                  {recordTypesForFetcher.length !== 1 ? 's' : ''}
                </span>
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-text-quaternary" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-text-quaternary" />
                )}
              </div>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="border-t border-border-secondary p-4 space-y-4">
                {/* forEach Configuration */}
                {fetcher.forEach && (
                  <div>
                    <h4 className="text-xs font-medium text-text-tertiary uppercase mb-2 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      Dynamic Iteration
                    </h4>
                    <div className="bg-brand-purple/5 border border-brand-purple/20 rounded-lg p-3 space-y-3">
                      {/* Data flow visualization */}
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-1 bg-brand-blue/10 border border-brand-blue/30 rounded text-brand-blue">
                          {fetcher.forEach.source}
                        </span>
                        <ArrowRight className="w-4 h-4 text-text-quaternary" />
                        <span className="px-2 py-1 bg-brand-success/10 border border-brand-success/30 rounded text-brand-success">
                          {fetcherName}
                        </span>
                        <span className="text-text-tertiary">
                          (1 call per{' '}
                          {fetcher.forEach.path === '$[*]' ? 'item' : fetcher.forEach.path})
                        </span>
                      </div>

                      {/* Parameter Mapping */}
                      <div>
                        <span className="text-xs text-text-secondary font-medium">
                          Param Mapping:
                        </span>
                        <div className="mt-1 bg-bg-tertiary rounded p-2">
                          <pre className="text-xs text-text-primary">
                            {JSON.stringify(fetcher.forEach.paramMapping, null, 2)}
                          </pre>
                        </div>
                      </div>

                      {/* Settings */}
                      <div className="flex gap-4 text-xs text-text-secondary">
                        <span>Concurrency: {fetcher.forEach.concurrency || 3}</span>
                        <span>Retries: {fetcher.forEach.retries || 2}</span>
                        {fetcher.forEach.continueOnError !== false && (
                          <span className="text-brand-success">✓ Continue on error</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Fetcher Details */}
                {fetcher.params && Object.keys(fetcher.params).length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-text-tertiary uppercase mb-2">
                      Parameters
                    </h4>
                    <div className="bg-bg-tertiary rounded-lg overflow-hidden">
                      <pre className="p-3 overflow-x-auto text-xs text-text-primary">
                        {JSON.stringify(fetcher.params, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Record Types */}
                <div>
                  <h4 className="text-xs font-medium text-text-tertiary uppercase mb-2">
                    Record Types
                  </h4>
                  <div className="space-y-3">
                    {recordTypesForFetcher.map((recordType: any) => {
                      const fields = recordType.fields || {};
                      const fieldNames = Object.keys(fields);

                      return (
                        <div key={recordType.name} className="bg-bg-secondary rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-3">
                            <FileJson className="w-4 h-4 text-brand-success" />
                            <span className="font-medium text-text-primary">{recordType.name}</span>
                            <span className="text-xs text-text-tertiary">
                              {fieldNames.length} fields
                            </span>
                          </div>

                          {/* Field Table */}
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead className="border-b border-border-secondary">
                                <tr>
                                  <th className="text-left py-2 pr-4 text-xs font-medium text-text-tertiary">
                                    Field
                                  </th>
                                  <th className="text-left py-2 pr-4 text-xs font-medium text-text-tertiary">
                                    Type
                                  </th>
                                  <th className="text-left py-2 text-xs font-medium text-text-tertiary">
                                    Source
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border-primary">
                                {fieldNames.map((fieldName) => {
                                  const field = fields[fieldName];
                                  const fieldType = field.type || 'unknown';
                                  let source = '';

                                  if (fieldType === 'path') {
                                    source = field.path;
                                  } else if (fieldType === 'paths') {
                                    source = (field.paths || []).join(', ');
                                  } else if (fieldType === 'template') {
                                    source = field.template;
                                  } else if (fieldType === 'processor') {
                                    source = `${field.processor}(${field.input})`;
                                  } else if (fieldType === 'code') {
                                    source = 'Custom code';
                                  }

                                  return (
                                    <tr key={fieldName}>
                                      <td className="py-2 pr-4 text-text-primary font-medium">
                                        {fieldName}
                                      </td>
                                      <td className="py-2 pr-4">
                                        <span className="px-2 py-0.5 bg-brand-blue/10 border border-brand-blue/30 rounded text-xs text-brand-blue">
                                          {fieldType}
                                        </span>
                                      </td>
                                      <td className="py-2 text-text-secondary">
                                        <code className="text-xs">{source}</code>
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
