import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
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
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Filter, RefreshCw, Info } from 'lucide-react';
import { GraphDataResponse } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';

interface GraphDataVisualizationProps {
  graphData: GraphDataResponse;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onRefresh?: () => void;
}

// Custom node component for actual graph nodes
function DataNode({ data }: { data: any }) {
  const getNodeColor = (type: string) => {
    const colors: Record<string, string> = {
      page: 'bg-brand-blue',
      task: 'bg-brand-success',
      person: 'bg-brand-purple',
      project: 'bg-brand-warning',
      database: 'bg-brand-error',
      default: 'bg-text-tertiary',
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
          data.type,
        )} text-white rounded-lg shadow-lg min-w-[120px] border-2 border-bg-primary`}
      >
        <div className="font-semibold text-center text-sm mb-1">{data.title || data.id}</div>
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

function GraphDataVisualizationInner({
  graphData,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  onRefresh,
}: GraphDataVisualizationProps) {
  const { theme } = useTheme();
  const { fitView } = useReactFlow();
  const [showAllNodes, setShowAllNodes] = useState(true); // Show all nodes by default
  const [selectedNodeTypes, setSelectedNodeTypes] = useState<string[]>([]);
  const [showTypeFilter, setShowTypeFilter] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);

  // Get unique node types for filter
  const availableNodeTypes = useMemo(() => {
    if (!graphData || !graphData.nodes) return [];
    const types = new Set(graphData.nodes.map((n) => n.type));
    return Array.from(types).sort();
  }, [graphData]);

  // Click outside handler for filter dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as HTMLElement)) {
        setShowTypeFilter(false);
      }
      if (legendRef.current && !legendRef.current.contains(event.target as HTMLElement)) {
        setShowLegend(false);
      }
    };

    if (showTypeFilter || showLegend) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showTypeFilter, showLegend]);

  // Convert graph data to React Flow nodes and edges
  const { initialNodes, initialEdges, connectedNodeCount, totalNodeCount } = useMemo(() => {
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

    // Filter by visibility (show all or only connected)
    let nodesToShow = showAllNodes
      ? graphData.nodes
      : graphData.nodes.filter((node) => connectedNodeIds.has(node.id));

    // Filter by selected node types
    if (selectedNodeTypes.length > 0) {
      nodesToShow = nodesToShow.filter((node) => selectedNodeTypes.includes(node.type));
    }

    // Create nodes with force-directed layout positions
    const nodeCount = nodesToShow.length;
    const radius = Math.min(300, 150 + nodeCount * 10);

    nodesToShow.forEach((node, index) => {
      const angle = (index / nodeCount) * 2 * Math.PI;
      const x = 400 + radius * Math.cos(angle);
      const y = 300 + radius * Math.sin(angle);

      nodes.push({
        id: node.id,
        type: 'dataNode',
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
          confidence > 0.8 ? '#10b981' : confidence > 0.5 ? '#f59e0b' : '#ef4444';

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
          type: 'default',
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
            fill: theme === 'dark' ? '#e5e7eb' : '#374151',
            fontWeight: 500,
            fontSize: 11,
          },
          labelBgStyle: {
            fill: theme === 'dark' ? '#1f2937' : '#f3f4f6',
            fillOpacity: 0.9,
          },
          animated: rel.extractedBy === 'llm',
        });
      }
    });

    return {
      initialNodes: nodes,
      initialEdges: edges,
      connectedNodeCount: graphData.nodes.filter((node) => connectedNodeIds.has(node.id)).length,
      totalNodeCount: graphData.nodes.length,
    };
  }, [graphData, theme, showAllNodes, selectedNodeTypes]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes and edges when initialNodes or initialEdges change
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    console.log('Node clicked:', node);
  }, []);

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-bg-secondary rounded-lg border-2 border-dashed border-border-secondary">
        <div className="text-center">
          <p className="text-text-secondary mb-2">No graph data available</p>
          <p className="text-sm text-text-tertiary">
            Index some data to see nodes and relationships
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap p-3 bg-bg-secondary rounded-lg border border-border-secondary">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Preview Badge */}
          <div className="px-2.5 py-1 bg-brand-blue/10 text-brand-blue rounded-md border border-brand-blue/20">
            <span className="text-sm font-medium">Preview (First 100 nodes)</span>
          </div>

          {/* Node Type Filter */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowTypeFilter(!showTypeFilter)}
              className="btn btn-ghost btn-sm flex items-center gap-2"
            >
              <Filter className="w-4 h-4" />
              Filter
              {selectedNodeTypes.length > 0 && (
                <span className="px-1.5 py-0.5 bg-brand-purple text-white rounded-full text-xs">
                  {selectedNodeTypes.length}
                </span>
              )}
            </button>

            {showTypeFilter && (
              <div
                className="absolute top-full left-0 mt-1 bg-bg-primary border border-border-primary rounded-lg shadow-lg p-2 z-10 min-w-[160px]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-xs font-semibold text-text-secondary mb-2 px-2">
                  Node Types
                </div>
                {availableNodeTypes.map((type) => (
                  <label
                    key={type}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-bg-hover rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedNodeTypes.includes(type)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedNodeTypes([...selectedNodeTypes, type]);
                        } else {
                          setSelectedNodeTypes(selectedNodeTypes.filter((t) => t !== type));
                        }
                      }}
                      className="w-3 h-3 text-brand-purple bg-bg-secondary border-border-secondary rounded"
                    />
                    <span className="text-xs text-text-secondary">{type}</span>
                  </label>
                ))}
                {selectedNodeTypes.length > 0 && (
                  <button
                    onClick={() => setSelectedNodeTypes([])}
                    className="w-full mt-2 text-xs text-brand-purple hover:underline"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Stats Badges */}
          <div className="flex gap-2 text-xs">
            <div className="px-2 py-1 bg-brand-blue/10 text-brand-blue rounded">
              <span className="font-semibold">
                {showAllNodes ? totalNodeCount : connectedNodeCount}
              </span>{' '}
              nodes
            </div>
            {!showAllNodes && connectedNodeCount < totalNodeCount && (
              <div className="px-2 py-1 bg-bg-primary text-text-tertiary rounded">
                {totalNodeCount - connectedNodeCount} hidden
              </div>
            )}
            <div className="px-2 py-1 bg-brand-purple/10 text-brand-purple rounded">
              <span className="font-semibold">{graphData.relationships.length}</span> edges
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Legend Tooltip */}
          <div className="relative" ref={legendRef}>
            <button
              onClick={() => setShowLegend(!showLegend)}
              className="btn btn-ghost btn-sm"
              title="Show legend"
            >
              <Info className="w-4 h-4" />
            </button>

            {showLegend && (
              <div className="absolute top-full right-0 mt-1 bg-bg-primary border border-border-primary rounded-lg shadow-lg p-3 z-10 min-w-[240px]">
                <h4 className="text-xs font-semibold text-text-primary mb-2">Legend</h4>
                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: '#10b981' }}
                    ></div>
                    <span className="text-text-secondary">High confidence ({'>'}80%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: '#f59e0b' }}
                    ></div>
                    <span className="text-text-secondary">Medium confidence (50-80%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: '#ef4444' }}
                    ></div>
                    <span className="text-text-secondary">Low confidence ({'<'}50%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-text-secondary">~~~~~</div>
                    <span className="text-text-secondary">LLM-extracted</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {onRefresh && (
            <button onClick={onRefresh} className="btn btn-ghost btn-sm" title="Refresh graph data">
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          {hasMore && onLoadMore && (
            <button
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className={`btn btn-secondary btn-sm ${isLoadingMore ? 'btn-loading' : ''}`}
            >
              {isLoadingMore ? 'Loading...' : 'Load More'}
            </button>
          )}
        </div>
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
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(node: Node) => {
              const type = (node.data.type as string)?.toLowerCase() || 'default';
              const colors: Record<string, string> = {
                page: '#3b82f6',
                task: '#10b981',
                person: '#a855f7',
                project: '#f97316',
                database: '#ef4444',
                default: '#6b7280',
              };
              return colors[type] || colors.default;
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}

// Wrapper component to provide ReactFlow context
export function GraphDataVisualization(props: GraphDataVisualizationProps) {
  return (
    <ReactFlowProvider>
      <GraphDataVisualizationInner {...props} />
    </ReactFlowProvider>
  );
}
