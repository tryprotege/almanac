import { Request, Response, Router } from "express";
import { env } from "../../env.js";
import { GraphStore } from "../../stores/graph.store.js";
import { connectMemgraph } from "../../connections/memgraph.js";
import logger from "../../utils/logger.js";

const graphRouter: Router = Router();

// Initialize graph store
let graphStore: GraphStore | null = null;

const getGraphStore = async (): Promise<GraphStore> => {
  if (!graphStore) {
    const memgraph = await connectMemgraph();
    graphStore = new GraphStore(memgraph);
  }
  return graphStore;
};

// GET /api/graph/data - Get all nodes and relationships from Memgraph
graphRouter.get("/data", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;
    const nodeTypes = req.query.nodeTypes
      ? (req.query.nodeTypes as string).split(",")
      : undefined;
    const relationshipTypes = req.query.relationshipTypes
      ? (req.query.relationshipTypes as string).split(",")
      : undefined;

    const store = await getGraphStore();
    const result = await store.getAllGraphData({
      limit,
      offset,
      nodeTypes,
      relationshipTypes,
    });

    res.json({
      success: true,
      data: {
        nodes: result.nodes,
        relationships: result.relationships,
        stats: {
          totalNodes: result.totalNodes,
          totalRelationships: result.totalRelationships,
          hasMore:
            offset + limit < result.totalNodes ||
            offset + limit < result.totalRelationships,
        },
      },
    });
  } catch (err) {
    logger.error({ err }, "Error fetching graph data");
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export { graphRouter };
