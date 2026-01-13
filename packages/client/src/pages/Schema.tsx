import { useState } from 'react';
import { Database, Network, RefreshCw, GitBranch } from 'lucide-react';
import { SchemaVisualization } from '../components/SchemaVisualization';
import { GraphDataVisualization } from '../components/GraphDataVisualization';
import { PageHeader } from '../components/ui/PageHeader';
import { useSchema } from '../hooks/useSchema';
import { useGraphData } from '../hooks/useGraphData';

type ViewMode = 'schema' | 'data';

export default function Schema() {
  const [viewMode, _setViewMode] = useState<ViewMode>('data');

  const { schema, isLoading, error, refetch } = useSchema();
  const {
    graphData,
    isLoading: isLoadingGraphData,
    error: graphDataError,
    refetch: refetchGraphData,
  } = useGraphData({
    enabled: viewMode === 'data',
    limit: 100,
    offset: 0,
  });

  return (
    <div className="pb-8 space-y-8">
      {/* Header */}
      <PageHeader
        title="Graph Schema"
        subtitle="Visualize and explore your knowledge graph structure"
      />
      {/* <button
          onClick={() => refetch()}
          className="btn btn-secondary flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button> */}

      {/* Schema Stats - Only show if schema exists */}
      {schema && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-brand-purple/10 rounded-lg">
                <Database className="w-6 h-6 text-brand-purple" />
              </div>
              <div>
                <p className="text-sm text-text-tertiary">Entity Types</p>
                <p className="text-2xl font-bold text-text-primary">{schema.entityTypes.length}</p>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-brand-blue/10 rounded-lg">
                <Network className="w-6 h-6 text-brand-blue" />
              </div>
              <div>
                <p className="text-sm text-text-tertiary">Relationship Types</p>
                <p className="text-2xl font-bold text-text-primary">
                  {schema.relationshipTypes.length}
                </p>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-brand-indigo/10 rounded-lg">
                <GitBranch className="w-6 h-6 text-brand-indigo" />
              </div>
              <div>
                <p className="text-sm text-text-tertiary">Schema Version</p>
                <p className="text-2xl font-bold text-text-primary">{schema.version}</p>
                {schema.lastLearnedAt && (
                  <p className="text-xs text-text-quaternary mt-1">
                    Last learned: {new Date(schema.lastLearnedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Mode Tabs */}
      <div className="card">
        {/* Schema View */}
        {viewMode === 'schema' && (
          <>
            {isLoading ? (
              <div className="flex items-center justify-center h-96">
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-brand-purple" />
                  <p className="text-text-secondary">Loading schema...</p>
                </div>
              </div>
            ) : error ? (
              <div className="bg-error-bg border border-error-border rounded-lg p-4">
                <p className="text-error-text font-medium">Error loading schema</p>
                <p className="text-error-text/80 text-sm mt-1">
                  {error instanceof Error ? error.message : 'Unknown error'}
                </p>
                <button onClick={() => refetch()} className="mt-3 btn btn-secondary text-sm">
                  Retry
                </button>
              </div>
            ) : !schema ? (
              <div className="bg-warning-bg border border-warning-border rounded-lg p-4">
                <p className="text-warning-text font-medium">No schema found</p>
                <p className="text-warning-text/80 text-sm mt-1">
                  Run schema learning to generate entity and relationship types
                </p>
              </div>
            ) : (
              <SchemaVisualization schema={schema} />
            )}
          </>
        )}

        {/* Graph Data View */}
        {viewMode === 'data' && (
          <>
            {isLoadingGraphData ? (
              <div className="flex items-center justify-center h-96">
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-brand-purple" />
                  <p className="text-text-secondary">Loading graph data...</p>
                </div>
              </div>
            ) : graphDataError ? (
              <div className="bg-error-bg border border-error-border rounded-lg p-4">
                <p className="text-error-text font-medium">Error loading graph data</p>
                <p className="text-error-text/80 text-sm mt-1">
                  {graphDataError instanceof Error ? graphDataError.message : 'Unknown error'}
                </p>
                <button
                  onClick={() => refetchGraphData()}
                  className="mt-3 btn btn-secondary text-sm"
                >
                  Retry
                </button>
              </div>
            ) : graphData ? (
              <GraphDataVisualization graphData={graphData} />
            ) : (
              <div className="flex items-center justify-center h-96 bg-bg-secondary rounded-lg border-2 border-dashed border-border-secondary">
                <div className="text-center">
                  <p className="text-text-secondary mb-2">No graph data available</p>
                  <p className="text-sm text-text-tertiary">
                    Index some data to see nodes and relationships
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Entity Types List - Only show if schema exists and in schema view */}
      {schema && viewMode === 'schema' && (
        <div className="card">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            Entity Types ({schema.entityTypes.length})
          </h2>
          {schema.entityTypes.length === 0 ? (
            <p className="text-text-tertiary text-sm">No entity types defined</p>
          ) : (
            <div className="space-y-3">
              {schema.entityTypes.map((entityType) => (
                <div
                  key={entityType.name}
                  className="p-4 bg-bg-secondary rounded-lg border border-border-secondary"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-text-primary">{entityType.name}</h3>
                      <p className="text-sm text-text-secondary mt-1">{entityType.description}</p>
                      {entityType.properties && entityType.properties.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-text-tertiary font-medium">Properties:</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {entityType.properties.map((prop) => (
                              <span
                                key={prop}
                                className="px-2 py-0.5 bg-bg-primary border border-border-secondary rounded text-xs text-text-secondary"
                              >
                                {prop}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {entityType.mcpSource && (
                      <span className="px-2 py-1 bg-brand-purple/10 text-brand-purple text-xs rounded">
                        {entityType.mcpSource}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Relationship Types List - Only show if schema exists and in schema view */}
      {schema && viewMode === 'schema' && (
        <div className="card">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            Relationship Types ({schema.relationshipTypes.length})
          </h2>
          {schema.relationshipTypes.length === 0 ? (
            <p className="text-text-tertiary text-sm">No relationship types defined</p>
          ) : (
            <div className="space-y-3">
              {schema.relationshipTypes.map((relType) => (
                <div
                  key={relType.name}
                  className="p-4 bg-bg-secondary rounded-lg border border-border-secondary"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-text-primary">
                        {relType.name}
                        {relType.bidirectional && (
                          <span className="ml-2 text-xs text-brand-purple">↔ Bidirectional</span>
                        )}
                      </h3>
                      <p className="text-sm text-text-secondary mt-1">{relType.description}</p>
                      <div className="mt-2 flex items-center gap-2 text-sm">
                        <span className="text-text-tertiary">From:</span>
                        <div className="flex flex-wrap gap-1">
                          {relType.sourceTypes.map((type) => (
                            <span
                              key={type}
                              className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded text-xs"
                            >
                              {type}
                            </span>
                          ))}
                        </div>
                        <span className="text-text-tertiary">→ To:</span>
                        <div className="flex flex-wrap gap-1">
                          {relType.targetTypes.map((type) => (
                            <span
                              key={type}
                              className="px-2 py-0.5 bg-brand-success/10 text-brand-success rounded text-xs"
                            >
                              {type}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {relType.mcpSource && (
                      <span className="px-2 py-1 bg-brand-purple/10 text-brand-purple text-xs rounded">
                        {relType.mcpSource}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
