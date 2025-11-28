import { Database, Network, RefreshCw } from "lucide-react";
import { SchemaVisualization } from "../components/SchemaVisualization";
import { useSchema } from "../hooks/useSchema";

export default function Schema() {
  const { schema, isLoading, error, refetch } = useSchema();

  if (isLoading) {
    return (
      <div className=" bg-gray-50 dark:bg-gray-900 px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center h-96">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-primary-600 dark:text-primary-400" />
            <p className="text-gray-600 dark:text-gray-300">
              Loading schema...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className=" bg-gray-50 dark:bg-gray-900 px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200 font-medium">
            Error loading schema
          </p>
          <p className="text-red-600 dark:text-red-300 text-sm mt-1">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-3 btn btn-secondary text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!schema) {
    return (
      <div className=" bg-gray-50 dark:bg-gray-900 px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-yellow-800 dark:text-yellow-200 font-medium">
            No schema found
          </p>
          <p className="text-yellow-600 dark:text-yellow-300 text-sm mt-1">
            Run schema learning to generate entity and relationship types
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className=" bg-gray-50 dark:bg-gray-900 px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Graph Schema
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mt-1">
            Visualize and explore your knowledge graph structure
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="btn btn-secondary flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Schema Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <Database className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Entity Types
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {schema.entityTypes.length}
              </p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Network className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Relationship Types
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {schema.relationshipTypes.length}
              </p>
            </div>
          </div>
        </div>
        <div className="card">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Schema Version
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {schema.version}
            </p>
            {schema.lastLearnedAt && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Last learned:{" "}
                {new Date(schema.lastLearnedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Graph Visualization */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Interactive Graph
        </h2>
        <SchemaVisualization schema={schema} />
      </div>

      {/* Entity Types List */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Entity Types ({schema.entityTypes.length})
        </h2>
        {schema.entityTypes.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No entity types defined
          </p>
        ) : (
          <div className="space-y-3">
            {schema.entityTypes.map((entityType) => (
              <div
                key={entityType.name}
                className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {entityType.name}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      {entityType.description}
                    </p>
                    {entityType.properties &&
                      entityType.properties.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                            Properties:
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {entityType.properties.map((prop) => (
                              <span
                                key={prop}
                                className="px-2 py-0.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs text-gray-700 dark:text-gray-300"
                              >
                                {prop}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                  {entityType.mcpSource && (
                    <span className="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs rounded">
                      {entityType.mcpSource}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Relationship Types List */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Relationship Types ({schema.relationshipTypes.length})
        </h2>
        {schema.relationshipTypes.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No relationship types defined
          </p>
        ) : (
          <div className="space-y-3">
            {schema.relationshipTypes.map((relType) => (
              <div
                key={relType.name}
                className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {relType.name}
                      {relType.bidirectional && (
                        <span className="ml-2 text-xs text-purple-600 dark:text-purple-400">
                          ↔ Bidirectional
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      {relType.description}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        From:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {relType.sourceTypes.map((type) => (
                          <span
                            key={type}
                            className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs"
                          >
                            {type}
                          </span>
                        ))}
                      </div>
                      <span className="text-gray-500 dark:text-gray-400">
                        → To:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {relType.targetTypes.map((type) => (
                          <span
                            key={type}
                            className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs"
                          >
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {relType.mcpSource && (
                    <span className="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs rounded">
                      {relType.mcpSource}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
