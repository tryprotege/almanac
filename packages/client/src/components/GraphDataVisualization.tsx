import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Edge,
  Handle,
  MarkerType,
  MiniMap,
  Node,
  NodeTypes,
  Position,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { GraphDataResponse } from "../lib/api";
import { useTheme } from "../contexts/ThemeContext";

interface GraphDataVisualizationProps {
  graphData: GraphDataResponse;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

// Custom node component for actual graph nodes
function DataNode({ data }: { data: any }) {
  const getNodeColor = (type: string) => {
    const colors: Record<string, string> = {
      page: "bg-blue-500 dark:bg-blue-600",
      task: "bg-green-500 dark:bg-green-600",
      person: "bg-purple-500 dark:bg-purple-600",
      project: "bg-orange-500 dark:bg-orange-600",
      database: "bg-red-500 dark:bg-red-600",
      default: "bg-gray-500 dark:bg-gray-600",
    };
    return colors[type.toLowerCase()] || colors.default;
  };

  return (
    <>
      {/* Add handles for connections */}
      <Handle type="target" position={Position.Top} />
      <Handle type="target" position={Position.Left} />

      <div
        className={`px-4 py-3 ${getNodeColor(
          data.type
        )} text-white rounded-lg shadow-lg min-w-[120px] border-2 border-white dark:border-gray-700`}
      >
        <div className="font-semibold text-center text-sm mb-1">
          {data.title || data.id}
        </div>
        <div className="text-xs text-center opacity-80 border-t border-white/30 pt-1 mt-1">
          {data.type}
        </div>
      </div>

      <Handle type="source" position={Position.Right} />
      <Handle type="source" position={Position.Bottom} />
    </>
  );
}

const nodeTypes: NodeTypes = {
  dataNode: DataNode,
};

export function GraphDataVisualization({
  graphData,
  onLoadMore,
  hasMore = false,
}: GraphDataVisualizationProps) {
  const { theme } = useTheme();
  const [showAllNodes, setShowAllNodes] = useState(false);

  // Convert graph data to React Flow nodes and edges
  const { initialNodes, initialEdges, connectedNodeCount, totalNodeCount } =
    useMemo(() => {
      const nodes: Node[] = [];
      const edges: Edge[] = [];

      if (!graphData || !graphData.nodes) {
        return {
          initialNodes: [],
          initialEdges: [],
          connectedNodeCount: 0,
          totalNodeCount: 0,
        };
      }

      // First, identify which nodes have relationships
      const connectedNodeIds = new Set<string>();
      graphData.relationships.forEach((rel) => {
        connectedNodeIds.add(rel.sourceId);
        connectedNodeIds.add(rel.targetId);
      });

      // Filter to only show nodes that have relationships (unless showAllNodes is true)
      const nodesToShow = showAllNodes
        ? graphData.nodes
        : graphData.nodes.filter((node) => connectedNodeIds.has(node.id));

      // Create nodes with force-directed layout positions
      const nodeCount = nodesToShow.length;
      const radius = Math.min(300, 150 + nodeCount * 10);

      nodesToShow.forEach((node, index) => {
        const angle = (index / nodeCount) * 2 * Math.PI;
        const x = 400 + radius * Math.cos(angle);
        const y = 300 + radius * Math.sin(angle);

        nodes.push({
          id: node.id,
          type: "dataNode",
          position: { x, y },
          data: {
            id: node.id,
            title: node.title,
            type: node.type,
            label: node.label,
          },
        });
      });

      // Create edges for relationships
      graphData.relationships.forEach((rel, index) => {
        // Check if both source and target nodes exist
        const sourceExists = nodes.some((n) => n.id === rel.sourceId);
        const targetExists = nodes.some((n) => n.id === rel.targetId);

        if (sourceExists && targetExists) {
          // Handle null confidence values
          const confidence = rel.confidence ?? 0.5;
          const confidenceColor =
            confidence > 0.8
              ? "#10b981"
              : confidence > 0.5
              ? "#f59e0b"
              : "#ef4444";

          // Create label with or without confidence
          const label =
            rel.confidence !== null && rel.confidence !== undefined
              ? `${rel.type} (${Math.round(confidence * 100)}%)`
              : rel.type;

          edges.push({
            id: `${rel.sourceId}-${rel.targetId}-${index}`,
            source: rel.sourceId,
            target: rel.targetId,
            label,
            type: "default",
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: confidenceColor,
            },
            style: {
              stroke: confidenceColor,
              strokeWidth: 2,
            },
            labelStyle: {
              fill: theme === "dark" ? "#e5e7eb" : "#374151",
              fontWeight: 500,
              fontSize: 11,
            },
            labelBgStyle: {
              fill: theme === "dark" ? "#1f2937" : "#f3f4f6",
              fillOpacity: 0.9,
            },
            animated: rel.extractedBy === "llm",
          });
        }
      });

      return {
        initialNodes: nodes,
        initialEdges: edges,
        connectedNodeCount: graphData.nodes.filter((node) =>
          connectedNodeIds.has(node.id)
        ).length,
        totalNodeCount: graphData.nodes.length,
      };
    }, [graphData, theme, showAllNodes]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes and edges when initialNodes or initialEdges change
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    console.log("Node clicked:", node);
  }, []);

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 dark:bg-gray-900 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-300 mb-2">
            No graph data available
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Index some data to see nodes and relationships
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showAllNodes}
              onChange={(e) => setShowAllNodes(e.target.checked)}
              className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Show all nodes ({totalNodeCount})
            </span>
          </label>
        </div>

        {hasMore && onLoadMore && (
          <button onClick={onLoadMore} className="btn btn-secondary text-sm">
            Load More Data
          </button>
        )}
      </div>

      {/* Info Banner */}
      {!showAllNodes && connectedNodeCount < totalNodeCount && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <p className="text-blue-800 dark:text-blue-200 text-sm">
            <span className="font-semibold">Filtered View:</span> Showing only{" "}
            {connectedNodeCount} nodes with relationships. Toggle "Show all
            nodes" to see all {totalNodeCount} nodes.
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-4 text-sm flex-wrap">
        <div className="px-3 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
          <span className="font-semibold">
            {showAllNodes ? totalNodeCount : connectedNodeCount}
          </span>{" "}
          nodes displayed
        </div>
        {!showAllNodes && connectedNodeCount < totalNodeCount && (
          <div className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">
            {totalNodeCount - connectedNodeCount} isolated nodes hidden
          </div>
        )}
        <div className="px-3 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
          <span className="font-semibold">
            {graphData.relationships.length}
          </span>{" "}
          relationships
        </div>
        {hasMore && (
          <div className="px-3 py-2 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded">
            More data available
          </div>
        )}
      </div>

      {/* Graph Visualization */}
      <div className="w-full h-[600px] rounded-lg border">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          colorMode={theme}
        >
          <Background />
          <Controls />
          <MiniMap
            nodeColor={(node: Node) => {
              const type =
                (node.data.type as string)?.toLowerCase() || "default";
              const colors: Record<string, string> = {
                page: "#3b82f6",
                task: "#10b981",
                person: "#a855f7",
                project: "#f97316",
                database: "#ef4444",
                default: "#6b7280",
              };
              return colors[type] || colors.default;
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
          />
        </ReactFlow>
      </div>

      {/* Legend */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
          Legend
        </h3>
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-gray-600 dark:text-gray-300">
              High confidence (&gt;80%)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span className="text-gray-600 dark:text-gray-300">
              Medium confidence (50-80%)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-gray-600 dark:text-gray-300">
              Low confidence (&lt;50%)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-gray-600 dark:text-gray-300">~~~~~</div>
            <span className="text-gray-600 dark:text-gray-300">
              LLM-extracted
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
