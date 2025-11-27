import { MemgraphRepository } from "../../repositories/memgraph.repository.js";
import { MongoRepository } from "../../repositories/mongo.repository.js";
import {
  SearchResult,
  ExpandedResult,
} from "../../contracts/search.contracts.js";

export interface GraphExpansionOptions {
  maxDepth?: number; // Traversal depth (1 or 2 recommended)
  relationshipTypes?: string[]; // Filter specific relationship types
  maxRelated?: number; // Max related items per result
  minConfidence?: number; // Minimum relationship confidence (0-1)
}

/**
 * Graph Expansion Service (Graph RAG)
 * Enriches search results with knowledge graph relationships
 */
export class GraphExpansionService {
  constructor(
    private memgraph: MemgraphRepository,
    private mongo: MongoRepository
  ) {}

  /**
   * Expand search results with graph relationships
   *
   * Implementation steps:
   * 1. For each search result, query graph for relationships
   * 2. Score related nodes by relationship confidence
   * 3. Calculate graph connectivity score
   * 4. Return expanded results
   */
  async expand(
    workspaceId: string,
    results: SearchResult[],
    options: GraphExpansionOptions = {}
  ): Promise<ExpandedResult[]> {
    const maxRelated = options.maxRelated || 10;
    const minConfidence = options.minConfidence || 0.5;

    console.log(`[GraphExpansion] Expanding ${results.length} results`);

    const expanded: ExpandedResult[] = [];

    for (const result of results) {
      try {
        // Get relationships from Memgraph
        const relationships = await this.memgraph.getNodeRelationships(
          workspaceId,
          result.id,
          {
            direction: "both",
            relationshipTypes: options.relationshipTypes,
          }
        );

        // Filter by confidence and take top N
        const topRelated = relationships
          .filter((r) => r.relationship.confidence >= minConfidence)
          .sort((a, b) => b.relationship.confidence - a.relationship.confidence)
          .slice(0, maxRelated);

        // Calculate graph score
        const graphScore = this.calculateGraphScore(relationships);

        expanded.push({
          ...result,
          relatedResources: topRelated.map((r) => ({
            id: r.relatedNode.id,
            relationshipType: r.relationship.type,
            confidence: r.relationship.confidence,
            title: r.relatedNode.title,
            type: r.relatedNode.type,
          })),
          graphScore,
        });
      } catch (error) {
        console.error(
          `[GraphExpansion] Failed to expand result ${result.id}:`,
          error
        );
        // Return result without graph expansion on error
        expanded.push({
          ...result,
          relatedResources: [],
          graphScore: 0,
        });
      }
    }

    console.log(`[GraphExpansion] Added graph context to all results`);
    return expanded;
  }

  /**
   * Calculate graph connectivity score
   * Higher score = more connected node = potentially more important
   */
  private calculateGraphScore(relationships: any[]): number {
    if (relationships.length === 0) return 0;

    // Score based on:
    // 1. Number of connections (normalized)
    const countScore = Math.min(relationships.length / 10, 1.0);

    // 2. Average relationship confidence
    const avgConfidence =
      relationships.reduce((sum, r) => sum + r.relationship.confidence, 0) /
      relationships.length;

    // 3. Diversity of relationship types
    const uniqueTypes = new Set(relationships.map((r) => r.relationship.type));
    const diversityScore = Math.min(uniqueTypes.size / 5, 1.0);

    // Weighted combination
    return countScore * 0.4 + avgConfidence * 0.4 + diversityScore * 0.2;
  }

  /**
   * Find paths between two nodes (for connection discovery)
   */
  async findConnections(
    workspaceId: string,
    sourceId: string,
    targetId: string,
    maxDepth: number = 3
  ): Promise<any[]> {
    return this.memgraph.findPaths(workspaceId, sourceId, targetId, {
      maxDepth,
    });
  }

  /**
   * Get common connections between multiple nodes
   * Useful for finding "bridge" documents
   */
  async findCommonConnections(
    workspaceId: string,
    nodeIds: string[]
  ): Promise<string[]> {
    if (nodeIds.length === 0) return [];

    // Get all relationships for each node
    const allRelationships = await Promise.all(
      nodeIds.map((id) =>
        this.memgraph.getNodeRelationships(workspaceId, id, {
          direction: "both",
        })
      )
    );

    // Find common related node IDs
    const relatedNodeSets = allRelationships.map(
      (rels) => new Set(rels.map((r) => r.relatedNode.id))
    );

    if (relatedNodeSets.length === 0) return [];

    // Find intersection of all sets
    const commonIds = Array.from(relatedNodeSets[0]).filter((id) =>
      relatedNodeSets.every((set) => set.has(id))
    );

    return commonIds;
  }
}
