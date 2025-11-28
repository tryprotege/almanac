import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Edge,
  MarkerType,
  MiniMap,
  Node,
  NodeTypes,
  Position,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { SchemaData } from "../lib/api";
import { useTheme } from "../contexts/ThemeContext";

interface SchemaVisualizationProps {
  schema: SchemaData;
}

// Custom node component for entity types
function EntityNode({ data }: { data: any }) {
  return (
    <div className="px-4 py-3 bg-white dark:bg-gray-800 border-2 border-primary-500 dark:border-primary-400 rounded-lg shadow-md min-w-[150px]">
      <div className="font-semibold text-gray-900 dark:text-white text-center mb-1">
        {data.label}
      </div>
      {data.description && (
        <div className="text-xs text-gray-600 dark:text-gray-300 text-center border-t border-gray-200 dark:border-gray-600 pt-1 mt-1">
          {data.description.length > 50
            ? data.description.substring(0, 50) + "..."
            : data.description}
        </div>
      )}
      {data.properties && data.properties.length > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">
          {data.properties.length} properties
        </div>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  entityType: EntityNode,
};

export function SchemaVisualization({ schema }: SchemaVisualizationProps) {
  const { theme } = useTheme();

  // Convert schema data to React Flow nodes and edges
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Create a node for each entity type
    schema.entityTypes.forEach((entityType, index) => {
      const angle = (index / schema.entityTypes.length) * 2 * Math.PI;
      const radius = 300;
      const x = 400 + radius * Math.cos(angle);
      const y = 300 + radius * Math.sin(angle);

      nodes.push({
        id: entityType.name,
        type: "entityType",
        position: { x, y },
        data: {
          label: entityType.name,
          description: entityType.description,
          properties: entityType.properties,
          mcpSource: entityType.mcpSource,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
    });

    // Create edges for each relationship type
    schema.relationshipTypes.forEach((relType, index) => {
      relType.sourceTypes.forEach((sourceType) => {
        relType.targetTypes.forEach((targetType) => {
          // Check if both nodes exist
          const sourceExists = nodes.some((n) => n.id === sourceType);
          const targetExists = nodes.some((n) => n.id === targetType);

          if (sourceExists && targetExists) {
            edges.push({
              id: `${sourceType}-${relType.name}-${targetType}-${index}`,
              source: sourceType,
              target: targetType,
              label: relType.name,
              type: relType.bidirectional ? "default" : "default",
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 20,
                height: 20,
              },
              markerStart: relType.bidirectional
                ? {
                    type: MarkerType.ArrowClosed,
                    width: 20,
                    height: 20,
                  }
                : undefined,
              style: { stroke: "#6b7280", strokeWidth: 2 },
              labelStyle: { fill: "#374151", fontWeight: 500 },
              labelBgStyle: { fill: "#f3f4f6" },
              animated: false,
            });
          }
        });
      });
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [schema]);

  const [nodes, _setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, _setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    console.log("Node clicked:", node);
    // You can add modal or detail view here
  }, []);

  if (schema.entityTypes.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 dark:bg-gray-900 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-300 mb-2">
            No schema data available
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Run schema learning to generate entity and relationship types
          </p>
        </div>
      </div>
    );
  }

  return (
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
          nodeColor={(_node: Node) => {
            return "#3b82f6";
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>
    </div>
  );
}
